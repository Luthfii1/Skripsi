const fs = require("fs");
const csv = require("fast-csv");
const db = require("../config/db.config");
const Blacklist = db.blacklist;

exports.uploadFile = (req, res) => {
  try {
    const blacklist = [];
    const filePath = __basedir + "/uploads/" + req.file.filename;

    // Start time
    const startTime = Date.now();

    fs.createReadStream(__basedir + "/uploads/" + req.file.filename)
      .pipe(csv.parse({ headers: true }))
      .on("error", (error) => {
        console.error(error);
        throw error.message;
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

            res.status(200).send({
              status: "success",
              filename: req.file.originalname,
              message: "Uploaded the file successfully.",
              timeTaken: durationInSeconds.toFixed(2) + " seconds", // Return the time taken
            });
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

            res.status(500).send({
              message: "Fail to import data into database!",
              error: error.errors
                ? error.errors.map((e) => e.message)
                : error.message, // Extract detailed error messages
            });
          });
      });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      message: "Could not upload the file: " + req.file.originalname,
    });
  }
};

exports.uploadMultiplefiles = async (req, res) => {
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
};

exports.downloadFile = (req, res) => {
  Blacklist.findAll({ attributes: ["id", "name", "domain", "hit_count"] })
    .then((blacklist) => {
      const jsonBlacklist = JSON.parse(JSON.stringify(blacklist));
      const csvFields = ["id", "name", "domain", "hit_count"];
      const csvParser = new json2csv.Parser({ csvFields });
      const csvData = csvParser.parse(jsonBlacklist);

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
