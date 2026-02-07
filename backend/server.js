const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
require("dotenv").config();

const { initDatabase } = require("./db/database");
const logger = require("./utils/logger");

// Import routes
const submissionRoutes = require("./routes/submissions");
const voiceRoutes = require("./routes/voice");
const audioMasterRoutes = require("./routes/audio-masters");
const consentRoutes = require("./routes/consent");
const qcRoutes = require("./routes/qc");
const adminRoutes = require("./routes/admin");
const storageRoutes = require("./routes/storage");

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 500,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api", limiter);

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Static files for uploads (support both /uploads and /api/uploads paths)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/uploads", express.static(path.join(__dirname, "uploads")));

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "Sun Pharma Video Platform API",
    version: "1.0.0",
  });
});

// Legacy health endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

// API Routes
app.use("/api/submissions", submissionRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/audio-masters", audioMasterRoutes);
app.use("/api/consent", consentRoutes);
app.use("/api/qc", qcRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/storage", storageRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);

  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "File too large" });
  }

  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Initialize database and start server
async function startServer() {
  try {
    await initDatabase();
    logger.info("Database initialized successfully");

    app.listen(PORT, () => {
      logger.info(`🚀 Sun Pharma Video Platform API running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
