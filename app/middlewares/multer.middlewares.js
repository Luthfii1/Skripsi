const multer = require("multer");
const sendResponse = require("../utils/Response.utilities");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, __basedir + "/uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, new Date().toISOString() + file.originalname);
  },
});

const fileFilter = (req, file, cb) => {
  // Accept only CSV files
  if (file.mimetype !== 'text/csv') {
    return cb(new Error('Only CSV files are allowed!'), false);
  }
  cb(null, true);
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Error handling middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return sendResponse(
        res,
        "error",
        400,
        "Invalid file upload",
        null,
        "ValidationError",
        "Please upload a file with key 'file' for single upload or 'files' for multiple upload"
      );
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return sendResponse(
        res,
        "error",
        400,
        "File too large",
        null,
        "ValidationError",
        "File size should not exceed 5MB"
      );
    }
  }
  if (err.message === 'Only CSV files are allowed!') {
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

module.exports = { upload, handleMulterError };
