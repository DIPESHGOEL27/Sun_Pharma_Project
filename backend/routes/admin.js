/**
 * Admin Routes
 * Handles administrative operations, dashboard, and system management
 */

const express = require("express");
const router = express.Router();
const { body, query, validationResult } = require("express-validator");
const path = require("path");
const fs = require("fs");

const { getDb } = require("../db/database");
const logger = require("../utils/logger");
const elevenLabs = require("../services/elevenlabs");
const googleSheetsService = require("../services/googleSheetsService");
const {
  SUBMISSION_STATUS,
  QC_STATUS,
  SUPPORTED_LANGUAGES,
} = require("../utils/constants");

/**
 * GET /api/admin/dashboard
 * Get dashboard overview statistics
 */
router.get("/dashboard", async (req, res) => {
  try {
    const db = getDb();

    // Submission statistics
    const submissionStats = db
      .prepare(
        `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft,
        COUNT(CASE WHEN status = 'pending_consent' THEN 1 END) as pending_consent,
        COUNT(CASE WHEN status = 'consent_verified' THEN 1 END) as consent_verified,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
        COUNT(CASE WHEN status = 'pending_qc' THEN 1 END) as pending_qc,
        COUNT(CASE WHEN status = 'qc_approved' THEN 1 END) as qc_approved,
        COUNT(CASE WHEN status = 'qc_rejected' THEN 1 END) as qc_rejected,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM submissions
    `
      )
      .get();

    // QC statistics
    const qcStats = db
      .prepare(
        `
      SELECT 
        COUNT(CASE WHEN qc_status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN qc_status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN qc_status = 'rejected' THEN 1 END) as rejected
      FROM submissions
    `
      )
      .get();

    // Voice cloning statistics
    const voiceStats = db
      .prepare(
        `
      SELECT 
        COUNT(CASE WHEN voice_clone_status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN voice_clone_status = 'completed' THEN 1 END) as cloned,
        COUNT(CASE WHEN voice_clone_status = 'deleted' THEN 1 END) as deleted,
        COUNT(CASE WHEN voice_clone_status = 'failed' THEN 1 END) as failed
      FROM submissions
    `
      )
      .get();

    // Audio masters by language
    const audioMasters = db
      .prepare(
        `
      SELECT 
        language_code,
        COUNT(*) as count,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_count
      FROM audio_masters
      GROUP BY language_code
    `
      )
      .all();

    // Recent submissions
    const recentSubmissions = db
      .prepare(
        `
      SELECT s.id, s.status, s.qc_status, s.created_at,
             d.full_name as doctor_name
      FROM submissions s
      LEFT JOIN doctors d ON s.doctor_id = d.id
      ORDER BY s.created_at DESC
      LIMIT 10
    `
      )
      .all();

    // Today's activity
    const today = new Date().toISOString().split("T")[0];
    const todayStats = db
      .prepare(
        `
      SELECT 
        COUNT(CASE WHEN DATE(created_at) = ? THEN 1 END) as submissions_today,
        COUNT(CASE WHEN DATE(consent_verified_at) = ? THEN 1 END) as consents_today,
        COUNT(CASE WHEN DATE(qc_reviewed_at) = ? THEN 1 END) as qc_reviews_today
      FROM submissions
    `
      )
      .get(today, today, today);

    // Language distribution
    const languageDistribution = db
      .prepare(
        `
      SELECT selected_languages FROM submissions
    `
      )
      .all();

    const langCounts = {};
    languageDistribution.forEach((row) => {
      const langs = JSON.parse(row.selected_languages || "[]");
      langs.forEach((lang) => {
        langCounts[lang] = (langCounts[lang] || 0) + 1;
      });
    });

    res.json({
      submissions: submissionStats,
      qc: qcStats,
      voiceCloning: voiceStats,
      audioMasters: audioMasters.map((am) => ({
        ...am,
        language_name:
          SUPPORTED_LANGUAGES[am.language_code]?.name || am.language_code,
      })),
      recentSubmissions,
      today: todayStats,
      languageDistribution: Object.entries(langCounts)
        .map(([code, count]) => ({
          code,
          name: SUPPORTED_LANGUAGES[code]?.name || code,
          count,
        }))
        .sort((a, b) => b.count - a.count),
    });
  } catch (error) {
    logger.error("[ADMIN] Error fetching dashboard:", error);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

/**
 * GET /api/admin/doctors
 * List all doctors
 */
router.get("/doctors", async (req, res) => {
  try {
    const db = getDb();
    const { page = 1, limit = 50, search } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT d.*, 
        (SELECT COUNT(*) FROM submissions WHERE doctor_id = d.id) as submission_count
      FROM doctors d
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (d.full_name LIKE ? OR d.email LIKE ? OR d.phone LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    query += ` ORDER BY d.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const doctors = db.prepare(query).all(...params);

    let countQuery = "SELECT COUNT(*) as total FROM doctors WHERE 1=1";
    const countParams = [];
    if (search) {
      countQuery += ` AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ?)`;
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, searchPattern, searchPattern);
    }
    const { total } = db.prepare(countQuery).get(...countParams);

    res.json({
      doctors,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("[ADMIN] Error fetching doctors:", error);
    res.status(500).json({ error: "Failed to fetch doctors" });
  }
});

/**
 * GET /api/admin/medical-reps
 * List all medical representatives
 */
router.get("/medical-reps", async (req, res) => {
  try {
    const db = getDb();

    const reps = db
      .prepare(
        `
      SELECT mr.*, 
        (SELECT COUNT(*) FROM submissions WHERE mr_id = mr.id) as submission_count
      FROM medical_reps mr
      ORDER BY mr.name
    `
      )
      .all();

    res.json(reps);
  } catch (error) {
    logger.error("[ADMIN] Error fetching medical reps:", error);
    res.status(500).json({ error: "Failed to fetch medical representatives" });
  }
});

/**
 * POST /api/admin/medical-reps
 * Create new medical representative
 */
router.post(
  "/medical-reps",
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("mr_code").notEmpty().withMessage("MR Code is required"),
    body("phone").notEmpty().withMessage("Phone is required"),
    body("email").optional().isEmail(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const db = getDb();
    const { name, mr_code, phone, email } = req.body;

    try {
      // Check for duplicate MR code
      const existing = db
        .prepare("SELECT id FROM medical_reps WHERE mr_code = ?")
        .get(mr_code);
      if (existing) {
        return res.status(409).json({ error: "MR Code already exists" });
      }

      const result = db
        .prepare(
          `
        INSERT INTO medical_reps (name, mr_code, phone, email)
        VALUES (?, ?, ?, ?)
      `
        )
        .run(name, mr_code, phone, email);

      logger.info(`[ADMIN] Created medical rep: ${mr_code}`);

      res.status(201).json({
        message: "Medical representative created",
        id: result.lastInsertRowid,
      });
    } catch (error) {
      logger.error("[ADMIN] Error creating medical rep:", error);
      res
        .status(500)
        .json({ error: "Failed to create medical representative" });
    }
  }
);

/**
 * POST /api/admin/mr-login
 * MR Login using email (username) and emp_code (password)
 */
router.post(
  "/mr-login",
  [
    body("email").isEmail().withMessage("Valid email is required"),
    body("emp_code").notEmpty().withMessage("Employee code is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const db = getDb();
    const { email, emp_code } = req.body;

    try {
      // Find MR by email and emp_code (case-insensitive)
      const mr = db
        .prepare(
          `
        SELECT * FROM medical_reps 
        WHERE LOWER(email) = LOWER(?) AND LOWER(emp_code) = LOWER(?) AND is_active = 1
      `
        )
        .get(email, emp_code);

      if (!mr) {
        logger.warn(`[ADMIN] MR login failed for email: ${email}`);
        return res
          .status(401)
          .json({ error: "Invalid email or employee code" });
      }

      logger.info(`[ADMIN] MR login successful: ${mr.name} (${mr.emp_code})`);

      res.json({
        id: mr.id,
        name: mr.name,
        mr_code: mr.mr_code,
        emp_code: mr.emp_code,
        email: mr.email,
        phone: mr.phone,
        designation: mr.designation,
        hq: mr.hq,
        region: mr.region,
        zone: mr.zone,
      });
    } catch (error) {
      logger.error("[ADMIN] Error during MR login:", error);
      res.status(500).json({ error: "Login failed" });
    }
  }
);

/**
 * POST /api/admin/import-mrs
 * Bulk import medical representatives from JSON array
 */
router.post("/import-mrs", async (req, res) => {
  const db = getDb();
  const { mrs } = req.body;

  if (!Array.isArray(mrs) || mrs.length === 0) {
    return res.status(400).json({ error: "Invalid or empty MR list" });
  }

  try {
    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const mr of mrs) {
      try {
        // Check if MR already exists by mr_code or email
        const existing = db
          .prepare(
            "SELECT id FROM medical_reps WHERE mr_code = ? OR LOWER(email) = LOWER(?)"
          )
          .get(mr.emp_code, mr.email);

        if (existing) {
          // Update existing record
          db.prepare(
            `UPDATE medical_reps SET 
              name = ?, mr_code = ?, emp_code = ?, phone = ?, email = ?, 
              designation = ?, hq = ?, region = ?, zone = ?
            WHERE id = ?`
          ).run(
            mr.name,
            mr.emp_code, // Using emp_code as mr_code
            mr.emp_code,
            mr.phone || "",
            mr.email,
            mr.designation || "",
            mr.hq || "",
            mr.region || "",
            mr.zone || "",
            existing.id
          );
          skipped++;
        } else {
          // Insert new record
          db.prepare(
            `INSERT INTO medical_reps (name, mr_code, emp_code, phone, email, designation, hq, region, zone)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            mr.name,
            mr.emp_code, // Using emp_code as mr_code
            mr.emp_code,
            mr.phone || "",
            mr.email,
            mr.designation || "",
            mr.hq || "",
            mr.region || "",
            mr.zone || ""
          );
          imported++;
        }
      } catch (err) {
        errors.push({ emp_code: mr.emp_code, error: err.message });
      }
    }

    logger.info(
      `[ADMIN] MR import: ${imported} imported, ${skipped} updated, ${errors.length} errors`
    );

    res.json({
      success: true,
      imported,
      updated: skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    logger.error("[ADMIN] Error importing MRs:", error);
    res.status(500).json({ error: "Failed to import medical representatives" });
  }
});

/**
 * GET /api/admin/elevenlabs-status
 * Check ElevenLabs API status and quota
 */
router.get("/elevenlabs-status", async (req, res) => {
  try {
    const status = await elevenLabs.checkApiHealth();
    res.json(status);
  } catch (error) {
    logger.error("[ADMIN] Error checking ElevenLabs status:", error);
    res.status(500).json({
      healthy: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/admin/audit-log
 * Get audit log entries
 */
router.get("/audit-log", async (req, res) => {
  try {
    const db = getDb();
    const {
      page = 1,
      limit = 50,
      entity_type,
      action,
      start_date,
      end_date,
    } = req.query;
    const offset = (page - 1) * limit;

    let query = "SELECT * FROM audit_log WHERE 1=1";
    const params = [];

    if (entity_type) {
      query += " AND entity_type = ?";
      params.push(entity_type);
    }

    if (action) {
      query += " AND action = ?";
      params.push(action);
    }

    if (start_date) {
      query += " AND DATE(created_at) >= ?";
      params.push(start_date);
    }

    if (end_date) {
      query += " AND DATE(created_at) <= ?";
      params.push(end_date);
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const logs = db.prepare(query).all(...params);

    res.json({
      logs: logs.map((log) => ({
        ...log,
        details: log.details ? JSON.parse(log.details) : null,
      })),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    logger.error("[ADMIN] Error fetching audit log:", error);
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

/**
 * POST /api/admin/bulk-action
 * Perform bulk actions on submissions
 */
router.post(
  "/bulk-action",
  [
    body("action")
      .isIn(["approve", "reject", "delete", "retry"])
      .withMessage("Invalid action"),
    body("submission_ids")
      .isArray({ min: 1 })
      .withMessage("At least one submission ID required"),
    body("actor").notEmpty().withMessage("Actor name is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const db = getDb();
    const { action, submission_ids, actor, notes } = req.body;

    try {
      const results = { success: [], failed: [] };

      for (const id of submission_ids) {
        try {
          switch (action) {
            case "approve":
              db.prepare(
                `
                UPDATE submissions 
                SET qc_status = 'approved', status = 'qc_approved',
                    qc_reviewed_by = ?, qc_reviewed_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `
              ).run(actor, id);
              break;

            case "reject":
              db.prepare(
                `
                UPDATE submissions 
                SET qc_status = 'rejected', status = 'qc_rejected',
                    qc_reviewed_by = ?, qc_reviewed_at = CURRENT_TIMESTAMP,
                    qc_notes = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `
              ).run(actor, notes || "Bulk rejection", id);
              break;

            case "retry":
              db.prepare(
                `
                UPDATE submissions 
                SET status = 'consent_verified', updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND status = 'failed'
              `
              ).run(id);
              break;

            case "delete":
              // Soft delete - just mark as deleted
              db.prepare(
                `
                UPDATE submissions 
                SET status = 'deleted', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `
              ).run(id);
              break;
          }

          // Log audit
          db.prepare(
            `
            INSERT INTO audit_log (entity_type, entity_id, action, actor, details)
            VALUES (?, ?, ?, ?, ?)
          `
          ).run(
            "submission",
            id,
            `bulk_${action}`,
            actor,
            JSON.stringify({ notes })
          );

          results.success.push(id);
        } catch (err) {
          results.failed.push({ id, error: err.message });
        }
      }

      logger.info(
        `[ADMIN] Bulk action ${action} by ${actor}: ${results.success.length} success, ${results.failed.length} failed`
      );

      res.json({
        message: `Bulk ${action} completed`,
        results,
      });
    } catch (error) {
      logger.error("[ADMIN] Error performing bulk action:", error);
      res.status(500).json({ error: "Failed to perform bulk action" });
    }
  }
);

/**
 * GET /api/admin/export
 * Export submissions data
 */
router.get("/export", async (req, res) => {
  try {
    const db = getDb();
    const { format = "json", status, start_date, end_date } = req.query;

    let query = `
      SELECT s.*, d.full_name as doctor_name, d.email as doctor_email,
             d.phone as doctor_phone, d.specialty,
             m.name as mr_name, m.mr_code
      FROM submissions s
      LEFT JOIN doctors d ON s.doctor_id = d.id
      LEFT JOIN medical_reps m ON s.mr_id = m.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += " AND s.status = ?";
      params.push(status);
    }

    if (start_date) {
      query += " AND DATE(s.created_at) >= ?";
      params.push(start_date);
    }

    if (end_date) {
      query += " AND DATE(s.created_at) <= ?";
      params.push(end_date);
    }

    query += " ORDER BY s.created_at DESC";

    const data = db.prepare(query).all(...params);

    if (format === "csv") {
      // Simple CSV export
      const headers = [
        "ID",
        "Doctor Name",
        "Doctor Email",
        "Doctor Phone",
        "Specialty",
        "MR Name",
        "MR Code",
        "Status",
        "QC Status",
        "Selected Languages",
        "Created At",
      ];

      let csv = headers.join(",") + "\n";

      data.forEach((row) => {
        csv +=
          [
            row.id,
            `"${row.doctor_name || ""}"`,
            row.doctor_email || "",
            row.doctor_phone || "",
            `"${row.specialty || ""}"`,
            `"${row.mr_name || ""}"`,
            row.mr_code || "",
            row.status,
            row.qc_status,
            `"${row.selected_languages || ""}"`,
            row.created_at,
          ].join(",") + "\n";
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=submissions_export.csv"
      );
      return res.send(csv);
    }

    res.json({
      count: data.length,
      data: data.map((s) => ({
        ...s,
        selected_languages: JSON.parse(s.selected_languages || "[]"),
      })),
    });
  } catch (error) {
    logger.error("[ADMIN] Error exporting data:", error);
    res.status(500).json({ error: "Failed to export data" });
  }
});

/**
 * GET /api/admin/system-health
 * Check system health
 */
router.get("/system-health", async (req, res) => {
  try {
    const db = getDb();

    // Check database
    const dbCheck = db.prepare("SELECT 1").get();

    // Check ElevenLabs
    let elevenLabsHealth = { healthy: false };
    try {
      elevenLabsHealth = await elevenLabs.checkApiHealth();
    } catch (e) {
      elevenLabsHealth.error = e.message;
    }

    // Check disk space for uploads
    const uploadsDir = path.join(__dirname, "../uploads");
    let uploadsDirExists = false;
    try {
      uploadsDirExists = fs.existsSync(uploadsDir);
    } catch (e) {}

    res.json({
      status: "operational",
      timestamp: new Date().toISOString(),
      components: {
        database: {
          healthy: !!dbCheck,
          type: "SQLite with WAL",
        },
        elevenlabs: elevenLabsHealth,
        storage: {
          uploadsDir: uploadsDirExists,
        },
      },
    });
  } catch (error) {
    logger.error("[ADMIN] System health check failed:", error);
    res.status(500).json({
      status: "degraded",
      error: error.message,
    });
  }
});

/**
 * POST /api/admin/sync-sheets
 * Sync all submissions to Google Sheets
 */
router.post("/sync-sheets", async (req, res) => {
  try {
    const db = getDb();

    // Get all submissions with MR phone
    const getSubmissions = () => {
      return db
        .prepare(
          `
        SELECT s.*, 
               d.full_name as doctor_name, d.email as doctor_email,
               d.phone as doctor_phone, d.specialty,
               m.name as mr_name, m.mr_code, m.phone as mr_mobile
        FROM submissions s
        LEFT JOIN doctors d ON s.doctor_id = d.id
        LEFT JOIN medical_reps m ON s.mr_id = m.id
        ORDER BY s.created_at DESC
      `
        )
        .all();
    };

    // Get videos for a submission
    const getVideos = (submissionId) => {
      return db
        .prepare(
          `
        SELECT * FROM generated_videos WHERE submission_id = ?
      `
        )
        .all(submissionId);
    };

    // Get generated audio for a submission
    const getAudios = (submissionId) => {
      return db
        .prepare(
          `
        SELECT * FROM generated_audio WHERE submission_id = ?
      `
        )
        .all(submissionId);
    };

    const success = await googleSheetsService.syncAllSubmissions(
      getSubmissions,
      getVideos,
      getAudios
    );

    if (success) {
      logger.info("[ADMIN] All submissions synced to Google Sheets");
      res.json({
        success: true,
        message: "All submissions synced to Google Sheets",
      });
    } else {
      throw new Error("Sync failed");
    }
  } catch (error) {
    logger.error("[ADMIN] Failed to sync submissions to sheets:", error);
    res.status(500).json({
      error: "Failed to sync to Google Sheets",
      details: error.message,
    });
  }
});

/**
 * POST /api/admin/login
 * Admin login with hardcoded credentials
 */
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  // Hardcoded admin credentials
  const ADMIN_USERNAME = "ADMIN";
  const ADMIN_PASSWORD = "ADMIN@Sun_Pharma";
  const EDITOR_USERNAME = "EDITOR";
  const EDITOR_PASSWORD = "EDITOR@Sun_Pharma";

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    logger.info("[ADMIN] Admin login successful");
    res.json({
      success: true,
      message: "Login successful",
      user: { username: "ADMIN", role: "admin" },
    });
    return;
  }

  if (username === EDITOR_USERNAME && password === EDITOR_PASSWORD) {
    logger.info("[ADMIN] Editor login successful");
    res.json({
      success: true,
      message: "Login successful",
      user: { username: "EDITOR", role: "editor" },
    });
    return;
  }

  logger.warn(`[ADMIN] Admin login failed for username: ${username}`);
  res.status(401).json({ error: "Invalid username or password" });
});

/**
 * GET /api/admin/overall-data
 * Get overall submission data with date range filter
 */
router.get("/overall-data", async (req, res) => {
  try {
    const db = getDb();
    const { start_date, end_date, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE 1=1";
    const params = [];

    if (start_date) {
      whereClause += " AND DATE(s.created_at) >= ?";
      params.push(start_date);
    }

    if (end_date) {
      whereClause += " AND DATE(s.created_at) <= ?";
      params.push(end_date);
    }

    // Get submissions with all details
    const query = `
      SELECT s.*, 
             d.full_name as doctor_name, d.email as doctor_email, d.phone as doctor_phone, d.specialty,
             m.name as mr_name, m.mr_code, m.emp_code, m.hq, m.region, m.zone
      FROM submissions s
      LEFT JOIN doctors d ON s.doctor_id = d.id
      LEFT JOIN medical_reps m ON s.mr_id = m.id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) as total FROM submissions s ${whereClause}
    `;

    const submissions = db
      .prepare(query)
      .all(...params, parseInt(limit), parseInt(offset));
    const { total } = db.prepare(countQuery).get(...params);

    // Get video URLs for each submission
    const submissionsWithVideos = submissions.map((sub) => {
      const videos = db
        .prepare(
          "SELECT language_code, gcs_path as video_url, status FROM generated_videos WHERE submission_id = ?"
        )
        .all(sub.id);
      return {
        ...sub,
        consent_verified: sub.consent_status === "verified",
        videos,
        selected_languages: JSON.parse(sub.selected_languages || "[]"),
      };
    });

    res.json({
      submissions: submissionsWithVideos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("[ADMIN] Error fetching overall data:", error);
    res.status(500).json({ error: "Failed to fetch overall data" });
  }
});

/**
 * GET /api/admin/mr-grouped-data
 * Get submission data grouped by MR with date range filter and search
 */
router.get("/mr-grouped-data", async (req, res) => {
  try {
    const db = getDb();
    const { start_date, end_date, search } = req.query;

    // Build a simpler query that doesn't rely on complex JOIN conditions
    let mrQuery = `
      SELECT 
        m.id as mr_id,
        m.name as mr_name,
        m.mr_code,
        m.emp_code,
        m.email as mr_email,
        m.phone as mr_phone,
        m.designation,
        m.hq,
        m.region,
        m.zone
      FROM medical_reps m
      WHERE 1=1
    `;
    const mrParams = [];

    if (search) {
      mrQuery +=
        " AND (m.mr_code LIKE ? OR m.emp_code LIKE ? OR m.name LIKE ?)";
      const searchPattern = `%${search}%`;
      mrParams.push(searchPattern, searchPattern, searchPattern);
    }

    mrQuery += " ORDER BY m.name";

    const mrs = db.prepare(mrQuery).all(...mrParams);

    // For each MR, get their submission stats
    const mrData = mrs.map((mr) => {
      let statsQuery = `
        SELECT 
          COUNT(*) as total_submissions,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_submissions,
          COUNT(CASE WHEN qc_status = 'approved' THEN 1 END) as approved_submissions,
          COUNT(CASE WHEN qc_status = 'rejected' THEN 1 END) as rejected_submissions,
          COUNT(CASE WHEN consent_status = 'verified' THEN 1 END) as consent_verified_count,
          MIN(created_at) as first_submission,
          MAX(created_at) as last_submission
        FROM submissions
        WHERE mr_id = ?
      `;
      const statsParams = [mr.mr_id];

      if (start_date) {
        statsQuery += " AND DATE(created_at) >= ?";
        statsParams.push(start_date);
      }
      if (end_date) {
        statsQuery += " AND DATE(created_at) <= ?";
        statsParams.push(end_date);
      }

      const stats = db.prepare(statsQuery).get(...statsParams) || {
        total_submissions: 0,
        completed_submissions: 0,
        approved_submissions: 0,
        rejected_submissions: 0,
        consent_verified_count: 0,
      };

      // Get video count
      let videoQuery = `
        SELECT COUNT(*) as count
        FROM generated_videos gv
        INNER JOIN submissions s ON gv.submission_id = s.id
        WHERE s.mr_id = ? AND gv.status = 'completed'
      `;
      const videoParams = [mr.mr_id];

      if (start_date) {
        videoQuery += " AND DATE(s.created_at) >= ?";
        videoParams.push(start_date);
      }
      if (end_date) {
        videoQuery += " AND DATE(s.created_at) <= ?";
        videoParams.push(end_date);
      }

      const videoStats = db.prepare(videoQuery).get(...videoParams) || {
        count: 0,
      };

      // Get recent submissions
      let subQuery = `
        SELECT s.id, s.status, s.qc_status, s.consent_status, s.created_at,
               d.full_name as doctor_name
        FROM submissions s
        LEFT JOIN doctors d ON s.doctor_id = d.id
        WHERE s.mr_id = ?
      `;
      const subParams = [mr.mr_id];

      if (start_date) {
        subQuery += " AND DATE(s.created_at) >= ?";
        subParams.push(start_date);
      }
      if (end_date) {
        subQuery += " AND DATE(s.created_at) <= ?";
        subParams.push(end_date);
      }

      subQuery += " ORDER BY s.created_at DESC LIMIT 10";

      const recentSubmissions = db.prepare(subQuery).all(...subParams);

      return {
        ...mr,
        total_submissions: stats.total_submissions || 0,
        completed_submissions: stats.completed_submissions || 0,
        approved_submissions: stats.approved_submissions || 0,
        rejected_submissions: stats.rejected_submissions || 0,
        consent_verified_count: stats.consent_verified_count || 0,
        videos_generated: videoStats.count || 0,
        first_submission: stats.first_submission,
        last_submission: stats.last_submission,
        recent_submissions: recentSubmissions,
      };
    });

    // Filter out MRs with no submissions (unless no search is specified)
    const filteredMrData = search
      ? mrData.filter((mr) => mr.total_submissions > 0)
      : mrData.filter((mr) => mr.total_submissions > 0);

    // Sort by total submissions descending
    filteredMrData.sort((a, b) => b.total_submissions - a.total_submissions);

    res.json({ mrData: filteredMrData });
  } catch (error) {
    logger.error("[ADMIN] Error fetching MR grouped data:", error);
    res.status(500).json({ error: "Failed to fetch MR grouped data" });
  }
});

/**
 * GET /api/admin/metrics
 * Get overall metrics with date range filter
 */
router.get("/metrics", async (req, res) => {
  try {
    const db = getDb();
    const { start_date, end_date } = req.query;

    let whereClause = "WHERE 1=1";
    const params = [];

    if (start_date) {
      whereClause += " AND DATE(s.created_at) >= ?";
      params.push(start_date);
    }

    if (end_date) {
      whereClause += " AND DATE(s.created_at) <= ?";
      params.push(end_date);
    }

    // Total videos uploaded (submissions with photos)
    const videosUploaded = db
      .prepare(
        `SELECT COUNT(*) as count FROM submissions s ${whereClause} AND s.image_path IS NOT NULL`
      )
      .get(...params);

    // Videos delivered (completed videos in generated_videos)
    let videoDeliveredQuery = `
      SELECT COUNT(*) as count FROM generated_videos gv
      INNER JOIN submissions s ON gv.submission_id = s.id
      ${whereClause.replace("WHERE 1=1", "WHERE 1=1")} 
      AND gv.status = 'completed'
    `;
    if (start_date) {
      videoDeliveredQuery = videoDeliveredQuery.replace(
        "AND DATE(s.created_at) >= ?",
        "AND DATE(s.created_at) >= '" + start_date + "'"
      );
    }
    if (end_date) {
      videoDeliveredQuery = videoDeliveredQuery.replace(
        "AND DATE(s.created_at) <= ?",
        "AND DATE(s.created_at) <= '" + end_date + "'"
      );
    }
    const videosDelivered = db
      .prepare(videoDeliveredQuery.replace(whereClause, "WHERE 1=1"))
      .get();

    // Status breakdown
    const statusBreakdown = db
      .prepare(
        `SELECT 
          COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft,
          COUNT(CASE WHEN status = 'pending_consent' THEN 1 END) as pending_consent,
          COUNT(CASE WHEN status = 'consent_verified' THEN 1 END) as consent_verified,
          COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
          COUNT(CASE WHEN status = 'pending_qc' THEN 1 END) as pending_qc,
          COUNT(CASE WHEN status = 'qc_approved' THEN 1 END) as qc_approved,
          COUNT(CASE WHEN status = 'qc_rejected' THEN 1 END) as qc_rejected,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
          COUNT(*) as total
        FROM submissions s ${whereClause}`
      )
      .get(...params);

    // QC breakdown
    const qcBreakdown = db
      .prepare(
        `SELECT 
          COUNT(CASE WHEN qc_status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN qc_status = 'approved' THEN 1 END) as approved,
          COUNT(CASE WHEN qc_status = 'rejected' THEN 1 END) as rejected
        FROM submissions s ${whereClause}`
      )
      .get(...params);

    // Consent breakdown
    const consentBreakdown = db
      .prepare(
        `SELECT 
          COUNT(CASE WHEN consent_status = 'verified' THEN 1 END) as verified,
          COUNT(CASE WHEN consent_status = 'pending' OR consent_status IS NULL THEN 1 END) as pending
        FROM submissions s ${whereClause}`
      )
      .get(...params);

    // Language distribution
    const languageDistribution = db
      .prepare(`SELECT selected_languages FROM submissions s ${whereClause}`)
      .all(...params);

    const langCounts = {};
    languageDistribution.forEach((row) => {
      const langs = JSON.parse(row.selected_languages || "[]");
      langs.forEach((lang) => {
        langCounts[lang] = (langCounts[lang] || 0) + 1;
      });
    });

    // Daily submission trend (last 30 days or within date range)
    let trendQuery = `
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM submissions s
      ${whereClause}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `;
    const dailyTrend = db.prepare(trendQuery).all(...params);

    // MR performance (top 10)
    let mrPerformanceQuery = `
      SELECT 
        m.name as mr_name,
        m.mr_code,
        COUNT(s.id) as submissions,
        COUNT(CASE WHEN s.status = 'completed' THEN 1 END) as completed
      FROM medical_reps m
      LEFT JOIN submissions s ON s.mr_id = m.id
    `;

    const mrPerformanceParams = [];
    const mrConditions = [];

    if (start_date) {
      mrConditions.push("DATE(s.created_at) >= ?");
      mrPerformanceParams.push(start_date);
    }
    if (end_date) {
      mrConditions.push("DATE(s.created_at) <= ?");
      mrPerformanceParams.push(end_date);
    }

    if (mrConditions.length > 0) {
      mrPerformanceQuery += " WHERE " + mrConditions.join(" AND ");
    }

    mrPerformanceQuery += `
      GROUP BY m.id
      HAVING submissions > 0
      ORDER BY submissions DESC
      LIMIT 10
    `;

    const mrPerformance = db
      .prepare(mrPerformanceQuery)
      .all(...mrPerformanceParams);

    res.json({
      totalVideosUploaded: videosUploaded.count,
      totalVideosDelivered: videosDelivered.count,
      statusBreakdown,
      qcBreakdown,
      consentBreakdown,
      languageDistribution: Object.entries(langCounts)
        .map(([code, count]) => ({
          code,
          name: SUPPORTED_LANGUAGES[code]?.name || code,
          count,
        }))
        .sort((a, b) => b.count - a.count),
      dailyTrend: dailyTrend.reverse(),
      mrPerformance,
    });
  } catch (error) {
    logger.error("[ADMIN] Error fetching metrics:", error);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

/**
 * GET /api/admin/per-language-stats
 * Get detailed per-language audio and video generation statistics
 */
router.get("/per-language-stats", async (req, res) => {
  try {
    const db = getDb();

    // Audio generation stats by language
    const audioByLanguage = db.prepare(`
      SELECT 
        language_code,
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending
      FROM generated_audio
      GROUP BY language_code
      ORDER BY total DESC
    `).all();

    // Video generation stats by language
    const videoByLanguage = db.prepare(`
      SELECT 
        language_code,
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending
      FROM generated_videos
      GROUP BY language_code
      ORDER BY total DESC
    `).all();

    // Submissions with incomplete languages (audio not generated for all selected languages)
    const incompleteAudio = db.prepare(`
      SELECT 
        s.id,
        s.doctor_name,
        s.selected_languages,
        s.status,
        s.created_at,
        (SELECT COUNT(*) FROM generated_audio ga WHERE ga.submission_id = s.id AND ga.status = 'completed') as audio_completed,
        (SELECT COUNT(*) FROM generated_audio ga WHERE ga.submission_id = s.id AND ga.status = 'failed') as audio_failed
      FROM submissions s
      WHERE s.status NOT IN ('draft', 'completed', 'failed')
      ORDER BY s.created_at DESC
      LIMIT 50
    `).all();

    // Parse selected_languages and filter incomplete
    const incompleteSubmissions = incompleteAudio
      .map(s => {
        const selectedLangs = JSON.parse(s.selected_languages || '[]');
        return {
          ...s,
          selected_languages: selectedLangs,
          total_languages: selectedLangs.length,
          audio_completed: s.audio_completed,
          audio_failed: s.audio_failed,
          audio_remaining: selectedLangs.length - s.audio_completed - s.audio_failed
        };
      })
      .filter(s => s.audio_remaining > 0 || s.audio_failed > 0);

    // Active voice clones (not yet deleted)
    const activeVoices = db.prepare(`
      SELECT COUNT(*) as count 
      FROM submissions 
      WHERE voice_clone_status = 'completed' 
        AND elevenlabs_voice_id IS NOT NULL
    `).get();

    // Per-language QC status
    const qcByLanguage = db.prepare(`
      SELECT 
        ga.language_code,
        COUNT(*) as total,
        COUNT(CASE WHEN ga.qc_status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN ga.qc_status = 'rejected' THEN 1 END) as rejected,
        COUNT(CASE WHEN ga.qc_status IS NULL OR ga.qc_status = 'pending' THEN 1 END) as pending
      FROM generated_audio ga
      WHERE ga.status = 'completed'
      GROUP BY ga.language_code
      ORDER BY total DESC
    `).all();

    // Summary stats
    const totalAudio = db.prepare("SELECT COUNT(*) as count FROM generated_audio WHERE status = 'completed'").get();
    const totalVideo = db.prepare("SELECT COUNT(*) as count FROM generated_videos WHERE status = 'completed'").get();
    const totalSubmissionsWithAllLangs = db.prepare(`
      SELECT COUNT(*) as count FROM submissions s
      WHERE NOT EXISTS (
        SELECT 1 FROM (
          SELECT value as lang FROM json_each(s.selected_languages)
        ) langs
        WHERE NOT EXISTS (
          SELECT 1 FROM generated_audio ga 
          WHERE ga.submission_id = s.id 
            AND ga.language_code = langs.lang 
            AND ga.status = 'completed'
        )
      )
      AND s.status NOT IN ('draft')
      AND json_array_length(s.selected_languages) > 0
    `).get();

    res.json({
      summary: {
        total_audio_generated: totalAudio.count,
        total_videos_uploaded: totalVideo.count,
        active_voice_clones: activeVoices.count,
        submissions_with_all_languages_complete: totalSubmissionsWithAllLangs.count
      },
      audio_by_language: audioByLanguage.map(a => ({
        ...a,
        language_name: SUPPORTED_LANGUAGES[a.language_code]?.name || a.language_code
      })),
      video_by_language: videoByLanguage.map(v => ({
        ...v,
        language_name: SUPPORTED_LANGUAGES[v.language_code]?.name || v.language_code
      })),
      qc_by_language: qcByLanguage.map(q => ({
        ...q,
        language_name: SUPPORTED_LANGUAGES[q.language_code]?.name || q.language_code
      })),
      incomplete_submissions: incompleteSubmissions.slice(0, 20)
    });
  } catch (error) {
    logger.error("[ADMIN] Error fetching per-language stats:", error);
    res.status(500).json({ error: "Failed to fetch per-language statistics" });
  }
});

/**
 * GET /api/admin/voice-management
 * Get voice clone management data for scheduled cleanup
 */
router.get("/voice-management", async (req, res) => {
  try {
    const db = getDb();

    // Get all active voices with their age and usage
    const activeVoices = db.prepare(`
      SELECT 
        s.id as submission_id,
        s.doctor_name,
        s.elevenlabs_voice_id,
        s.voice_clone_status,
        s.status as submission_status,
        s.created_at,
        s.updated_at,
        COUNT(DISTINCT ga.id) as audio_generated_count,
        COUNT(DISTINCT gv.id) as videos_uploaded_count,
        GROUP_CONCAT(DISTINCT ga.language_code) as languages_with_audio
      FROM submissions s
      LEFT JOIN generated_audio ga ON s.id = ga.submission_id AND ga.status = 'completed'
      LEFT JOIN generated_videos gv ON s.id = gv.submission_id AND gv.status = 'completed'
      WHERE s.elevenlabs_voice_id IS NOT NULL
      GROUP BY s.id
      ORDER BY s.updated_at ASC
    `).all();

    // Calculate age in hours for each voice
    const now = Date.now();
    const voicesWithAge = activeVoices.map(v => {
      const ageMs = now - new Date(v.updated_at).getTime();
      const ageHours = Math.round(ageMs / (1000 * 60 * 60));
      return {
        ...v,
        age_hours: ageHours,
        languages_with_audio: v.languages_with_audio ? v.languages_with_audio.split(',') : [],
        can_delete: v.submission_status === 'completed' || v.submission_status === 'failed',
        recommended_for_cleanup: ageHours >= 24 && (v.submission_status === 'completed' || v.submission_status === 'failed')
      };
    });

    // Get ElevenLabs account status
    let elevenLabsStatus = null;
    try {
      elevenLabsStatus = await elevenLabs.checkApiHealth();
    } catch (err) {
      logger.warn("[ADMIN] Could not fetch ElevenLabs status:", err.message);
    }

    // Count voices eligible for cleanup (24+ hours old, completed/failed status)
    const eligibleForCleanup = voicesWithAge.filter(v => v.recommended_for_cleanup).length;
    const totalActive = voicesWithAge.filter(v => v.voice_clone_status === 'completed').length;

    res.json({
      summary: {
        total_active_voices: totalActive,
        eligible_for_cleanup: eligibleForCleanup,
        elevenlabs_quota: elevenLabsStatus?.subscription || null
      },
      voices: voicesWithAge,
      cleanup_recommendation: eligibleForCleanup > 0 
        ? `${eligibleForCleanup} voice(s) are 24+ hours old and ready for cleanup`
        : 'No voices currently need cleanup'
    });
  } catch (error) {
    logger.error("[ADMIN] Error fetching voice management data:", error);
    res.status(500).json({ error: "Failed to fetch voice management data" });
  }
});

module.exports = router;
