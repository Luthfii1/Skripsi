const multer = require("multer");
const sendResponse = require("../utils/Response.utilities");
const path = require("path");

// File size limits (in bytes)
const FILE_SIZE_LIMITS = {
  CSV: 50 * 1024 * 1024, // 50MB for CSV files
  TOTAL: 500 * 1024 * 1024 // 500MB total for multiple files
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, __basedir + "/uploads/");
  },
  filename: (req, file, cb) => {
    // Generate unique filename original name + timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.originalname + uniqueSuffix + ext);
  },
});

const fileFilter = (req, file, cb) => {
  // Check file extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== '.csv') {
    return cb(new Error('Only CSV files are allowed!'), false);
  }

  // Check MIME type
  if (file.mimetype !== 'text/csv' && file.mimetype !== 'application/vnd.ms-excel') {
    return cb(new Error('Invalid file type. Only CSV files are allowed!'), false);
  }

  cb(null, true);
};

// Calculate total size of files in request
const calculateTotalSize = (files) => {
  return files.reduce((total, file) => total + file.size, 0);
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: FILE_SIZE_LIMITS.CSV, // 50MB per file
    files: 10 // Maximum 10 files
  }
});

// Error handling middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_UNEXPECTED_FILE':
        return sendResponse(
          res,
          "error",
          400,
          "Invalid file upload",
          null,
          "ValidationError",
          "Please upload a file with key 'file' for single upload or 'files' for multiple upload"
        );
      
      case 'LIMIT_FILE_SIZE':
        return sendResponse(
          res,
          "error",
          400,
          "File too large",
          null,
          "ValidationError",
          `File size should not exceed ${FILE_SIZE_LIMITS.CSV / (1024 * 1024)}MB`
        );
      
      case 'LIMIT_FILE_COUNT':
        return sendResponse(
          res,
          "error",
          400,
          "Too many files",
          null,
          "ValidationError",
          "Maximum 10 files can be uploaded at once"
        );
      
      default:
        return sendResponse(
          res,
          "error",
          400,
          "File upload error",
          null,
          "ValidationError",
          err.message
        );
    }
  }

  if (err.message.includes('Only CSV files are allowed') || 
      err.message.includes('Invalid file type')) {
    return sendResponse(
      res,
      "error",
      400,
      "Invalid file type",
      null,
      "ValidationError",
      "Only CSV files are allowed"
    );
  }

  next(err);
};

// Middleware to check total size of multiple files
const checkTotalSize = (req, res, next) => {
  if (!req.files) return next();

  const totalSize = calculateTotalSize(req.files);
  if (totalSize > FILE_SIZE_LIMITS.TOTAL) {
    return sendResponse(
      res,
      "error",
      400,
      "Total file size too large",
      null,
      "ValidationError",
      `Total size of all files should not exceed ${FILE_SIZE_LIMITS.TOTAL / (1024 * 1024)}MB`
    );
  }
  next();
};

module.exports = { 
  upload, 
  handleMulterError,
  checkTotalSize,
  FILE_SIZE_LIMITS 
};
