const failedUploadService = require("../services/failedUpload.service");
const sendResponse = require("../utils/Response.utilities");

// res,
// status,
// code,
// message,
// data,
// errorType = null,
// description = null

/**
 * Get failed records for a specific job
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getFailedRecordsByJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await failedUploadService.getFailedRecordsByJob(jobId);
    sendResponse(
        res, 
        "success", 
        200, 
        "Failed records retrieved successfully", 
        result
    );

  } catch (error) {
    console.error('Error getting failed records:', error);
    sendResponse(
        res, 
        "error", 
        500, 
        "Error getting failed records", 
        null,
        "InternalServerError",
        "Failed to get failed records"
    );
  }
};

/**
 * Download failed records as CSV
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.downloadFailedRecords = async (req, res) => {
  try {
    const { jobId } = req.params;
    const csvData = await failedUploadService.generateFailedRecordsCSV(jobId);

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=failed-records-${jobId}.csv`);

    res.send(csvData);
  } catch (error) {
    console.error('Error downloading failed records:', error);
    sendResponse(
        res, 
        "error", 
        500, 
        "Error downloading failed records", 
        null,
        "InternalServerError",
        "Failed to download failed records"
    );
  }
};

/**
 * Update a failed record
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.updateFailedRecord = async (req, res) => {
  try {
    const { jobId, recordId } = req.params;
    const updateData = req.body;

    const updatedRecord = await failedUploadService.updateFailedRecord(jobId, recordId, updateData);
    sendResponse(
        res, 
        "success", 
        200, 
        "Failed record updated successfully", 
        updatedRecord
    );
  } catch (error) {
    console.error('Error updating failed record:', error);
    sendResponse(
        res, 
        "error", 
        500, 
        "Error updating failed record", 
        null,
        "InternalServerError",
        "Failed to update failed record"
    );
  }
}; 