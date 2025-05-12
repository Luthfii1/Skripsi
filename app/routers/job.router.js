const express = require("express");
const router = express.Router();
const jobController = require("../controllers/job.controller");

// Get all jobs (specific route first)
router.get("/all", jobController.getAllJobs);

// Get job status by ID (parameterized route after specific routes)
router.get("/:jobId", jobController.getJobStatus);

// Retry failed job
router.post("/:jobId/retry", jobController.retryFailedJob);

module.exports = router;