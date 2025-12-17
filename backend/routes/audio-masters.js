/**
 * Audio Masters Routes
 * Handles language-wise master audio management
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { body, param, validationResult } = require("express-validator");

const { getDb } = require("../db/database");
const logger = require("../utils/logger");
const { validateAudio } = require("../utils/validators");
const { SUPPORTED_LANGUAGES, UPLOAD_CONFIG } = require("../utils/constants");

// Configure multer for audio uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads/audio_masters");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const langCode = req.body.language_code || "unknown";
    const uniqueName = `${langCode}_${uuidv4()}${path.extname(
      file.originalname
    )}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (UPLOAD_CONFIG.AUDIO.allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid audio format"), false);
    }
  },
  limits: {
    fileSize: UPLOAD_CONFIG.AUDIO.maxSizeBytes,
  },
});

/**
 * GET /api/audio-masters
 * List all audio masters
 */
router.get("/", async (req, res) => {
  try {
    const db = getDb();
    const { language_code, is_active } = req.query;

    let query = "SELECT * FROM audio_masters WHERE 1=1";
    const params = [];

    if (language_code) {
      query += " AND language_code = ?";
      params.push(language_code);
    }

    if (is_active !== undefined) {
      query += " AND is_active = ?";
      params.push(is_active === "true" ? 1 : 0);
    }

    query += " ORDER BY language_code, created_at DESC";

    const masters = db.prepare(query).all(...params);

    // Group by language
    const grouped = masters.reduce((acc, master) => {
      const lang = SUPPORTED_LANGUAGES[master.language_code] || {
        name: master.language_code,
      };
      if (!acc[master.language_code]) {
        acc[master.language_code] = {
          language_code: master.language_code,
          language_name: lang.name,
          native_name: lang.nativeName,
          masters: [],
        };
      }
      acc[master.language_code].masters.push(master);
      return acc;
    }, {});

    res.json({
      languages: Object.values(grouped),
      total: masters.length,
    });
  } catch (error) {
    logger.error("Error fetching audio masters:", error);
    res.status(500).json({ error: "Failed to fetch audio masters" });
  }
});

/**
 * GET /api/audio-masters/languages
 * List all supported languages
 */
router.get("/languages", async (req, res) => {
  try {
    const db = getDb();

    const languages = db
      .prepare(
        `
      SELECT l.*, 
        (SELECT COUNT(*) FROM audio_masters am 
         WHERE am.language_code = l.code AND am.is_active = 1) as active_masters_count
      FROM languages l
      WHERE l.is_active = 1
      ORDER BY l.name
    `
      )
      .all();

    res.json(languages);
  } catch (error) {
    logger.error("Error fetching languages:", error);
    res.status(500).json({ error: "Failed to fetch languages" });
  }
});

/**
 * GET /api/audio-masters/:id
 * Get single audio master
 */
router.get("/:id", async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const master = db
      .prepare("SELECT * FROM audio_masters WHERE id = ?")
      .get(id);

    if (!master) {
      return res.status(404).json({ error: "Audio master not found" });
    }

    res.json(master);
  } catch (error) {
    logger.error("Error fetching audio master:", error);
    res.status(500).json({ error: "Failed to fetch audio master" });
  }
});

/**
 * POST /api/audio-masters
 * Upload new audio master for a language
 */
router.post(
  "/",
  upload.single("audio"),
  [
    body("language_code").notEmpty().withMessage("Language code is required"),
    body("name").notEmpty().withMessage("Name is required"),
    body("description").optional(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const db = getDb();
      const { language_code, name, description, created_by } = req.body;

      // Validate language code
      if (!SUPPORTED_LANGUAGES[language_code]) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({
          error: `Invalid language code. Supported: ${Object.keys(
            SUPPORTED_LANGUAGES
          ).join(", ")}`,
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Audio file is required" });
      }

      // Validate audio - skip duration check for master audio files
      // Master audio files are short script recordings, not voice samples
      const validation = await validateAudio(req.file.path);
      
      // For master audio, we only check format, size, and sample rate
      // Duration check is skipped as master files can be short
      const criticalChecks = ['exists', 'format', 'size'];
      const criticalErrors = validation.errors.filter(err => 
        !err.toLowerCase().includes('duration')
      );
      
      if (criticalErrors.length > 0) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          error: "Audio validation failed",
          details: {
            ...validation,
            errors: criticalErrors
          },
        });
      }

      // Insert audio master
      const result = db
        .prepare(
          `
        INSERT INTO audio_masters (
          language_code, name, description, file_path, 
          duration_seconds, is_active, created_by
        )
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `
        )
        .run(
          language_code,
          name,
          description || null,
          req.file.path,
          validation.details.durationSeconds || null,
          created_by || null
        );

      // Log audit
      db.prepare(
        `
        INSERT INTO audit_log (entity_type, entity_id, action, actor, details)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run(
        "audio_master",
        result.lastInsertRowid,
        "created",
        created_by || "system",
        JSON.stringify({ language_code, name })
      );

      logger.info(`[AUDIO MASTER] Created: ${name} for ${language_code}`);

      res.status(201).json({
        message: "Audio master created successfully",
        id: result.lastInsertRowid,
        language_code,
        name,
        duration_seconds: validation.details.durationSeconds,
      });
    } catch (error) {
      logger.error("Error creating audio master:", error);
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: "Failed to create audio master" });
    }
  }
);

/**
 * PUT /api/audio-masters/:id
 * Update audio master
 */
router.put(
  "/:id",
  [
    param("id").isInt(),
    body("name").optional().trim(),
    body("description").optional(),
    body("is_active").optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const { name, description, is_active } = req.body;

      const master = db
        .prepare("SELECT * FROM audio_masters WHERE id = ?")
        .get(id);
      if (!master) {
        return res.status(404).json({ error: "Audio master not found" });
      }

      const updates = [];
      const params = [];

      if (name !== undefined) {
        updates.push("name = ?");
        params.push(name);
      }

      if (description !== undefined) {
        updates.push("description = ?");
        params.push(description);
      }

      if (is_active !== undefined) {
        updates.push("is_active = ?");
        params.push(is_active ? 1 : 0);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      updates.push("updated_at = CURRENT_TIMESTAMP");
      params.push(id);

      db.prepare(
        `UPDATE audio_masters SET ${updates.join(", ")} WHERE id = ?`
      ).run(...params);

      logger.info(`[AUDIO MASTER] Updated: ${id}`);

      res.json({ message: "Audio master updated successfully" });
    } catch (error) {
      logger.error("Error updating audio master:", error);
      res.status(500).json({ error: "Failed to update audio master" });
    }
  }
);

/**
 * DELETE /api/audio-masters/:id
 * Delete audio master
 */
router.delete("/:id", async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const master = db
      .prepare("SELECT * FROM audio_masters WHERE id = ?")
      .get(id);
    if (!master) {
      return res.status(404).json({ error: "Audio master not found" });
    }

    // Check if master is being used
    const usageCount = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM generated_audio WHERE audio_master_id = ?
    `
      )
      .get(id);

    if (usageCount.count > 0) {
      return res.status(400).json({
        error: "Cannot delete audio master that has been used for generation",
        usage_count: usageCount.count,
      });
    }

    // Delete file
    if (master.file_path && fs.existsSync(master.file_path)) {
      fs.unlinkSync(master.file_path);
    }

    // Delete record
    db.prepare("DELETE FROM audio_masters WHERE id = ?").run(id);

    logger.info(`[AUDIO MASTER] Deleted: ${id}`);

    res.json({ message: "Audio master deleted successfully" });
  } catch (error) {
    logger.error("Error deleting audio master:", error);
    res.status(500).json({ error: "Failed to delete audio master" });
  }
});

/**
 * POST /api/audio-masters/:id/set-active
 * Set an audio master as the active one for its language
 */
router.post("/:id/set-active", async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const master = db
      .prepare("SELECT * FROM audio_masters WHERE id = ?")
      .get(id);
    if (!master) {
      return res.status(404).json({ error: "Audio master not found" });
    }

    // Deactivate all other masters for this language
    db.prepare(
      `
      UPDATE audio_masters 
      SET is_active = 0, updated_at = CURRENT_TIMESTAMP 
      WHERE language_code = ? AND id != ?
    `
    ).run(master.language_code, id);

    // Activate this master
    db.prepare(
      `
      UPDATE audio_masters 
      SET is_active = 1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `
    ).run(id);

    logger.info(`[AUDIO MASTER] Set active: ${id} for ${master.language_code}`);

    res.json({
      message: "Audio master set as active",
      id,
      language_code: master.language_code,
    });
  } catch (error) {
    logger.error("Error setting active audio master:", error);
    res.status(500).json({ error: "Failed to set active audio master" });
  }
});

module.exports = router;
