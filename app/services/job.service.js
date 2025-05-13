const fs = require("fs");
const csv = require("fast-csv");
const db = require("../config/db.config");
const { Op, Transaction } = require("sequelize");

const CHUNK_SIZE = 10000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const BATCH_DELAY = 2000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class UploadService {
  constructor() {
    // No need to pass io in constructor anymore
  }

  async processChunkWithRetry(chunk, initialCount, jobId, startTime, totalRecords, processedRecords) {
    let retries = 0;
    while (retries < MAX_RETRIES) {
      const transaction = await db.sequelize.transaction({
        isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
      });

      try {
        // Get existing domains within transaction
        const domains = chunk.map(record => record.domain);
        const existingRecords = await db.blacklist.findAll({
          where: { domain: { [Op.in]: domains } },
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        const existingDomains = new Set(existingRecords.map(r => r.domain));

        // Filter out duplicates
        const newRecords = chunk.filter(record => !existingDomains.has(record.domain));
        const duplicateCount = chunk.length - newRecords.length;
        
        if (newRecords.length > 0) {
          // Insert new records with transaction
          await db.blacklist.bulkCreate(newRecords, {
            transaction,
            ignoreDuplicates: true
          });
        }

        // Commit transaction
        await transaction.commit();

        // Update processed records
        processedRecords += chunk.length;

        // Get current database state
        const currentCount = await db.blacklist.count();
        const uniqueDomains = currentCount - initialCount;
        const duplicateDomains = processedRecords - uniqueDomains;

        // Update job status
        const progress = (processedRecords / totalRecords) * 100;
        const processingTime = (Date.now() - startTime) / 1000;
        
        await db.uploadJob.update(
          {
            processed_records: processedRecords,
            unique_domains: uniqueDomains,
            duplicate_domains: duplicateDomains,
            processing_time: processingTime,
            status: processedRecords === totalRecords ? 'completed' : 'processing'
          },
          { where: { id: jobId } }
        );

        // Emit progress update using global io
        if (global.io) {
          console.log("[INFO] Emitting progress update:", progress);
          global.io.emit('uploadProgress', {
            jobId,
            progress,
            processedRecords,
            totalRecords,
            uniqueDomains,
            duplicateDomains,
            processingTime
          });
        }

        return { processedRecords, uniqueDomains, duplicateDomains };

      } catch (error) {
        await transaction.rollback();
        
        if (error.name === 'SequelizeDatabaseError' && error.parent?.code === '40P01') {
          retries++;
          console.log(`[WARN] Deadlock detected, retrying chunk (attempt ${retries}/${MAX_RETRIES})`);
          await sleep(RETRY_DELAY * retries); // Exponential backoff
          continue;
        }
        
        throw error;
      }
    }
    
    throw new Error(`Failed to process chunk after ${MAX_RETRIES} retries due to deadlocks`);
  }

  async processFileInChunks(filePath, jobId) {
    console.log("[INFO] Starting file processing:", filePath);
    let totalRecords = 0;
    let processedRecords = 0;
    let totalDuplicates = 0;
    const startTime = Date.now();

    try {
      // First pass: count total records
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv.parse({ headers: true }))
          .on("data", () => totalRecords++)
          .on("end", () => {
            console.log("[INFO] Total records in file:", totalRecords);
            resolve();
          })
          .on("error", reject);
      });

      // Get initial count
      const initialCount = await db.blacklist.count();
      console.log("[INFO] Initial blacklist count:", initialCount);

      // Update job with total records
      await db.uploadJob.update(
        { total_records: totalRecords },
        { where: { id: jobId } }
      );

      // Second pass: process records
      const records = [];
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv.parse({ headers: true }))
          .on("data", (data) => {
            records.push(data);
          })
          .on("end", resolve)
          .on("error", reject);
      });

      // Process in chunks
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        
        try {
          const result = await this.processChunkWithRetry(
            chunk,
            initialCount,
            jobId,
            startTime,
            totalRecords,
            processedRecords
          );
          
          processedRecords = result.processedRecords;
          totalDuplicates = result.duplicateDomains;
          
          // Add delay between chunks
          await sleep(BATCH_DELAY);
          
        } catch (error) {
          console.error("[ERROR] Error processing chunk:", error.message);
          throw error;
        }
      }

      // Get final counts
      const finalCount = await db.blacklist.count();
      const finalUniqueDomains = finalCount - initialCount;
      const finalDuplicateDomains = totalRecords - finalUniqueDomains;

      console.log("[INFO] Initial blacklist count:", initialCount);
      console.log("[INFO] Final blacklist count:", finalCount);
      console.log("[INFO] Unique domains inserted:", finalUniqueDomains);
      console.log("[INFO] Duplicate domains skipped:", finalDuplicateDomains);

      // Prepare completion message
      let completionMessage = `Successfully processed ${totalRecords} records | `;
      if (finalDuplicateDomains > 0) {
        completionMessage += `${finalDuplicateDomains} duplicate domains were skipped | `;
      }
      completionMessage += `${finalUniqueDomains} new domains were added to the database`;

      // Final update
      const finalProcessingTime = (Date.now() - startTime) / 1000;
      await db.uploadJob.update(
        {
          status: 'completed',
          processing_time: finalProcessingTime,
          total_records: totalRecords,
          processed_records: processedRecords,
          unique_domains: finalUniqueDomains,
          duplicate_domains: finalDuplicateDomains,
          error_message: completionMessage
        },
        { where: { id: jobId } }
      );

      // Clean up file
      fs.unlink(filePath, (err) => {
        if (err) console.error("[ERROR] Error deleting file:", err);
        else console.log("[INFO] Cleaned up file:", filePath);
      });

    } catch (error) {
      console.error("[ERROR] Final Processing Error:", error.message);
      
      // Prepare error message
      let errorMessage = `Error processing file: ${error.message}. `;
      if (error.name === 'SequelizeUniqueConstraintError') {
        errorMessage += "This might be due to duplicate domains in the file.";
      } else if (error.name === 'SequelizeValidationError') {
        errorMessage += "Some records failed validation. Please check the data format.";
      } else if (error.name === 'SequelizeConnectionError') {
        errorMessage += "Database connection error. Please try again.";
      } else if (error.name === 'SequelizeDatabaseError' && error.parent?.code === '40P01') {
        errorMessage += "Database deadlock detected. Please try again.";
      }

      // Update job status to failed
      await db.uploadJob.update(
        {
          status: 'failed',
          error_message: errorMessage,
          processing_time: (Date.now() - startTime) / 1000
        },
        { where: { id: jobId } }
      );

      // Clean up file
      fs.unlink(filePath, (err) => {
        if (err) console.error("[ERROR] Error deleting file:", err);
        else console.log("[INFO] Cleaned up file:", filePath);
      });

      throw error;
    }
  }

  async processMultipleFiles(files) {
    const jobs = [];
    for (const file of files) {
      const job = await db.uploadJob.create({
        filename: file.filename,
        status: 'pending'
      });
      jobs.push(job);
      
      // Process each file in the background
      this.processFileInChunks(file.path, job.id)
        .catch(error => {
          console.error('Error processing file:', error);
        });
    }
    return jobs;
  }

  async getJobStatus(jobId) {
    return await db.uploadJob.findByPk(jobId);
  }

  async getAllJobs() {
    return await db.uploadJob.findAll({
      order: [['createdAt', 'DESC']],
      attributes: [
        'id',
        'filename',
        'status',
        'total_records',
        'processed_records',
        'unique_domains',
        'duplicate_domains',
        'processing_time',
        'error_message',
        'createdAt',
        'updatedAt'
      ]
    });
  }

  async retryFailedJob(jobId) {
    const job = await db.uploadJob.findByPk(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    if (job.status !== 'failed') {
      throw new Error('Only failed jobs can be retried');
    }

    // Reset job status
    await job.update({
      status: 'pending',
      processed_records: 0,
      unique_domains: 0,
      duplicate_domains: 0,
      processing_time: 0,
      error_message: null
    });

    // Retry processing
    return this.processFileInChunks(job.filename, job.id);
  }
}

module.exports = UploadService; 