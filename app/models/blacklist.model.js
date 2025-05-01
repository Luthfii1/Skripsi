const Blacklist = (sequelize, Sequelize) => {
  return sequelize.define("blacklist", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: Sequelize.STRING,
    },
    domain: {
      type: Sequelize.STRING,
    },
    reason: {
      type: Sequelize.STRING,
    },
    category: {
      type: Sequelize.ENUM("phishing", "spam", "malware", "suspicious", "porn", "gambling", "other"),
    },
    hit_count: {
      type: Sequelize.INTEGER,
    },
  });
};

module.exports = Blacklist;
