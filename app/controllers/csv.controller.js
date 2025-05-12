const fs = require("fs");
const csv = require("fast-csv");
const { Parser } = require("json2csv");
const db = require("../config/db.config");
const Blacklist = db.blacklist;
const UploadJob = db.uploadJob;
const sendResponse = require("../utils/Response.utilities");
const CsvService = require("../services/Csv.service");
const UploadService = require("../services/Upload.service");

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return sendResponse(
        res,
        "error",
        400,
        "No file uploaded",
        null,
        "ValidationError",
        "Please upload a file with key 'file'"
      );
    }

    // Create a new upload job
    const job = await UploadJob.create({
      filename: req.file.filename,
      status: 'pending'
    });

    // Immediately respond to the client
    sendResponse(
      res,
      "success",
      200,
      "File upload started successfully",
      {
        jobId: job.id,
        message: "File is being processed in the background"
      }
    );

    // Process the file in the background
    setImmediate(() => {
      UploadService.processFileInChunks(req.file.path, job.id)
        .catch(error => {
          console.error('Error processing file:', error);
        });
    });
  } catch (error) {
    console.error(error);
    sendResponse(
      res,
      "error",
      500,
      "Could not upload the file",
      null,
      error.type || "UploadError",
      error.message
    );
  }
};

exports.uploadMultipleFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return sendResponse(
        res,
        "error",
        400,
        "No files uploaded",
        null,
        "ValidationError",
        "Please upload files with key 'files'"
      );
    }

    // Immediately respond to the client
    sendResponse(
      res,
      "success",
      200,
      "Multiple file upload started successfully",
      {
        message: "Files are being processed in the background"
      }
    );

    // Process the files in the background
    setImmediate(() => {
      UploadService.processMultipleFiles(req.files)
        .catch(error => {
          console.error('Error processing multiple files:', error);
        });
    });
  } catch (error) {
    console.error(error);
    sendResponse(
      res,
      "error",
      500,
      "Could not upload the files",
      null,
      "UploadError",
      error.message
    );
  }
};

exports.getUploadStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await UploadService.getJobStatus(jobId);
    
    if (!job) {
      return sendResponse(
        res,
        "error",
        404,
        "Upload job not found",
        null,
        "NotFoundError",
        "The specified upload job does not exist"
      );
    }

    sendResponse(
      res,
      "success",
      200,
      "Upload status retrieved successfully",
      job
    );
  } catch (error) {
    console.error(error);
    sendResponse(
      res,
      "error",
      500,
      "Could not retrieve upload status",
      null,
      "ServerError",
      error.message
    );
  }
};

exports.retryUpload = async (req, res) => {
  try {
    const { jobId } = req.params;
    await UploadService.retryFailedJob(jobId);
    
    sendResponse(
      res,
      "success",
      200,
      "Upload retry started successfully",
      {
        jobId,
        message: "File is being reprocessed in the background"
      }
    );
  } catch (error) {
    console.error(error);
    sendResponse(
      res,
      "error",
      500,
      "Could not retry upload",
      null,
      "RetryError",
      error.message
    );
  }
};

exports.downloadFile = async (req, res) => {
  try {
    const csvData = await CsvService.generateCsvFile();

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=blacklist.csv"
    );
    res.status(200).end(csvData);
  } catch (error) {
    console.error(error);
    sendResponse(
      res,
      "error",
      500,
      "Could not download the file",
      null,
      "DownloadError",
      error.message
    );
  }
};
