const fs = require("fs");
const csv = require("fast-csv");
const { Parser } = require("json2csv");
const db = require("../config/db.config");
const Blacklist = db.blacklist;
const sendResponse = require("../utils/Response.utilities");
const CsvService = require("../services/Csv.service");

exports.uploadFile = async (req, res) => {
  try {
    // Check if file exists in request
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

    const result = await CsvService.processSingleFile(req.file);
    sendResponse(
      res,
      "success",
      200,
      "Uploaded the file successfully",
      result
    );
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

exports.uploadMultiplefiles = async (req, res) => {
  try {
    // Check if files exist in request
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

    const results = await CsvService.processMultipleFiles(req.files);
    const hasErrors = results.some(result => result.status === "fail");

    sendResponse(
      res,
      hasErrors ? "partial" : "success",
      hasErrors ? 500 : 200,
      hasErrors ? "Some files failed to upload" : "All files uploaded successfully",
      { results }
    );
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
