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
});

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.blacklist = require("../models/blacklist.model.js")(sequelize, Sequelize);

module.exports = db;
