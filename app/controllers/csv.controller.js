const fs = require("fs");
const csv = require("fast-csv");
const { Parser } = require("json2csv");
const db = require("../config/db.config");
const Blacklist = db.blacklist;
const sendResponse = require("../utils/Response.utilities");

exports.uploadFile = (req, res) => {
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

    const blacklist = [];
    const filePath = __basedir + "/uploads/" + req.file.filename;

    // Start time
    const startTime = Date.now();

    fs.createReadStream(__basedir + "/uploads/" + req.file.filename)
      .pipe(csv.parse({ headers: true }))
      .on("error", (error) => {
        console.error(error);
        sendResponse(
          res,
          "error",
          500,
          "Failed to parse CSV file",
          null,
          "ParseError",
          error.message
        );
      })
      .on("data", (row) => {
        blacklist.push(row);
      })
      .on("end", () => {
        Blacklist.bulkCreate(blacklist)
          .then(() => {
            // End time
            const endTime = Date.now();
            const durationInSeconds = (endTime - startTime) / 1000; // Convert milliseconds to seconds

            // Delete the CSV file after successful input to the database
            fs.unlink(filePath, (err) => {
              if (err) {
                console.error("Error deleting the file:", err);
              } else {
                console.log("CSV file deleted successfully.");
              }
            });

            sendResponse(
              res,
              "success",
              200,
              "Uploaded the file successfully",
              {
                filename: req.file.originalname,
                timeTaken: durationInSeconds.toFixed(2) + " seconds"
              }
            );
          })
          .catch((error) => {
            // Delete the CSV file after successful input to the database
            fs.unlink(filePath, (err) => {
              if (err) {
                console.error("Error deleting the file:", err);
              } else {
                console.log("CSV file deleted successfully.");
              }
            });

            sendResponse(
              res,
              "error",
              500,
              "Failed to import data into database",
              null,
              "DatabaseError",
              error.errors ? error.errors.map((e) => e.message).join(", ") : error.message
            );
          });
      });
  } catch (error) {
    console.error(error);
    // Handle Multer errors specifically
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return sendResponse(
        res,
        "error",
        400,
        "Invalid file upload",
        null,
        "ValidationError",
        "Please upload a file with key 'file'"
      );
    }
    
    sendResponse(
      res,
      "error",
      500,
      "Could not upload the file",
      null,
      "UploadError",
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

    const results = [];

    for (const file of req.files) {
      try {
        // parsing csv files into data array objects
        const csvParserStream = fs
          .createReadStream(__basedir + "/uploads/" + file.filename)
          .pipe(csv.parse({ headers: true }));

        const blacklist = await new Promise((resolve, reject) => {
          let data = [];
          csvParserStream
            .on("error", (error) => {
              console.error(error);
              reject(error.message);
            })
            .on("data", (row) => {
              data.push(row);
            })
            .on("end", () => {
              resolve(data);
            });
        });

        // save blacklist to postgres database
        await Blacklist.bulkCreate(blacklist);

        // Delete the CSV file after successful input to the database
        fs.unlink(__basedir + "/uploads/" + file.filename, (err) => {
          if (err) {
            console.error("Error deleting the file:", err);
          } else {
            console.log("CSV file deleted successfully:", file.originalname);
          }
        });

        results.push({
          status: "success",
          filename: file.originalname,
          message: "Uploaded the file successfully: " + file.originalname,
        });
      } catch (error) {
        console.error(error);
        results.push({
          status: "fail",
          filename: file.originalname,
          message: "Could not upload the file: " + file.originalname,
          error: error.message,
        });
      }
    }

    // Send a single response with all results
    const hasErrors = results.some(result => result.status === "fail");
    res.status(hasErrors ? 500 : 200).send({
      status: hasErrors ? "partial" : "success",
      results: results,
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

exports.downloadFile = (req, res) => {
  Blacklist.findAll({ 
    attributes: ["id", "name", "domain", "reason", "category", "hit_count"]
  })
    .then((blacklist) => {
      const jsonBlacklist = JSON.parse(JSON.stringify(blacklist));
      const csvFields = ["id", "name", "domain", "reason", "category", "hit_count"];
      const parser = new Parser({ fields: csvFields });
      const csvData = parser.parse(jsonBlacklist);

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=blacklist.csv"
      );
      res.status(200).end(csvData);
    })
    .catch((error) => {
      res.status(500).send({
        message: "Could not download the file. " + error,
      });
    });
};
