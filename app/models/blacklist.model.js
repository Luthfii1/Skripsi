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
    hit_count: {
      type: Sequelize.INTEGER,
    },
  });
};

module.exports = Blacklist;
