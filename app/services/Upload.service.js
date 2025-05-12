const fs = require("fs");
const csv = require("fast-csv");
const db = require("../config/db.config");
const Blacklist = db.blacklist;
const UploadJob = db.uploadJob;
const { Op, Sequelize } = require('sequelize');

const CHUNK_SIZE = 50;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const BATCH_DELAY = 1000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const processFileInChunks = async (filePath, jobId) => {
  console.log(`[INFO] Starting file processing: ${filePath}`);
  
  const job = await UploadJob.findByPk(jobId);
  if (!job) {
    throw new Error('Upload job not found');
  }

  let records = [];
  let totalRecords = 0;
  let processedRecords = 0;
  let lastProcessedCount = 0;

  await updateJobStatus(jobId, 'processing');

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      reject(new Error('File not found'));
      return;
    }

    const stream = fs.createReadStream(filePath)
      .pipe(csv.parse({ headers: true }))
      .on("error", async (error) => {
        console.error(`[ERROR] CSV Parse Error:`, error.message);
        await updateJobStatus(jobId, 'failed', error.message);
        reject(error);
      })
      .on("data", async (row) => {
        try {
          stream.pause();
          records.push(row);
          totalRecords++;

          if (records.length >= CHUNK_SIZE) {
            await processChunkWithRetry(records, jobId);
            processedRecords += records.length;
            
            // Log progress every 1000 records
            if (processedRecords - lastProcessedCount >= 1000) {
              console.log(`[INFO] Progress: ${processedRecords} records processed`);
              await updateJobProgress(jobId, totalRecords, processedRecords);
              lastProcessedCount = processedRecords;
            }
            
            records = [];
            await sleep(BATCH_DELAY);
          }
          
          stream.resume();
        } catch (error) {
          console.error(`[ERROR] Processing Error:`, error.message);
          await handleChunkError(jobId, error);
          reject(error);
        }
      })
      .on("end", async () => {
        try {
          if (records.length > 0) {
            await processChunkWithRetry(records, jobId);
            processedRecords += records.length;
            await updateJobProgress(jobId, totalRecords, processedRecords);
          }
          console.log(`[INFO] Processing completed: ${processedRecords} records`);
          await updateJobStatus(jobId, 'completed');
          resolve({
            totalRecords,
            processedRecords
          });
        } catch (error) {
          console.error(`[ERROR] Final Processing Error:`, error.message);
          await handleChunkError(jobId, error);
          reject(error);
        }
      });
  });
};

const processChunkWithRetry = async (records, jobId, retryCount = 0) => {
  const transaction = await db.sequelize.transaction();
  
  try {
    await Blacklist.bulkCreate(records, {
      validate: true,
      returning: false,
      transaction
    });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    console.error(`[ERROR] Database Error (attempt ${retryCount + 1}):`, error.message);

    if (retryCount < MAX_RETRIES) {
      await sleep(RETRY_DELAY);
      return processChunkWithRetry(records, jobId, retryCount + 1);
    }

    throw error;
  }
};

const processMultipleFiles = async (files) => {
  const results = [];
  
  for (const file of files) {
    try {
      const job = await UploadJob.create({
        filename: file.filename,
        status: 'pending'
      });

      await processFileInChunks(file.path, job.id);
      
      results.push({
        status: 'success',
        jobId: job.id,
        filename: file.originalname,
        message: 'File is being processed in the background'
      });
    } catch (error) {
      console.error(`[ERROR] File Processing Error:`, error.message);
      results.push({
        status: 'fail',
        filename: file.originalname,
        message: error.message
      });
    }
  }

  return results;
};

const updateJobStatus = async (jobId, status, errorMessage = null) => {
  const updateData = {
    status,
    error_message: errorMessage,
    updated_at: new Date()
  };

  if (status === 'failed') {
    updateData.retry_count = Sequelize.literal('retry_count + 1');
    updateData.last_retry_at = new Date();
  }

  try {
    await UploadJob.update(updateData, {
      where: { id: jobId }
    });
  } catch (error) {
    console.error(`[ERROR] Status Update Error:`, error.message);
    throw error;
  }
};

const updateJobProgress = async (jobId, totalRecords, processedRecords) => {
  try {
    await UploadJob.update({
      total_records: totalRecords,
      processed_records: processedRecords,
      updated_at: new Date()
    }, {
      where: { id: jobId }
    });
  } catch (error) {
    console.error(`[ERROR] Progress Update Error:`, error.message);
    throw error;
  }
};

const handleChunkError = async (jobId, error) => {
  const job = await UploadJob.findByPk(jobId);
  
  if (job.retry_count < MAX_RETRIES) {
    await updateJobStatus(jobId, 'failed', error.message);
  } else {
    await updateJobStatus(jobId, 'failed', `Failed after ${MAX_RETRIES} retries: ${error.message}`);
  }
};

const retryFailedJob = async (jobId) => {
  const job = await UploadJob.findByPk(jobId);
  
  if (!job) throw new Error('Upload job not found');
  if (job.status !== 'failed') throw new Error('Only failed jobs can be retried');
  if (job.retry_count >= MAX_RETRIES) throw new Error('Maximum retry attempts reached');

  const filePath = __basedir + "/uploads/" + job.filename;
  
  try {
    await updateJobStatus(jobId, 'processing');
    await processFileInChunks(filePath, jobId);
  } catch (error) {
    console.error(`[ERROR] Retry Error:`, error.message);
    await handleChunkError(jobId, error);
    throw error;
  }
};

const getJobStatus = async (jobId) => {
  return await UploadJob.findByPk(jobId);
};

module.exports = {
  processFileInChunks,
  processMultipleFiles,
  retryFailedJob,
  getJobStatus
}; 