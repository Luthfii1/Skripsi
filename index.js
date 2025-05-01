// Import required modules
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const app = express();
const db = require("./app/config/db.config.js");

// Import routes and other files here
const { getHomePage } = require("./app/utils/LandingPage.js");
// const massiveDataRouter = require("./app/routers/csv.router.js");

global.__basedir = __dirname;

// Serve static files from the public directory
app.use(express.static("public"));
app.use(express.static("resources"));

// Set up the server
dotenv.config();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

// force: true will drop the table if it already exists
db.sequelize.sync({ force: true }).then(() => {
  console.log("Drop and Resync with { force: true }");
});

// NOT USE FOR NOW
// let router = require("./app/routers/csv.router.js");
// app.use("/", router);

// Routes used in the application
app.get("/", getHomePage);
// app.use("/massive-data", massiveDataRouter);

const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
