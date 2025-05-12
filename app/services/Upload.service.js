const fs = require("fs");
const csv = require("fast-csv");
const db = require("../config/db.config");
const { Op } = require("sequelize");

const CHUNK_SIZE = 100000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const BATCH_DELAY = 1000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class UploadService {
  static async processFileInChunks(filePath, jobId) {
    console.log(`[INFO] Starting file processing: ${filePath}`);
    const job = await db.uploadJob.findByPk(jobId);
    if (!job) throw new Error("Job not found");

    const startTime = Date.now();

    try {
      // Read all records first
      const records = await new Promise((resolve, reject) => {
        const results = [];
        csv.parseFile(filePath, { headers: true })
          .on("data", (data) => {
            const { id, ...recordData } = data;
            results.push(recordData);
          })
          .on("end", () => resolve(results))
          .on("error", reject);
      });

      const totalRecords = records.length;
      console.log(`[INFO] Total records in file: ${totalRecords}`);
      await job.update({ total_records: totalRecords });

      let processedRecords = 0;
      let duplicateCount = 0;
      let uniqueCount = 0;

      // Process in chunks
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        console.log(`[INFO] Processing chunk of ${chunk.length} records`);
        
        // Find existing domains
        const domains = chunk.map(record => record.domain);
        const existingRecords = await db.blacklist.findAll({
          where: { domain: { [Op.in]: domains } }
        });
        
        const existingDomains = new Set(existingRecords.map(r => r.domain));
        
        // Filter out duplicates
        const newRecords = chunk.filter(record => !existingDomains.has(record.domain));
        const chunkDuplicates = chunk.length - newRecords.length;
        duplicateCount += chunkDuplicates;
        
        if (chunkDuplicates > 0) {
          console.log(`[INFO] Found ${chunkDuplicates} duplicate domains in chunk`);
        }
        
        // Count all records as processed
        processedRecords += chunk.length;
        
        if (newRecords.length > 0) {
          // Process each record individually
          for (const record of newRecords) {
            try {
              await db.blacklist.create(record);
              uniqueCount++;
            } catch (error) {
              if (error.name === 'SequelizeUniqueConstraintError') {
                duplicateCount++;
              } else {
                console.error(`[ERROR] Error inserting record: ${error.message}`);
                throw error;
              }
            }
          }
          
          console.log(`[INFO] Successfully processed ${newRecords.length} new records`);
        }
        
        // Update job status after each chunk
        await job.update({
          processed_records: processedRecords,
          unique_domains: uniqueCount,
          duplicate_domains: duplicateCount
        });
      }

      // Verify final count
      const finalCount = await db.blacklist.count();
      console.log(`[INFO] Final database count: ${finalCount}`);

      // Calculate processing time in seconds
      const endTime = Date.now();
      const processingTime = (endTime - startTime) / 1000; // Convert to seconds

      // Update final job status
      await job.update({
        status: "completed",
        processed_records: processedRecords,
        unique_domains: uniqueCount,
        duplicate_domains: duplicateCount,
        processing_time: processingTime,
        error_message: duplicateCount > 0 ? `Skipped ${duplicateCount} duplicate records` : null
      });

      console.log(`[INFO] File processing completed: ${filePath}`);
      console.log(`[INFO] Total records processed: ${processedRecords}`);
      console.log(`[INFO] Unique domains stored: ${uniqueCount}`);
      console.log(`[INFO] Duplicate records skipped: ${duplicateCount}`);
      console.log(`[INFO] Processing time: ${processingTime.toFixed(2)} seconds`);

    } catch (error) {
      console.error(`[ERROR] Final Processing Error: ${error.message}`);
      await job.update({
        status: "failed",
        error_message: error.message
      });
      throw error;
    } finally {
      // Clean up the file
      try {
        fs.unlinkSync(filePath);
        console.log(`[INFO] Cleaned up file: ${filePath}`);
      } catch (error) {
        console.error(`[ERROR] Failed to clean up file: ${error.message}`);
      }
    }
  }

  static async processMultipleFiles(files) {
    const jobs = [];
    
    for (const file of files) {
      const job = await db.uploadJob.create({
        filename: file.filename,
        status: 'pending'
      });
      
      jobs.push(job);
      
      // Process each file in the background
      setImmediate(() => {
        this.processFileInChunks(file.path, job.id)
          .catch(error => {
            console.error(`Error processing file ${file.filename}:`, error);
          });
      });
    }
    
    return jobs;
  }

  static async getJobStatus(jobId) {
    return await db.uploadJob.findByPk(jobId);
  }

  static async retryFailedJob(jobId) {
    const job = await db.uploadJob.findByPk(jobId);
    if (!job) throw new Error("Job not found");
    
    if (job.status !== "failed") {
      throw new Error("Can only retry failed jobs");
    }
    
    await job.update({
      status: "pending",
      error_message: null,
      retry_count: db.sequelize.literal('retry_count + 1')
    });
    
    // Process the file again
    setImmediate(() => {
      this.processFileInChunks(job.filename, job.id)
        .catch(error => {
          console.error('Error retrying job:', error);
        });
    });
    
    return job;
  }
}

module.exports = UploadService; 