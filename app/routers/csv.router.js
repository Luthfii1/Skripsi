let express = require("express");
let router = express.Router();
let CsvController = require("../controllers/csv.controller.js");
let { upload, handleMulterError, checkTotalSize } = require("../middlewares/multer.middlewares.js");

let path = __basedir + "/views/";

// router.get("/", (req, res) => {
//   console.log("_basedir" + __basedir);
//   res.sendFile(path + "index.html");
// });

// Upload single file
router.post("/csv-upload", upload.single("file"), CsvController.uploadFile);

// Upload multiple files
router.post(
  "/csv-multiple-upload",
  upload.array("files", 10),
  checkTotalSize,
  CsvController.uploadMultipleFiles
);

// Download file
router.get("/csv-file", CsvController.downloadFile);

// Add error handling middleware
router.use(handleMulterError);

module.exports = router;
