module.exports = (sequelize, Sequelize) => {
  const Blacklist = sequelize.define("blacklist", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: Sequelize.STRING,
      allowNull: false
    },
    domain: {
      type: Sequelize.STRING,
      allowNull: false,
      unique: true
    },
    reason: {
      type: Sequelize.TEXT,
      allowNull: true
    },
    category: {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "other"
    },
    hit_count: {
      type: Sequelize.INTEGER,
      defaultValue: 0
    }
  });

  return Blacklist;
};
