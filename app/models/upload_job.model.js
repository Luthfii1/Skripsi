const UploadJob = (sequelize, Sequelize) => {
  return sequelize.define("upload_job", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    filename: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    status: {
      type: Sequelize.ENUM("pending", "processing", "completed", "failed"),
      defaultValue: "pending",
    },
    total_records: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
    },
    processed_records: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
    },
    error_message: {
      type: Sequelize.TEXT,
      allowNull: true,
    },
    retry_count: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
    },
    last_retry_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    created_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    },
    updated_at: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
    }
  });
};

module.exports = UploadJob; 