// Set global __basedir first
global.__basedir = __dirname;

// Import required modules
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const app = express();
const http = require('http');
const { Server } = require("socket.io");

// Import database configuration
const db = require("./app/config/db.config.js");

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Make io accessible globally
global.io = io;

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.emit('test', 'Connected');

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Import routes and other files here
const { getHomePage, getSocketTestPage } = require("./app/utils/LandingPage.js");
const massiveDataRouter = require("./app/routers/csv.router.js");
const accountRouter = require("./app/routers/account.router.js");
const domainRouter = require("./app/routers/domain.router.js");
const jobRouter = require("./app/routers/job.router.js");

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
db.sequelize.sync().then(async () => {
  try {
    await db.uploadJob.sync({ force: true });
    await db.failedUpload.sync({ force: true });
    await db.blacklist.sync({ force: true });
    
    console.log("All tables synced successfully");
  } catch (error) {
    console.error("Error syncing tables:", error);
  }
});

// Routes used in the application
app.get("/", getHomePage);
app.get("/testSocket", getSocketTestPage);
app.use("/massive-data", massiveDataRouter);
app.use("/auth", accountRouter);
app.use("/domains", domainRouter);
app.use("/jobs", jobRouter);

const port = process.env.PORT || 8080;

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
