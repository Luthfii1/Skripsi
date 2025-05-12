const dotenv = require("dotenv");
dotenv.config();
const { Sequelize } = require("sequelize");

const sequelize = new Sequelize({
  dialect: "postgres",
  host: "localhost",
  port: 5432,
  username: "postgres",
  password: "postgres",
  database: "massive-data",
  logging: false
});

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// Import models
db.blacklist = require("../models/blacklist.model.js")(sequelize, Sequelize);
db.account = require("../models/account.model.js")(sequelize, Sequelize);
db.uploadJob = require("../models/upload_job.model.js")(sequelize, Sequelize);

// Test database connection
sequelize.authenticate()
  .then(() => {
    console.log('Database connection has been established successfully.');
  })
  .catch(err => {
    console.error('Unable to connect to the database:', err);
  });

module.exports = db;
