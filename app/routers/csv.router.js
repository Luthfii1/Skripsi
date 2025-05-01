let express = require("express");
let router = express.Router();
let CsvController = require("../controllers/csv.controller.js");
let upload = require("../middlewares/multer.middlewares.js");

let path = __basedir + "/views/";

router.get("/", (req, res) => {
  console.log("_basedir" + __basedir);
  res.sendFile(path + "index.html");
});

router.post("/csv-upload", upload.single("file"), CsvController.uploadFile);
router.post(
  "/csv-multiple-upload",
  upload.array("files", 10),
  CsvController.uploadMultiplefiles
);
router.get("/csv-file", CsvController.downloadFile);

module.exports = router;
