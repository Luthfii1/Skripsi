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
    unique_domains: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      comment: 'Number of unique domains successfully stored'
    },
    duplicate_domains: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      comment: 'Number of duplicate domains skipped'
    },
    failed_records: {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      comment: 'Number of records that failed validation'
    },
    processing_time: {
      type: Sequelize.FLOAT,
      defaultValue: 0,
      comment: 'Time taken to process the file in seconds'
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
    }
  }, {
    timestamps: true,
    underscored: false, // This will use camelCase for timestamps
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  });
};

module.exports = UploadJob; 