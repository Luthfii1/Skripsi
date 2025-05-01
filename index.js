// Set global __basedir first
global.__basedir = __dirname;

// Import required modules
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const app = express();

// Import database configuration
const db = require("./app/config/db.config.js");

// Import routes and other files here
const { getHomePage } = require("./app/utils/LandingPage.js");
const massiveDataRouter = require("./app/routers/csv.router.js");
const accountRouter = require("./app/routers/account.router.js");

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

// Routes used in the application
app.get("/", getHomePage);
app.use("/massive-data", massiveDataRouter);
app.use("/auth", accountRouter);

const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
