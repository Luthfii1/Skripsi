const db = require("../config/db.config");
const { Op } = require("sequelize");
const { Parser } = require('json2csv');

class FailedUploadService {
  /**
   * Get failed records for a specific job
   * @param {number} jobId - The job ID
   * @returns {Promise<Object>} Failed records with total count
   */
  async getFailedRecordsByJob(jobId) {
    const failedRecords = await db.failedUpload.findAll({
      where: { job_id: jobId },
      attributes: [
        'id',
        'row_number',
        'domain',
        'category',
        'reason',
        'error_message',
        'name',
        'hit_count'
      ],
      order: [['row_number', 'ASC']]
    });

    return {
      total: failedRecords.length,
      records: failedRecords
    };
  }

  /**
   * Generate CSV data for failed records
   * @param {number} jobId - The job ID
   * @returns {Promise<string>} CSV data
   */
  async generateFailedRecordsCSV(jobId) {
    const failedRecords = await db.failedUpload.findAll({
      where: { job_id: jobId },
      attributes: [
        'row_number',
        'domain',
        'name',
        'category',
        'reason',
        'hit_count',
        'error_message'
      ],
      order: [['row_number', 'ASC']]
    });

    // Define CSV fields
    const fields = [
      'row_number',
      'domain',
      'name',
      'category',
      'reason',
      'hit_count',
      'error_message'
    ];

    // Create CSV parser with options to remove quotes
    const json2csvParser = new Parser({ 
      fields,
      quote: '',
      header: true,
      formatters: {
        string: (value) => value || '',
        number: (value) => value || 0
      }
    });

    // Convert records to CSV
    return json2csvParser.parse(failedRecords);
  }

  /**
   * Update a failed record
   * @param {number} jobId - The job ID
   * @param {number} recordId - The record ID
   * @param {Object} updateData - The data to update
   * @returns {Promise<Object>} Updated record
   */
  async updateFailedRecord(jobId, recordId, updateData) {
    const record = await db.failedUpload.findOne({
      where: {
        id: recordId,
        job_id: jobId
      }
    });

    if (!record) {
      throw new Error('Failed record not found');
    }

    // Update the record
    await record.update(updateData);

    return record;
  }
}

module.exports = new FailedUploadService(); 