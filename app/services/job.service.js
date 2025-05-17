const fs = require("fs");
const csv = require("fast-csv");
const db = require("../config/db.config");
const { Op, Transaction } = require("sequelize");
const readline = require('readline');

const CHUNK_SIZE = 10000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const BATCH_DELAY = 2000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class UploadService {
  constructor() {
    // No need to pass io in constructor anymore
  }

  async findHeaderLine(filePath) {
    return new Promise((resolve, reject) => {
      const rl = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity
      });

      let lineNumber = 0;
      let headerLine = 0;
      let maxColumns = 0;
      let headerColumns = [];
      let allLines = [];

      rl.on('line', (line) => {
        lineNumber++;
        const columns = line.split(',').length;
        allLines.push({ lineNumber, line, columns });
        
        // Update max columns if this line has more columns
        if (columns > maxColumns) {
          maxColumns = columns;
        }
      });

      rl.on('close', () => {
        // Find the line with the most columns that contains header indicators
        const headerLineInfo = allLines.find(({ line, columns }) => 
          columns === maxColumns && (
            line.toLowerCase().includes('domain') || 
            line.toLowerCase().includes('url') || 
            line.toLowerCase().includes('website')
          )
        );

        if (headerLineInfo) {
          headerLine = headerLineInfo.lineNumber;
          headerColumns = headerLineInfo.line.split(',').map(col => col.trim());
        } else {
          // If no suitable header found, use the line with the most columns
          const maxLine = allLines.find(({ columns }) => columns === maxColumns);
          headerLine = maxLine ? maxLine.lineNumber : 1;
          headerColumns = Array.from({ length: maxColumns }, (_, i) => `column${i + 1}`);
        }

        console.log(`[INFO] Found header at line ${headerLine} with ${maxColumns} columns`);
        console.log(`[INFO] Headers:`, headerColumns);
        resolve({ headerLine, maxColumns, headerColumns });
      });

      rl.on('error', (error) => {
        reject(error);
      });
    });
  }

  async validateAndParseCSV(filePath) {
    return new Promise(async (resolve, reject) => {
      try {
        // Find the header line and column count
        const { headerLine, maxColumns, headerColumns } = await this.findHeaderLine(filePath);
        const records = [];

        fs.createReadStream(filePath)
          .pipe(csv.parse({ 
            headers: headerColumns,
            skipRows: headerLine - 1,
            strictColumnHandling: false,
            trim: true,
            skipEmptyLines: true,
            ignoreEmpty: true,
            maxRows: 0, // No limit on rows
            transform: (row) => {
              // Ensure all rows have the same number of columns
              const columns = Object.keys(row).length;
              if (columns < maxColumns) {
                // Pad missing columns with empty values
                for (let i = columns; i < maxColumns; i++) {
                  row[`column${i + 1}`] = '';
                }
              } else if (columns > maxColumns) {
                // Truncate extra columns
                const newRow = {};
                headerColumns.forEach((header, index) => {
                  newRow[header] = row[header] || '';
                });
                return newRow;
              }

              // Convert hit_count to integer if it exists
              if (row.hit_count !== undefined) {
                row.hit_count = parseInt(row.hit_count) || 0;
              }

              return row;
            }
          }))
          .on('headers', (headers) => {
            console.log("[INFO] Using headers:", headers);
          })
          .on('data', (data) => {
            // Skip if this is the header row
            if (Object.values(data).some(val => val === 'hit_count' || val === 'id' || val === 'name' || val === 'domain')) {
              return;
            }

            // If domain is not in the first column, try to find it
            if (!data.domain) {
              const domainKey = Object.keys(data).find(key => 
                key.toLowerCase().includes('domain') || 
                key.toLowerCase().includes('url') ||
                key.toLowerCase().includes('website')
              );
              if (domainKey) {
                data.domain = data[domainKey];
              } else {
                // If no domain column found, use the first non-empty column
                const firstValue = Object.values(data).find(val => val && val.trim() !== '');
                if (firstValue) {
                  data.domain = firstValue;
                }
              }
            }
            if (data.domain) {
              records.push(data);
            }
          })
          .on('end', () => {
            console.log("[INFO] Successfully parsed CSV file");
            resolve(records);
          })
          .on('error', (error) => {
            console.error("[ERROR] CSV Parsing Error:", error);
            reject(new Error(`CSV parsing error: ${error.message}`));
          });
      } catch (error) {
        reject(error);
      }
    });
  }

  async processChunkWithRetry(chunk, jobId, startTime, totalRecords, processedRecords, initialCount) {
    let retries = 0;
    while (retries < MAX_RETRIES) {
      const transaction = await db.sequelize.transaction({
        isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
      });

      try {
        // Get ALL existing domains within transaction
        const domains = chunk.map(record => record.domain).filter(Boolean);
        if (domains.length === 0) {
          console.log("[WARN] No valid domains found in chunk");
          await transaction.commit();
          return { processedRecords, uniqueDomains: 0, duplicateDomains: chunk.length };
        }

        const existingRecords = await db.blacklist.findAll({
          where: { domain: { [Op.in]: domains } },
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        const existingDomains = new Set(existingRecords.map(r => r.domain));

        // Filter out duplicates and remove id column
        const newRecords = chunk
          .filter(record => record.domain && !existingDomains.has(record.domain))
          .map(({ id, ...record }) => record); // Remove id column from each record
        
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
            processingTime,
            status: processedRecords === totalRecords ? 'completed' : 'processing'
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
    const startTime = Date.now();

    try {
      // Parse CSV file
      const records = await this.validateAndParseCSV(filePath);
      totalRecords = records.length;
      console.log("[INFO] Total records in file:", totalRecords);

      // Get initial count for this job
      const initialCount = await db.blacklist.count();
      console.log("[INFO] Initial blacklist count:", initialCount);

      // Update job with total records
      await db.uploadJob.update(
        { total_records: totalRecords },
        { where: { id: jobId } }
      );

      // Process in chunks
      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        const chunk = records.slice(i, i + CHUNK_SIZE);
        
        try {
          const result = await this.processChunkWithRetry(
            chunk,
            jobId,
            startTime,
            totalRecords,
            processedRecords,
            initialCount
          );
          
          processedRecords = result.processedRecords;
          
          // Add delay between chunks
          await sleep(BATCH_DELAY);
          
        } catch (error) {
          console.error("[ERROR] Error processing chunk:", error.message);
          throw error;
        }
      }

      // Get final counts
      const finalCount = await db.blacklist.count();
      const uniqueDomains = finalCount - initialCount;
      const duplicateDomains = totalRecords - uniqueDomains;

      console.log("[INFO] Processing complete:");
      console.log("[INFO] Initial blacklist count:", initialCount);
      console.log("[INFO] Final blacklist count:", finalCount);
      console.log("[INFO] Total records processed:", processedRecords);
      console.log("[INFO] Unique domains inserted:", uniqueDomains);
      console.log("[INFO] Duplicate domains skipped:", duplicateDomains);
      console.log("[INFO] Actual new domains in database:", finalCount - initialCount);

      // Prepare completion message
      let completionMessage = `Successfully processed ${totalRecords} records | `;
      if (duplicateDomains > 0) {
        completionMessage += `${duplicateDomains} duplicate domains were skipped | `;
      }
      completionMessage += `${uniqueDomains} new domains were added to the database`;

      // Final update
      const finalProcessingTime = (Date.now() - startTime) / 1000;
      await db.uploadJob.update(
        {
          status: 'completed',
          processing_time: finalProcessingTime,
          total_records: totalRecords,
          processed_records: processedRecords,
          unique_domains: uniqueDomains,
          duplicate_domains: duplicateDomains,
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

  async processMultipleFilesSafe(files, jobs) {
    console.log("[INFO] Starting safe sequential file processing");
    const startTime = Date.now();
    let processedFiles = 0;
    let totalRecords = 0;
    let totalUniqueDomains = 0;
    let totalDuplicateDomains = 0;

    try {
      // Emit initial state for all jobs
      if (global.io) {
        for (const job of jobs) {
          global.io.emit('uploadProgress', {
            jobId: job.id,
            currentFile: job.filename,
            progress: 0,
            processedFiles: 0,
            totalFiles: files.length,
            totalRecords: 0,
            totalUniqueDomains: 0,
            totalDuplicateDomains: 0,
            processingTime: 0,
            status: 'pending'
          });
        }
      }

      // Process each file sequentially
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileJob = jobs[i];
        
        console.log(`[INFO] Processing file ${i + 1}/${files.length}: ${file.filename}`);
        
        try {
          // Update file job status to processing
          await db.uploadJob.update(
            {
              status: 'processing'
            },
            { where: { id: fileJob.id } }
          );

          // Get initial count for this file
          const initialCount = await db.blacklist.count();
          console.log(`[INFO] Initial blacklist count for ${file.filename}: ${initialCount}`);

          // Process the file
          await this.processFileInChunks(file.path, fileJob.id);
          
          // Get the final stats for this file
          const fileStats = await db.uploadJob.findByPk(fileJob.id);
          const finalCount = await db.blacklist.count();
          
          // Calculate unique and duplicate domains for this file
          const uniqueDomains = finalCount - initialCount;
          const duplicateDomains = fileStats.total_records - uniqueDomains;
          
          // Update file job with accurate stats
          await db.uploadJob.update(
            {
              unique_domains: uniqueDomains,
              duplicate_domains: duplicateDomains,
              status: 'completed'
            },
            { where: { id: fileJob.id } }
          );
          
          // Update totals
          totalRecords += fileStats.total_records;
          totalUniqueDomains += uniqueDomains;
          totalDuplicateDomains += duplicateDomains;
          processedFiles++;

        } catch (error) {
          console.error(`[ERROR] Error processing file ${file.filename}:`, error);
          
          // Update file job status
          await db.uploadJob.update(
            {
              status: 'failed',
              error_message: `Error processing file: ${error.message}`
            },
            { where: { id: fileJob.id } }
          );

          // Emit error update
          if (global.io) {
            global.io.emit('uploadProgress', {
              jobId: fileJob.id,
              currentFile: file.filename,
              status: 'failed',
              error: error.message
            });
          }

          throw error;
        }
      }

    } catch (error) {
      console.error("[ERROR] Safe Sequential Processing Error:", error);
      throw error;
    }
  }
}

module.exports = UploadService; 