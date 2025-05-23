const Queue = require('better-queue');

class QueueService {
  constructor() {
    this.processingQueue = new Queue(async (input, cb) => {
      try {
        const { filePath, jobId, filename, processFileInChunks } = input;
        await processFileInChunks(filePath, jobId, filename);
        cb(null, { success: true });
      } catch (error) {
        cb(error);
      }
    }, {
      concurrent: 1, // Process one file at a time
      maxRetries: 3,
      retryDelay: 5000
    });

    // Queue event handlers
    this.processingQueue.on('failed', (taskId, error) => {
      console.error(`[ERROR] Task ${taskId} failed:`, error);
    });

    this.processingQueue.on('completed', (taskId, result) => {
      console.log(`[INFO] Task ${taskId} completed successfully`);
    });
  }

  addToQueue(task) {
    return new Promise((resolve, reject) => {
      this.processingQueue.push(task, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  getQueueStatus() {
    return {
      length: this.processingQueue.length,
      running: this.processingQueue.running
    };
  }
}

// Export singleton instance
module.exports = new QueueService(); 