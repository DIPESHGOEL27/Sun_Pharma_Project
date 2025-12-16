/**
 * QC (Quality Control) Routes
 * Handles QC review workflow for submissions
 */

const express = require("express");
const router = express.Router();
const { body, param, query, validationResult } = require("express-validator");
const path = require("path");

const { getDb } = require("../db/database");
const logger = require("../utils/logger");
const { QC_STATUS, SUBMISSION_STATUS } = require("../utils/constants");
const googleSheetsService = require("../services/googleSheetsService");
const gcsService = require("../services/gcsService");

const toPublicUrlFromGcs = (gcsPath) => {
  if (!gcsPath) return null;
  if (gcsPath.startsWith("http")) return gcsPath;
  if (gcsPath.startsWith("gs://")) return gcsService.gsToHttpUrl(gcsPath);
  return null;
};

const toLocalUrl = (type, filePath) => {
  if (!filePath) return null;
  const filename = filePath.split("/").pop();
  return `/api/uploads/${type}/${filename}`;
};

const parseAudioFiles = (audioPath) => {
  if (!audioPath) return [];

  const mapEntry = (entry, index) => {
    const gcsPath =
      entry?.gcsPath ||
      entry?.gcs_path ||
      (typeof entry === "string" ? entry : null);
    const publicUrl =
      entry?.publicUrl ||
      entry?.public_url ||
      toPublicUrlFromGcs(gcsPath) ||
      toLocalUrl("audio", gcsPath);

    const filename =
      entry?.filename ||
      (gcsPath ? path.basename(gcsPath) : `audio_${index + 1}`);

    return {
      gcsPath,
      publicUrl,
      filename,
    };
  };

  try {
    const parsed = JSON.parse(audioPath);
    if (Array.isArray(parsed)) {
      return parsed
        .map((entry, idx) => mapEntry(entry, idx))
        .filter((a) => a.gcsPath || a.publicUrl);
    }
  } catch (e) {
    // Not JSON, fall through
  }

  return [mapEntry(audioPath, 0)];
};

/**
 * GET /api/qc/pending
 * Get all submissions pending QC review
 */
router.get("/pending", async (req, res) => {
  try {
    const db = getDb();
    const {
      page = 1,
      limit = 20,
      sort = "created_at",
      order = "asc",
    } = req.query;
    const offset = (page - 1) * limit;

    const validSortFields = ["created_at", "doctor_name", "status"];
    const sortField = validSortFields.includes(sort) ? sort : "created_at";
    const sortOrder = order.toLowerCase() === "desc" ? "DESC" : "ASC";

    const submissions = db
      .prepare(
        `
      SELECT s.*, d.full_name as doctor_name, d.email as doctor_email,
             d.phone as doctor_phone, d.specialty,
             m.name as mr_name, m.mr_code
      FROM submissions s
      LEFT JOIN doctors d ON s.doctor_id = d.id
      LEFT JOIN medical_reps m ON s.mr_id = m.id
      WHERE s.qc_status = 'pending' OR s.qc_status = 'in_review'
      ORDER BY ${
        sortField === "doctor_name" ? "d.full_name" : "s." + sortField
      } ${sortOrder}
      LIMIT ? OFFSET ?
    `
      )
      .all(parseInt(limit), parseInt(offset));

    const { total } = db
      .prepare(
        `
      SELECT COUNT(*) as total FROM submissions 
      WHERE qc_status = 'pending' OR qc_status = 'in_review'
    `
      )
      .get();

    res.json({
      submissions: submissions.map((s) => {
        const imageUrl =
          s.image_public_url ||
          toPublicUrlFromGcs(s.image_gcs_path) ||
          toLocalUrl("image", s.image_path);
        const audioFiles = parseAudioFiles(s.audio_path);
        const finalVideoUrl =
          s.final_video_public_url ||
          toPublicUrlFromGcs(s.final_video_gcs_path);

        return {
          ...s,
          image_url: imageUrl,
          audio_files: audioFiles,
          final_video_url: finalVideoUrl,
          selected_languages: JSON.parse(s.selected_languages || "[]"),
        };
      }),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("[QC] Error fetching pending submissions:", error);
    res.status(500).json({ error: "Failed to fetch pending submissions" });
  }
});

/**
 * GET /api/qc/submission/:id
 * Get detailed QC view for a submission
 */
router.get("/submission/:id", async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const submission = db
      .prepare(
        `
      SELECT s.*, d.full_name as doctor_name, d.email as doctor_email,
             d.phone as doctor_phone, d.specialty, d.years_of_practice,
             d.clinic_name, d.address,
             m.name as mr_name, m.mr_code
      FROM submissions s
      LEFT JOIN doctors d ON s.doctor_id = d.id
      LEFT JOIN medical_reps m ON s.mr_id = m.id
      WHERE s.id = ?
    `
      )
      .get(id);

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    // Get validations
    const imageValidation = db
      .prepare(
        `
      SELECT * FROM image_validations 
      WHERE submission_id = ? 
      ORDER BY validated_at DESC LIMIT 1
    `
      )
      .get(id);

    const audioValidation = db
      .prepare(
        `
      SELECT * FROM audio_validations 
      WHERE submission_id = ? 
      ORDER BY validated_at DESC LIMIT 1
    `
      )
      .get(id);

    // Get generated content
    const generatedAudio = db
      .prepare(
        `
      SELECT * FROM generated_audio WHERE submission_id = ?
    `
      )
      .all(id);

    const generatedVideos = db
      .prepare(
        `
      SELECT * FROM generated_videos WHERE submission_id = ?
    `
      )
      .all(id);

    // Get QC history
    const qcHistory = db
      .prepare(
        `
      SELECT * FROM qc_history 
      WHERE submission_id = ? 
      ORDER BY created_at DESC
    `
      )
      .all(id);

    const imageUrl =
      submission.image_public_url ||
      toPublicUrlFromGcs(submission.image_gcs_path) ||
      toLocalUrl("image", submission.image_path);
    const audioFiles = parseAudioFiles(submission.audio_path);
    const finalVideoUrl =
      submission.final_video_public_url ||
      toPublicUrlFromGcs(submission.final_video_gcs_path);

    res.json({
      ...submission,
      image_url: imageUrl,
      audio_files: audioFiles,
      final_video_url: finalVideoUrl,
      selected_languages: JSON.parse(submission.selected_languages || "[]"),
      validations: {
        image: imageValidation,
        audio: audioValidation,
      },
      generated_audio: generatedAudio,
      generated_videos: generatedVideos,
      qc_history: qcHistory,
    });
  } catch (error) {
    logger.error("[QC] Error fetching submission:", error);
    res.status(500).json({ error: "Failed to fetch submission" });
  }
});

/**
 * POST /api/qc/start-review/:id
 * Start QC review (lock submission for review)
 */
router.post(
  "/start-review/:id",
  [body("reviewer_name").notEmpty().withMessage("Reviewer name is required")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const db = getDb();
    const { id } = req.params;
    const { reviewer_name } = req.body;

    try {
      const submission = db
        .prepare("SELECT * FROM submissions WHERE id = ?")
        .get(id);

      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      if (
        submission.qc_status === QC_STATUS.IN_REVIEW &&
        submission.qc_reviewed_by !== reviewer_name
      ) {
        return res.status(409).json({
          error: "Submission is being reviewed by another user",
          reviewed_by: submission.qc_reviewed_by,
        });
      }

      // Update status to in_review
      db.prepare(
        `
        UPDATE submissions 
        SET qc_status = ?, qc_reviewed_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      ).run(QC_STATUS.IN_REVIEW, reviewer_name, id);

      // Log to history
      db.prepare(
        `
        INSERT INTO qc_history (submission_id, reviewer_name, previous_status, new_status, notes)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(
        id,
        reviewer_name,
        submission.qc_status,
        QC_STATUS.IN_REVIEW,
        "Started review"
      );

      logger.info(
        `[QC] Review started for submission ${id} by ${reviewer_name}`
      );

      res.json({
        message: "Review started",
        submission_id: id,
        reviewer: reviewer_name,
      });
    } catch (error) {
      logger.error("[QC] Error starting review:", error);
      res.status(500).json({ error: "Failed to start review" });
    }
  }
);

/**
 * POST /api/qc/approve/:id
 * Approve a submission after QC
 */
router.post(
  "/approve/:id",
  [
    body("reviewer_name").notEmpty().withMessage("Reviewer name is required"),
    body("notes").optional(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const db = getDb();
    const { id } = req.params;
    const { reviewer_name, notes } = req.body;

    try {
      const submission = db
        .prepare("SELECT * FROM submissions WHERE id = ?")
        .get(id);

      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      // Update submission
      db.prepare(
        `
        UPDATE submissions 
        SET qc_status = ?, 
            qc_notes = ?,
            qc_reviewed_by = ?,
            qc_reviewed_at = CURRENT_TIMESTAMP,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      ).run(
        QC_STATUS.APPROVED,
        notes,
        reviewer_name,
        SUBMISSION_STATUS.QC_APPROVED,
        id
      );

      // Log to history
      db.prepare(
        `
        INSERT INTO qc_history (submission_id, reviewer_name, previous_status, new_status, notes)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(
        id,
        reviewer_name,
        submission.qc_status,
        QC_STATUS.APPROVED,
        notes || "Approved"
      );

      // Audit log
      db.prepare(
        `
        INSERT INTO audit_log (entity_type, entity_id, action, actor, details)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(
        "submission",
        id,
        "qc_approved",
        reviewer_name,
        JSON.stringify({ notes })
      );

      // Sync QC status to Google Sheets
      googleSheetsService
        .updateQCStatus(id, {
          status: QC_STATUS.APPROVED,
          notes: notes || "Approved",
          reviewedBy: reviewer_name,
        })
        .catch((err) => {
          logger.error(`[SHEETS] Failed to sync QC approval for ${id}:`, err);
        });

      logger.info(`[QC] Submission ${id} approved by ${reviewer_name}`);

      res.json({
        message: "Submission approved",
        submission_id: id,
        qc_status: QC_STATUS.APPROVED,
      });
    } catch (error) {
      logger.error("[QC] Error approving submission:", error);
      res.status(500).json({ error: "Failed to approve submission" });
    }
  }
);

/**
 * POST /api/qc/reject/:id
 * Reject a submission after QC
 */
router.post(
  "/reject/:id",
  [
    body("reviewer_name").notEmpty().withMessage("Reviewer name is required"),
    body("notes").notEmpty().withMessage("Rejection reason is required"),
    body("rejection_reasons").optional().isArray(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const db = getDb();
    const { id } = req.params;
    const { reviewer_name, notes, rejection_reasons = [] } = req.body;

    try {
      const submission = db
        .prepare("SELECT * FROM submissions WHERE id = ?")
        .get(id);

      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      const fullNotes =
        rejection_reasons.length > 0
          ? `Reasons: ${rejection_reasons.join(", ")}. ${notes}`
          : notes;

      // Update submission
      db.prepare(
        `
        UPDATE submissions 
        SET qc_status = ?, 
            qc_notes = ?,
            qc_reviewed_by = ?,
            qc_reviewed_at = CURRENT_TIMESTAMP,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      ).run(
        QC_STATUS.REJECTED,
        fullNotes,
        reviewer_name,
        SUBMISSION_STATUS.QC_REJECTED,
        id
      );

      // Log to history
      db.prepare(
        `
        INSERT INTO qc_history (submission_id, reviewer_name, previous_status, new_status, notes)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(
        id,
        reviewer_name,
        submission.qc_status,
        QC_STATUS.REJECTED,
        fullNotes
      );

      // Audit log
      db.prepare(
        `
        INSERT INTO audit_log (entity_type, entity_id, action, actor, details)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(
        "submission",
        id,
        "qc_rejected",
        reviewer_name,
        JSON.stringify({
          notes,
          rejection_reasons,
        })
      );

      // Sync QC status to Google Sheets
      googleSheetsService
        .updateQCStatus(id, {
          status: QC_STATUS.REJECTED,
          notes: fullNotes,
          reviewedBy: reviewer_name,
        })
        .catch((err) => {
          logger.error(`[SHEETS] Failed to sync QC rejection for ${id}:`, err);
        });

      logger.info(
        `[QC] Submission ${id} rejected by ${reviewer_name}: ${notes}`
      );

      res.json({
        message: "Submission rejected",
        submission_id: id,
        qc_status: QC_STATUS.REJECTED,
        notes: fullNotes,
      });
    } catch (error) {
      logger.error("[QC] Error rejecting submission:", error);
      res.status(500).json({ error: "Failed to reject submission" });
    }
  }
);

/**
 * POST /api/qc/request-changes/:id
 * Request changes without full rejection
 */
router.post(
  "/request-changes/:id",
  [
    body("reviewer_name").notEmpty().withMessage("Reviewer name is required"),
    body("changes_requested")
      .isArray({ min: 1 })
      .withMessage("At least one change must be specified"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const db = getDb();
    const { id } = req.params;
    const { reviewer_name, changes_requested, notes } = req.body;

    try {
      const submission = db
        .prepare("SELECT * FROM submissions WHERE id = ?")
        .get(id);

      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      const changeNotes = `Changes requested: ${changes_requested.join(
        ", "
      )}. ${notes || ""}`.trim();

      // Update submission - keep status as pending for resubmission
      db.prepare(
        `
        UPDATE submissions 
        SET qc_status = 'pending', 
            qc_notes = ?,
            qc_reviewed_by = ?,
            status = 'pending_changes',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      ).run(changeNotes, reviewer_name, id);

      // Log to history
      db.prepare(
        `
        INSERT INTO qc_history (submission_id, reviewer_name, previous_status, new_status, notes)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(
        id,
        reviewer_name,
        submission.qc_status,
        "changes_requested",
        changeNotes
      );

      logger.info(
        `[QC] Changes requested for submission ${id} by ${reviewer_name}`
      );

      res.json({
        message: "Changes requested",
        submission_id: id,
        changes_requested,
      });
    } catch (error) {
      logger.error("[QC] Error requesting changes:", error);
      res.status(500).json({ error: "Failed to request changes" });
    }
  }
);

/**
 * GET /api/qc/stats
 * Get QC statistics
 */
router.get("/stats", async (req, res) => {
  try {
    const db = getDb();

    const stats = db
      .prepare(
        `
      SELECT 
        COUNT(CASE WHEN qc_status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN qc_status = 'in_review' THEN 1 END) as in_review,
        COUNT(CASE WHEN qc_status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN qc_status = 'rejected' THEN 1 END) as rejected,
        COUNT(*) as total
      FROM submissions
    `
      )
      .get();

    // Get today's stats
    const today = new Date().toISOString().split("T")[0];
    const todayStats = db
      .prepare(
        `
      SELECT 
        COUNT(CASE WHEN qc_status = 'approved' THEN 1 END) as approved_today,
        COUNT(CASE WHEN qc_status = 'rejected' THEN 1 END) as rejected_today
      FROM submissions
      WHERE DATE(qc_reviewed_at) = ?
    `
      )
      .get(today);

    // Get reviewer leaderboard
    const reviewers = db
      .prepare(
        `
      SELECT 
        qc_reviewed_by as reviewer,
        COUNT(*) as total_reviews,
        COUNT(CASE WHEN qc_status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN qc_status = 'rejected' THEN 1 END) as rejected
      FROM submissions
      WHERE qc_reviewed_by IS NOT NULL
      GROUP BY qc_reviewed_by
      ORDER BY total_reviews DESC
      LIMIT 10
    `
      )
      .all();

    res.json({
      ...stats,
      today: todayStats,
      reviewers,
    });
  } catch (error) {
    logger.error("[QC] Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch QC stats" });
  }
});

/**
 * GET /api/qc/history/:submissionId
 * Get QC history for a submission
 */
router.get("/history/:submissionId", async (req, res) => {
  try {
    const db = getDb();
    const { submissionId } = req.params;

    const history = db
      .prepare(
        `
      SELECT * FROM qc_history 
      WHERE submission_id = ? 
      ORDER BY created_at DESC
    `
      )
      .all(submissionId);

    res.json(history);
  } catch (error) {
    logger.error("[QC] Error fetching history:", error);
    res.status(500).json({ error: "Failed to fetch QC history" });
  }
});

module.exports = router;
