/**
 * Submissions Routes
 * Handles doctor submission CRUD operations
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
const { sendWhatsAppTemplate } = require("../utils/gupshup");
const {
  validateImage,
  validateAudio,
  validateEmail,
  validatePhone,
  normalizePhone,
  validateLanguageCodes,
} = require("../utils/validators");
const {
  UPLOAD_CONFIG,
  SUBMISSION_STATUS,
  QC_STATUS,
  MAX_LANGUAGE_SELECTIONS,
} = require("../utils/constants");
const googleSheetsService = require("../services/googleSheetsService");
const gcsService = require("../services/gcsService");

const sendMrSubmissionWhatsapp = async ({
  mrPhone,
  mrName,
  doctorName,
  submissionId,
}) => {
  const templateId =
    process.env.GUPSHUP_VIDEO_UPLOAD_SUCCESS_TEMPLATE_ID ||
    process.env.GUPSHUP_TEMPLATE_SUBMISSION_ID;
  if (!templateId || !mrPhone) return;

  try {
    await sendWhatsAppTemplate({
      templateId,
      destinationNumber: mrPhone,
      params: [mrName || "", doctorName || "", String(submissionId)],
    });
    logger.info(
      `[WHATSAPP] Submission message sent to MR ${mrPhone} for submission ${submissionId}`,
    );
  } catch (error) {
    logger.error(
      `[WHATSAPP] Failed to send submission message for ${submissionId}:`,
      error,
    );
  }
};

// Configure multer for file uploads
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
    // Not JSON, fall back to single entry
  }

  return [mapEntry(audioPath, 0)];
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../uploads", file.fieldname);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(
      file.originalname,
    )}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === "image") {
    if (UPLOAD_CONFIG.IMAGE.allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Invalid image format. Allowed: ${UPLOAD_CONFIG.IMAGE.allowedExtensions.join(
            ", ",
          )}`,
        ),
        false,
      );
    }
  } else if (file.fieldname === "audio") {
    if (UPLOAD_CONFIG.AUDIO.allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Invalid audio format. Allowed: ${UPLOAD_CONFIG.AUDIO.allowedExtensions.join(
            ", ",
          )}`,
        ),
        false,
      );
    }
  } else {
    cb(null, true);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: Math.max(
      UPLOAD_CONFIG.IMAGE.maxSizeBytes,
      UPLOAD_CONFIG.AUDIO.maxSizeBytes,
    ),
  },
});

// Constants for multiple audio upload
const MAX_AUDIO_FILES = 5;
const MIN_AUDIO_DURATION_SECONDS = 60; // 1 minute minimum per file

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

/**
 * POST /api/submissions/validate-image
 * Validate image file before submission
 */
router.post("/validate-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        isValid: false,
        errors: ["No image file provided"],
      });
    }

    const validation = await validateImage(req.file.path);

    // Clean up the temp file after validation
    fs.unlinkSync(req.file.path);

    res.json(validation);
  } catch (error) {
    logger.error("Image validation error:", error);
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      isValid: false,
      errors: ["Validation failed: " + error.message],
    });
  }
});

/**
 * POST /api/submissions/validate-audio
 * Validate audio file before submission
 */
router.post("/validate-audio", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        isValid: false,
        errors: ["No audio file provided"],
      });
    }

    const validation = await validateAudio(req.file.path);

    // Clean up the temp file after validation
    fs.unlinkSync(req.file.path);

    res.json(validation);
  } catch (error) {
    logger.error("Audio validation error:", error);
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      isValid: false,
      errors: ["Validation failed: " + error.message],
    });
  }
});

/**
 * GET /api/submissions
 * List all submissions with pagination
 */
router.get("/", async (req, res) => {
  try {
    const db = getDb();
    const { page = 1, limit = 20, status, qc_status } = req.query;
    const offset = (page - 1) * limit;

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

    if (qc_status) {
      query += " AND s.qc_status = ?";
      params.push(qc_status);
    }

    query += " ORDER BY s.created_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const submissions = db.prepare(query).all(...params);

    // Get total count
    let countQuery = "SELECT COUNT(*) as total FROM submissions WHERE 1=1";
    const countParams = [];
    if (status) {
      countQuery += " AND status = ?";
      countParams.push(status);
    }
    if (qc_status) {
      countQuery += " AND qc_status = ?";
      countParams.push(qc_status);
    }
    const { total } = db.prepare(countQuery).get(...countParams);

    res.json({
      submissions: submissions.map((s) => ({
        ...s,
        selected_languages: JSON.parse(s.selected_languages || "[]"),
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("Error fetching submissions:", error);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

/**
 * GET /api/submissions/by-language
 * List submissions expanded by language - each submission+language = separate row
 * This is the primary view for admin dashboard
 */
router.get("/by-language", async (req, res) => {
  try {
    const db = getDb();
    const {
      page = 1,
      limit = 30,
      status,
      qc_status,
      language,
      search,
    } = req.query;
    const offset = (page - 1) * limit;

    // Get all submissions with their data
    let baseQuery = `
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
      baseQuery += " AND s.status = ?";
      params.push(status);
    }

    if (search) {
      baseQuery +=
        " AND (d.full_name LIKE ? OR d.email LIKE ? OR m.mr_code LIKE ? OR s.id = ?)";
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, search);
    }

    baseQuery += " ORDER BY s.created_at DESC";

    const submissions = db.prepare(baseQuery).all(...params);

    // Get all generated_audio and generated_videos for these submissions
    const submissionIds = submissions.map((s) => s.id);

    let audioData = [];
    let videoData = [];

    if (submissionIds.length > 0) {
      const placeholders = submissionIds.map(() => "?").join(",");

      try {
        audioData = db
          .prepare(
            `
          SELECT submission_id, language_code, status, qc_status, qc_notes, 
                 created_at, updated_at, gcs_path, public_url
          FROM generated_audio
          WHERE submission_id IN (${placeholders})
        `,
          )
          .all(...submissionIds);
      } catch (e) {
        logger.warn(
          "Error fetching generated_audio, trying without public_url:",
          e.message,
        );
        audioData = db
          .prepare(
            `
          SELECT submission_id, language_code, status, qc_status, qc_notes, 
                 created_at, updated_at, gcs_path
          FROM generated_audio
          WHERE submission_id IN (${placeholders})
        `,
          )
          .all(...submissionIds);
      }

      try {
        videoData = db
          .prepare(
            `
          SELECT submission_id, language_code, status, qc_status, qc_notes,
                 created_at, updated_at, gcs_path, public_url, video_url
          FROM generated_videos
          WHERE submission_id IN (${placeholders})
        `,
          )
          .all(...submissionIds);
      } catch (e) {
        logger.warn(
          "Error fetching generated_videos with public_url, trying basic columns:",
          e.message,
        );
        try {
          videoData = db
            .prepare(
              `
            SELECT submission_id, language_code, status, qc_status, qc_notes,
                   created_at, updated_at, gcs_path
            FROM generated_videos
            WHERE submission_id IN (${placeholders})
          `,
            )
            .all(...submissionIds);
        } catch (e2) {
          logger.warn(
            "Error fetching generated_videos, trying without qc columns:",
            e2.message,
          );
          videoData = db
            .prepare(
              `
            SELECT submission_id, language_code, status, created_at, updated_at, gcs_path
            FROM generated_videos
            WHERE submission_id IN (${placeholders})
          `,
            )
            .all(...submissionIds);
        }
      }
    }

    // Create lookup maps
    const audioBySubmissionLang = {};
    audioData.forEach((a) => {
      const key = `${a.submission_id}-${a.language_code}`;
      audioBySubmissionLang[key] = a;
    });

    const videoBySubmissionLang = {};
    videoData.forEach((v) => {
      const key = `${v.submission_id}-${v.language_code}`;
      videoBySubmissionLang[key] = v;
    });

    // Expand submissions by language
    let expandedRows = [];
    submissions.forEach((sub) => {
      let langs = [];
      try {
        langs = JSON.parse(sub.selected_languages || "[]");
        if (!Array.isArray(langs)) langs = [];
      } catch (e) {
        logger.warn(
          `Invalid selected_languages JSON for submission ${sub.id}:`,
          sub.selected_languages,
        );
        langs = [];
      }
      langs.forEach((langCode) => {
        const key = `${sub.id}-${langCode}`;
        const audio = audioBySubmissionLang[key];
        const video = videoBySubmissionLang[key];

        // Determine per-language status
        let langStatus = "pending";
        let langQcStatus = "pending";

        if (video?.status === "completed") {
          langStatus = "video_ready";
          langQcStatus = video.qc_status || "pending";
        } else if (audio?.status === "completed") {
          langStatus = "audio_ready";
          langQcStatus = audio.qc_status || "pending";
        } else if (audio?.status === "processing") {
          langStatus = "processing";
        } else if (sub.voice_clone_status === "completed") {
          langStatus = "voice_ready";
        } else if (sub.status === "consent_verified") {
          langStatus = "consent_verified";
        } else if (sub.status === "pending_consent") {
          langStatus = "pending_consent";
        } else if (sub.status === "failed") {
          langStatus = "failed";
        }

        expandedRows.push({
          entry_id: key,
          submission_id: sub.id,
          language_code: langCode,
          doctor_name: sub.doctor_name,
          doctor_email: sub.doctor_email,
          doctor_phone: sub.doctor_phone,
          mr_name: sub.mr_name,
          mr_code: sub.mr_code,
          submission_status: sub.status,
          language_status: langStatus,
          qc_status: langQcStatus,
          qc_notes: video?.qc_notes || audio?.qc_notes || "",
          video_url:
            video?.public_url || video?.video_url || video?.gcs_path || "",
          audio_url: audio?.public_url || audio?.gcs_path || "",
          created_at: sub.created_at,
          updated_at: video?.updated_at || audio?.updated_at || sub.updated_at,
        });
      });
    });

    // Apply language filter
    if (language) {
      expandedRows = expandedRows.filter((r) => r.language_code === language);
    }

    // Apply QC status filter
    if (qc_status) {
      expandedRows = expandedRows.filter((r) => r.qc_status === qc_status);
    }

    // Get total count before pagination
    const total = expandedRows.length;

    // Apply pagination
    const paginatedRows = expandedRows.slice(offset, offset + parseInt(limit));

    res.json({
      entries: paginatedRows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error("Error fetching submissions by language:", error);
    res.status(500).json({ error: "Failed to fetch submissions by language" });
  }
});

/**
 * GET /api/submissions/:id
 * Get single submission details
 */
router.get("/:id", async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const submission = db
      .prepare(
        `
      SELECT s.*, d.full_name as doctor_name, d.email as doctor_email,
             d.phone as doctor_phone, d.specialty, d.years_of_practice,
             d.clinic_name, d.address,
             m.name as mr_name, m.mr_code, m.phone as mr_phone
      FROM submissions s
      LEFT JOIN doctors d ON s.doctor_id = d.id
      LEFT JOIN medical_reps m ON s.mr_id = m.id
      WHERE s.id = ?
    `,
      )
      .get(id);

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    // Get generated audio for this submission
    const generatedAudio = db
      .prepare(
        `
      SELECT * FROM generated_audio WHERE submission_id = ?
    `,
      )
      .all(id);

    // Get generated videos
    const generatedVideos = db
      .prepare(
        `
      SELECT * FROM generated_videos WHERE submission_id = ?
    `,
      )
      .all(id);

    // Get validation results
    const imageValidation = db
      .prepare(
        `
      SELECT * FROM image_validations WHERE submission_id = ? ORDER BY validated_at DESC LIMIT 1
    `,
      )
      .get(id);

    const audioValidation = db
      .prepare(
        `
      SELECT * FROM audio_validations WHERE submission_id = ? ORDER BY validated_at DESC LIMIT 1
    `,
      )
      .get(id);

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
      generated_audio: generatedAudio,
      generated_videos: generatedVideos,
      validations: {
        image: imageValidation,
        audio: audioValidation,
      },
    });
  } catch (error) {
    logger.error("Error fetching submission:", error);
    res.status(500).json({ error: "Failed to fetch submission" });
  }
});

/**
 * POST /api/submissions
 * Create new submission with multiple audio files
 */
router.post(
  "/",
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "audio", maxCount: MAX_AUDIO_FILES },
  ]),
  [
    body("doctor_name")
      .trim()
      .notEmpty()
      .withMessage("Doctor name is required"),
    body("doctor_email").isEmail().withMessage("Valid email is required"),
    body("doctor_phone").notEmpty().withMessage("Phone number is required"),
    body("specialty").trim().notEmpty().withMessage("Specialty is required"),
    body("years_of_practice").optional().isInt({ min: 0 }),
    body("clinic_name").optional().trim(),
    body("address").optional().trim(),
    body("city").optional().trim(),
    body("state").optional().trim(),
    body("campaign_name").optional().trim(),
    body("mr_name").optional().trim(),
    body("mr_code").optional().trim(),
    body("mr_phone").optional().trim(),
    body("selected_languages")
      .notEmpty()
      .withMessage("At least one language must be selected"),
  ],
  handleValidationErrors,
  async (req, res) => {
    const db = getDb();

    try {
      const {
        doctor_name,
        doctor_email,
        doctor_phone,
        specialty,
        years_of_practice,
        clinic_name,
        address,
        city,
        state,
        campaign_name,
        mr_name,
        mr_code,
        mr_phone,
        selected_languages,
      } = req.body;

      // Validate phone
      if (!validatePhone(doctor_phone)) {
        return res.status(400).json({ error: "Invalid phone number format" });
      }

      // Parse and validate languages
      let languages;
      try {
        languages =
          typeof selected_languages === "string"
            ? JSON.parse(selected_languages)
            : selected_languages;
      } catch (e) {
        return res
          .status(400)
          .json({ error: "Invalid language selection format" });
      }

      const langValidation = validateLanguageCodes(
        languages,
        MAX_LANGUAGE_SELECTIONS,
      );
      if (!langValidation.isValid) {
        return res.status(400).json({ errors: langValidation.errors });
      }

      // Validate uploaded files
      const imageFile = req.files?.image?.[0];
      const audioFiles = req.files?.audio || [];

      if (!imageFile) {
        return res.status(400).json({ error: "Doctor photo is required" });
      }
      if (audioFiles.length === 0) {
        return res
          .status(400)
          .json({ error: "At least one voice sample is required" });
      }
      if (audioFiles.length > MAX_AUDIO_FILES) {
        return res
          .status(400)
          .json({ error: `Maximum ${MAX_AUDIO_FILES} audio files allowed` });
      }

      // Validate image
      const imageValidation = await validateImage(imageFile.path);
      if (!imageValidation.isValid) {
        // Clean up uploaded files
        fs.unlinkSync(imageFile.path);
        audioFiles.forEach(
          (f) => fs.existsSync(f.path) && fs.unlinkSync(f.path),
        );
        return res.status(400).json({
          error: "Image validation failed",
          details: imageValidation,
        });
      }

      // Validate all audio files (each must be at least 1 minute)
      const audioValidations = [];
      let totalDuration = 0;

      for (const audioFile of audioFiles) {
        const audioValidation = await validateAudio(audioFile.path);
        audioValidations.push({
          filename: audioFile.originalname,
          path: audioFile.path,
          ...audioValidation,
        });

        if (audioValidation.details?.durationSeconds) {
          totalDuration += audioValidation.details.durationSeconds;
        }

        // Check minimum duration of 1 minute per file
        if (
          audioValidation.details?.durationSeconds < MIN_AUDIO_DURATION_SECONDS
        ) {
          // Clean up all files
          fs.unlinkSync(imageFile.path);
          audioFiles.forEach(
            (f) => fs.existsSync(f.path) && fs.unlinkSync(f.path),
          );
          return res.status(400).json({
            error: `Audio file "${audioFile.originalname}" is too short. Minimum 1 minute required.`,
            details: audioValidation,
          });
        }

        if (!audioValidation.isValid) {
          fs.unlinkSync(imageFile.path);
          audioFiles.forEach(
            (f) => fs.existsSync(f.path) && fs.unlinkSync(f.path),
          );
          return res.status(400).json({
            error: `Audio validation failed for "${audioFile.originalname}"`,
            details: audioValidation,
          });
        }
      }

      // Start transaction
      const insertDoctor = db.prepare(`
        INSERT INTO doctors (full_name, email, phone, specialty, years_of_practice, clinic_name, address)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMR = db.prepare(`
        INSERT OR IGNORE INTO medical_reps (name, mr_code, phone)
        VALUES (?, ?, ?)
      `);

      const getMR = db.prepare(`SELECT id FROM medical_reps WHERE mr_code = ?`);

      const insertSubmission = db.prepare(`
        INSERT INTO submissions (
          doctor_id, mr_id, image_path, audio_path, 
          audio_duration_seconds, selected_languages, status,
          doctor_name, doctor_email, doctor_phone, doctor_specialization,
          doctor_clinic_name, doctor_city, doctor_state, campaign_name,
          mr_name, mr_code
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertImageValidation = db.prepare(`
        INSERT INTO image_validations (
          submission_id, is_valid, has_face, is_front_facing,
          has_good_lighting, has_plain_background, resolution_ok,
          no_occlusion, validation_details
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertAudioValidation = db.prepare(`
        INSERT INTO audio_validations (
          submission_id, is_valid, duration_ok, format_ok,
          quality_ok, actual_duration_seconds, format_detected,
          sample_rate, validation_details
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = db.transaction(() => {
        // Insert doctor
        const doctorResult = insertDoctor.run(
          doctor_name,
          doctor_email,
          normalizePhone(doctor_phone),
          specialty,
          years_of_practice || null,
          clinic_name || null,
          address || null,
        );
        const doctorId = doctorResult.lastInsertRowid;

        // Insert MR if provided
        let mrId = null;
        if (mr_name && mr_code) {
          insertMR.run(mr_name, mr_code, mr_phone || null);
          const mr = getMR.get(mr_code);
          mrId = mr?.id;
        }

        // Insert submission with doctor/MR info directly
        const submissionResult = insertSubmission.run(
          doctorId,
          mrId,
          imageFile.path,
          // Store multiple audio paths as JSON array
          JSON.stringify(audioFiles.map((f) => f.path)),
          totalDuration,
          JSON.stringify(languages),
          SUBMISSION_STATUS.PENDING_CONSENT,
          doctor_name,
          doctor_email,
          normalizePhone(doctor_phone),
          specialty,
          clinic_name || null,
          city || null,
          state || null,
          campaign_name || null,
          mr_name || null,
          mr_code || null,
        );
        const submissionId = submissionResult.lastInsertRowid;

        // Store validation results
        insertImageValidation.run(
          submissionId,
          imageValidation.isValid ? 1 : 0,
          imageValidation.checks.hasFace ? 1 : 0,
          imageValidation.checks.frontFacing ? 1 : 0,
          imageValidation.checks.goodLighting ? 1 : 0,
          imageValidation.checks.plainBackground ? 1 : 0,
          imageValidation.checks.resolution ? 1 : 0,
          imageValidation.checks.noOcclusion ? 1 : 0,
          JSON.stringify(imageValidation),
        );

        // Store validation for each audio file
        for (const av of audioValidations) {
          insertAudioValidation.run(
            submissionId,
            av.isValid ? 1 : 0,
            av.checks?.duration ? 1 : 0,
            av.checks?.format ? 1 : 0,
            av.checks?.sampleRate ? 1 : 0,
            av.details?.durationSeconds || null,
            av.details?.format || null,
            av.details?.sampleRate || null,
            JSON.stringify(av),
          );
        }

        return { submissionId, doctorId };
      });

      const result = transaction();

      logger.info(
        `[SUBMISSION] New submission created: ${result.submissionId} with ${audioFiles.length} audio files`,
      );

      // Sync to Google Sheets (async, non-blocking)
      const submissionData = {
        id: result.submissionId,
        created_at: new Date().toISOString(),
        doctor_name,
        doctor_email,
        doctor_phone: normalizePhone(doctor_phone),
        doctor_specialization: specialty,
        doctor_clinic_name: clinic_name,
        doctor_city: city,
        doctor_state: state,
        mr_name,
        mr_code,
        consent_status: "pending",
        selected_languages: JSON.stringify(languages),
        status: SUBMISSION_STATUS.PENDING_CONSENT,
        image_path: imageFile.path,
        audio_path: JSON.stringify(audioFiles.map((f) => f.path)),
      };
      googleSheetsService.syncSubmission(submissionData).catch((err) => {
        logger.error(
          `[SHEETS] Failed to sync submission ${result.submissionId}:`,
          err,
        );
      });

      // Send WhatsApp notification to MR (async, non-blocking)
      if (mr_phone) {
        sendMrSubmissionWhatsapp({
          mrPhone: normalizePhone(mr_phone),
          mrName: mr_name,
          doctorName: doctor_name,
          submissionId: result.submissionId,
        });
      }

      res.status(201).json({
        message: "Submission created successfully",
        submission_id: result.submissionId,
        doctor_id: result.doctorId,
        status: SUBMISSION_STATUS.PENDING_CONSENT,
        audio_files_count: audioFiles.length,
        total_duration_seconds: totalDuration,
        validations: {
          image: imageValidation,
          audio: audioValidations,
        },
        next_step: "consent_verification",
      });
    } catch (error) {
      logger.error("Error creating submission:", error);
      // Clean up files on error
      if (req.files?.image?.[0]) {
        fs.unlinkSync(req.files.image[0].path);
      }
      // Clean up all audio files
      if (req.files?.audio) {
        req.files.audio.forEach((f) => {
          if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
        });
      }
      res.status(500).json({ error: "Failed to create submission" });
    }
  },
);

/**
 * POST /api/submissions/gcs
 * Create new submission with files already uploaded to GCS
 * This endpoint accepts GCS paths instead of file uploads
 */
router.post(
  "/gcs",
  [
    body("doctor_name")
      .trim()
      .notEmpty()
      .withMessage("Doctor name is required"),
    body("doctor_email").isEmail().withMessage("Valid email is required"),
    body("doctor_phone").notEmpty().withMessage("Phone number is required"),
    body("specialty").trim().notEmpty().withMessage("Specialty is required"),
    body("years_of_practice").optional().isInt({ min: 0 }),
    body("clinic_name").optional().trim(),
    body("address").optional().trim(),
    body("city").optional().trim(),
    body("state").optional().trim(),
    body("campaign_name").optional().trim(),
    body("mr_name").optional().trim(),
    body("mr_code").optional().trim(),
    body("mr_phone").optional().trim(),
    body("selected_languages")
      .notEmpty()
      .withMessage("At least one language must be selected"),
    body("image_gcs_path").notEmpty().withMessage("Image GCS path is required"),
    body("image_public_url")
      .notEmpty()
      .withMessage("Image public URL is required"),
    body("audio_gcs_paths")
      .isArray({ min: 1 })
      .withMessage("At least one audio GCS path is required"),
    body("submission_prefix")
      .notEmpty()
      .withMessage("Submission prefix is required"),
  ],
  handleValidationErrors,
  async (req, res) => {
    const db = getDb();

    try {
      const {
        doctor_name,
        doctor_email,
        doctor_phone,
        specialty,
        years_of_practice,
        clinic_name,
        address,
        city,
        state,
        campaign_name,
        mr_name,
        mr_code,
        mr_phone,
        selected_languages,
        image_gcs_path,
        image_public_url,
        audio_gcs_paths,
        submission_prefix,
      } = req.body;

      // Validate phone
      if (!validatePhone(doctor_phone)) {
        return res.status(400).json({ error: "Invalid phone number format" });
      }

      // Parse and validate languages
      let languages;
      try {
        languages =
          typeof selected_languages === "string"
            ? JSON.parse(selected_languages)
            : selected_languages;
      } catch (e) {
        return res
          .status(400)
          .json({ error: "Invalid language selection format" });
      }

      const langValidation = validateLanguageCodes(
        languages,
        MAX_LANGUAGE_SELECTIONS,
      );
      if (!langValidation.isValid) {
        return res.status(400).json({ errors: langValidation.errors });
      }

      // Validate audio paths array
      if (!Array.isArray(audio_gcs_paths) || audio_gcs_paths.length === 0) {
        return res
          .status(400)
          .json({ error: "At least one audio file is required" });
      }
      if (audio_gcs_paths.length > MAX_AUDIO_FILES) {
        return res
          .status(400)
          .json({ error: `Maximum ${MAX_AUDIO_FILES} audio files allowed` });
      }

      // Calculate estimated total duration from audio paths (if provided)
      const totalDuration = audio_gcs_paths.reduce((sum, audio) => {
        return sum + (audio.duration_seconds || 60); // Default 60 seconds if not provided
      }, 0);

      // Start transaction
      const insertDoctor = db.prepare(`
        INSERT INTO doctors (full_name, email, phone, specialty, years_of_practice, clinic_name, address)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMR = db.prepare(`
        INSERT OR IGNORE INTO medical_reps (name, mr_code, phone)
        VALUES (?, ?, ?)
      `);

      const getMR = db.prepare(`SELECT id FROM medical_reps WHERE mr_code = ?`);

      const insertSubmission = db.prepare(`
        INSERT INTO submissions (
          doctor_id, mr_id, image_path, audio_path, 
          audio_duration_seconds, selected_languages, status,
          doctor_name, doctor_email, doctor_phone, doctor_specialization,
          doctor_clinic_name, doctor_city, doctor_state, campaign_name,
          mr_name, mr_code, image_public_url, submission_prefix, upload_source
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = db.transaction(() => {
        // Insert doctor
        const doctorResult = insertDoctor.run(
          doctor_name,
          doctor_email,
          normalizePhone(doctor_phone),
          specialty,
          years_of_practice || null,
          clinic_name || null,
          address || null,
        );
        const doctorId = doctorResult.lastInsertRowid;

        // Insert MR if provided
        let mrId = null;
        if (mr_name && mr_code) {
          insertMR.run(mr_name, mr_code, mr_phone || null);
          const mr = getMR.get(mr_code);
          mrId = mr?.id;
        }

        // Insert submission with GCS paths
        const submissionResult = insertSubmission.run(
          doctorId,
          mrId,
          image_gcs_path, // GCS path for image
          JSON.stringify(audio_gcs_paths.map((a) => a.gcs_path)), // GCS paths for audio
          totalDuration,
          JSON.stringify(languages),
          SUBMISSION_STATUS.PENDING_CONSENT,
          doctor_name,
          doctor_email,
          normalizePhone(doctor_phone),
          specialty,
          clinic_name || null,
          city || null,
          state || null,
          campaign_name || null,
          mr_name || null,
          mr_code || null,
          image_public_url, // Store public URL for easy access
          submission_prefix, // Store the GCS prefix for this submission
          "gcs", // Mark this as a GCS upload
        );
        const submissionId = submissionResult.lastInsertRowid;

        return { submissionId, doctorId };
      });

      const result = transaction();

      logger.info(
        `[SUBMISSION] New GCS submission created: ${result.submissionId} with ${audio_gcs_paths.length} audio files`,
      );

      // Sync to Google Sheets (async, non-blocking)
      const submissionData = {
        id: result.submissionId,
        created_at: new Date().toISOString(),
        doctor_name,
        doctor_email,
        doctor_phone: normalizePhone(doctor_phone),
        doctor_specialization: specialty,
        doctor_clinic_name: clinic_name,
        doctor_city: city,
        doctor_state: state,
        mr_name,
        mr_code,
        consent_status: "pending",
        selected_languages: JSON.stringify(languages),
        status: SUBMISSION_STATUS.PENDING_CONSENT,
        image_path: image_gcs_path,
        audio_path: JSON.stringify(audio_gcs_paths.map((a) => a.gcs_path)),
        upload_source: "gcs",
      };
      googleSheetsService.syncSubmission(submissionData).catch((err) => {
        logger.error(
          `[SHEETS] Failed to sync GCS submission ${result.submissionId}:`,
          err,
        );
      });

      // Send WhatsApp notification to MR (async, non-blocking)
      if (mr_phone) {
        sendMrSubmissionWhatsapp({
          mrPhone: normalizePhone(mr_phone),
          mrName: mr_name,
          doctorName: doctor_name,
          submissionId: result.submissionId,
        });
      }

      res.status(201).json({
        message: "Submission created successfully via GCS",
        submission_id: result.submissionId,
        doctor_id: result.doctorId,
        status: SUBMISSION_STATUS.PENDING_CONSENT,
        audio_files_count: audio_gcs_paths.length,
        total_duration_seconds: totalDuration,
        upload_source: "gcs",
        gcs_prefix: submission_prefix,
        next_step: "consent_verification",
      });
    } catch (error) {
      logger.error("Error creating GCS submission:", error);
      res.status(500).json({ error: "Failed to create submission" });
    }
  },
);

/**
 * POST /api/submissions/:id/final-video
 * Register final edited video uploaded via signed URL
 */
router.post(
  "/:id/final-video",
  [
    param("id").isInt(),
    body("gcsPath").notEmpty().withMessage("gcsPath is required"),
    body("publicUrl").optional().isString(),
    body("uploadedBy").optional().isString(),
    body("filename").optional().isString(),
  ],
  handleValidationErrors,
  async (req, res) => {
    const db = getDb();
    const { id } = req.params;
    const { gcsPath, publicUrl, uploadedBy } = req.body;

    try {
      const submission = db
        .prepare("SELECT * FROM submissions WHERE id = ?")
        .get(id);

      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      const finalPublicUrl = publicUrl || toPublicUrlFromGcs(gcsPath);

      const newStatus =
        submission.status === SUBMISSION_STATUS.COMPLETED
          ? submission.status
          : SUBMISSION_STATUS.PENDING_QC;
      const newQcStatus =
        submission.qc_status === QC_STATUS.APPROVED
          ? submission.qc_status
          : QC_STATUS.PENDING;

      db.prepare(
        `
        UPDATE submissions 
        SET final_video_gcs_path = ?,
            final_video_public_url = ?,
            final_video_uploaded_at = CURRENT_TIMESTAMP,
            final_video_uploaded_by = ?,
            status = ?,
            qc_status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      ).run(
        gcsPath,
        finalPublicUrl,
        uploadedBy || "editor",
        newStatus,
        newQcStatus,
        id,
      );

      logger.info(`[SUBMISSION] Final video attached for submission ${id}`);

      res.json({
        message: "Final video registered",
        submission_id: id,
        final_video_url: finalPublicUrl,
        status: newStatus,
        qc_status: newQcStatus,
      });
    } catch (error) {
      logger.error("Error saving final video:", error);
      res.status(500).json({ error: "Failed to save final video" });
    }
  },
);

/**
 * PUT /api/submissions/:id
 * Update submission
 */
router.put(
  "/:id",
  [param("id").isInt(), body("selected_languages").optional()],
  handleValidationErrors,
  async (req, res) => {
    try {
      const db = getDb();
      const { id } = req.params;
      const updates = req.body;

      // Check submission exists
      const submission = db
        .prepare("SELECT * FROM submissions WHERE id = ?")
        .get(id);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      // Build update query
      const allowedFields = ["status", "qc_status", "qc_notes"];
      const updateFields = [];
      const params = [];

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          updateFields.push(`${key} = ?`);
          params.push(value);
        }
      }

      if (updates.selected_languages) {
        const langValidation = validateLanguageCodes(
          updates.selected_languages,
          MAX_LANGUAGE_SELECTIONS,
        );
        if (!langValidation.isValid) {
          return res.status(400).json({ errors: langValidation.errors });
        }
        updateFields.push("selected_languages = ?");
        params.push(JSON.stringify(updates.selected_languages));
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      updateFields.push("updated_at = CURRENT_TIMESTAMP");
      params.push(id);

      db.prepare(
        `
        UPDATE submissions SET ${updateFields.join(", ")} WHERE id = ?
      `,
      ).run(...params);

      res.json({ message: "Submission updated successfully" });
    } catch (error) {
      logger.error("Error updating submission:", error);
      res.status(500).json({ error: "Failed to update submission" });
    }
  },
);

/**
 * DELETE /api/submissions/:id
 * Delete submission (soft delete or cleanup)
 */
router.delete("/:id", async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const submission = db
      .prepare("SELECT * FROM submissions WHERE id = ?")
      .get(id);
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    // Delete associated files
    if (submission.image_path && fs.existsSync(submission.image_path)) {
      fs.unlinkSync(submission.image_path);
    }
    if (submission.audio_path && fs.existsSync(submission.audio_path)) {
      fs.unlinkSync(submission.audio_path);
    }

    // Delete from database (cascade will handle related records)
    db.prepare("DELETE FROM submissions WHERE id = ?").run(id);

    logger.info(`[SUBMISSION] Deleted submission: ${id}`);
    res.json({ message: "Submission deleted successfully" });
  } catch (error) {
    logger.error("Error deleting submission:", error);
    res.status(500).json({ error: "Failed to delete submission" });
  }
});

/**
 * GET /api/submissions/stats
 * Get submission statistics
 */
router.get("/stats/overview", async (req, res) => {
  try {
    const db = getDb();

    const stats = db
      .prepare(
        `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
        SUM(CASE WHEN status = 'pending_consent' THEN 1 ELSE 0 END) as pending_consent,
        SUM(CASE WHEN status = 'consent_verified' THEN 1 ELSE 0 END) as consent_verified,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'pending_qc' THEN 1 ELSE 0 END) as pending_qc,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN qc_status = 'approved' THEN 1 ELSE 0 END) as qc_approved,
        SUM(CASE WHEN qc_status = 'rejected' THEN 1 ELSE 0 END) as qc_rejected
      FROM submissions
    `,
      )
      .get();

    res.json(stats);
  } catch (error) {
    logger.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

/**
 * POST /api/submissions/:id/video/:languageCode
 * Upload/register final video for a specific language
 * Body: { gcsPath, publicUrl, uploadedBy, duration_seconds }
 */
router.post(
  "/:id/video/:languageCode",
  [
    param("id").isInt(),
    param("languageCode").notEmpty().withMessage("Language code is required"),
    body("gcsPath").notEmpty().withMessage("gcsPath is required"),
    body("publicUrl").optional().isString(),
    body("uploadedBy").optional().isString(),
    body("duration_seconds").optional({ values: "null" }).isNumeric(),
  ],
  handleValidationErrors,
  async (req, res) => {
    const db = getDb();
    const { id, languageCode } = req.params;
    const { gcsPath, publicUrl, uploadedBy, duration_seconds } = req.body;

    try {
      // Verify submission exists
      const submission = db
        .prepare("SELECT * FROM submissions WHERE id = ?")
        .get(id);

      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      // Verify language is in submission's selected languages
      const selectedLanguages = JSON.parse(
        submission.selected_languages || "[]",
      );
      if (!selectedLanguages.includes(languageCode)) {
        return res.status(400).json({
          error: `Language ${languageCode} is not in submission's selected languages`,
          selected_languages: selectedLanguages,
        });
      }

      // Get generated audio for this language (if exists)
      const generatedAudio = db
        .prepare(
          "SELECT id FROM generated_audio WHERE submission_id = ? AND language_code = ?",
        )
        .get(id, languageCode);

      const finalPublicUrl = publicUrl || toPublicUrlFromGcs(gcsPath);

      // Check if video already exists for this language
      const existingVideo = db
        .prepare(
          "SELECT id FROM generated_videos WHERE submission_id = ? AND language_code = ?",
        )
        .get(id, languageCode);

      if (existingVideo) {
        // Update existing video
        db.prepare(
          `
          UPDATE generated_videos 
          SET gcs_path = ?,
              file_path = ?,
              duration_seconds = ?,
              status = 'completed',
              error_message = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        ).run(
          gcsPath,
          finalPublicUrl, // store public URL in file_path for backwards compatibility
          duration_seconds || null,
          existingVideo.id,
        );

        logger.info(
          `[SUBMISSION] Updated video for submission ${id}, language: ${languageCode}`,
        );
      } else {
        // Insert new video record
        db.prepare(
          `
          INSERT INTO generated_videos (
            submission_id, language_code, generated_audio_id,
            file_path, gcs_path, duration_seconds, status
          )
          VALUES (?, ?, ?, ?, ?, ?, 'completed')
        `,
        ).run(
          id,
          languageCode,
          generatedAudio?.id || null,
          finalPublicUrl,
          gcsPath,
          duration_seconds || null,
        );

        logger.info(
          `[SUBMISSION] Registered video for submission ${id}, language: ${languageCode}`,
        );
      }

      // Check if all languages have videos and update submission status
      const completedVideos = db
        .prepare(
          `
        SELECT COUNT(DISTINCT language_code) as count 
        FROM generated_videos 
        WHERE submission_id = ? AND status = 'completed'
      `,
        )
        .get(id);

      const allVideosComplete =
        completedVideos.count >= selectedLanguages.length;

      // Update submission status if all videos are complete
      if (allVideosComplete) {
        db.prepare(
          `
          UPDATE submissions 
          SET status = ?, 
              qc_status = CASE WHEN qc_status = 'approved' THEN qc_status ELSE 'pending' END,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        ).run(SUBMISSION_STATUS.PENDING_QC, id);
      }

      res.json({
        message: existingVideo ? "Video updated" : "Video registered",
        submission_id: id,
        language_code: languageCode,
        video_url: finalPublicUrl,
        all_videos_complete: allVideosComplete,
        videos_completed: completedVideos.count,
        total_languages: selectedLanguages.length,
      });
    } catch (error) {
      logger.error(`Error saving video for language ${languageCode}:`, error);
      res.status(500).json({ error: "Failed to save video" });
    }
  },
);

/**
 * GET /api/submissions/:id/languages
 * Get per-language status for a submission (audio + video status for each language)
 */
router.get("/:id/languages", async (req, res) => {
  const db = getDb();
  const { id } = req.params;

  try {
    const submission = db
      .prepare("SELECT selected_languages FROM submissions WHERE id = ?")
      .get(id);

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const selectedLanguages = JSON.parse(submission.selected_languages || "[]");

    // Get all generated audio for this submission
    const generatedAudio = db
      .prepare(
        `
      SELECT ga.*, am.name as audio_master_name, am.language_code as audio_master_language
      FROM generated_audio ga
      LEFT JOIN audio_masters am ON ga.audio_master_id = am.id
      WHERE ga.submission_id = ?
    `,
      )
      .all(id);

    // Get all generated videos for this submission
    const generatedVideos = db
      .prepare(
        `
      SELECT * FROM generated_videos WHERE submission_id = ?
    `,
      )
      .all(id);

    // Build per-language status
    const languageStatus = selectedLanguages.map((langCode) => {
      const audio = generatedAudio.find((a) => a.language_code === langCode);
      const video = generatedVideos.find((v) => v.language_code === langCode);

      return {
        language_code: langCode,
        audio: audio
          ? {
              id: audio.id,
              status: audio.status,
              file_path: audio.file_path,
              gcs_path: audio.gcs_path,
              public_url: audio.public_url,
              audio_master_name: audio.audio_master_name,
              created_at: audio.created_at,
              error_message: audio.error_message,
            }
          : null,
        video: video
          ? {
              id: video.id,
              status: video.status,
              file_path: video.file_path,
              gcs_path: video.gcs_path,
              duration_seconds: video.duration_seconds,
              created_at: video.created_at,
              error_message: video.error_message,
            }
          : null,
        audio_complete: audio?.status === "completed",
        video_complete: video?.status === "completed",
        ready_for_qc:
          audio?.status === "completed" && video?.status === "completed",
      };
    });

    const summary = {
      total_languages: selectedLanguages.length,
      audio_completed: languageStatus.filter((l) => l.audio_complete).length,
      videos_completed: languageStatus.filter((l) => l.video_complete).length,
      ready_for_qc: languageStatus.filter((l) => l.ready_for_qc).length,
      all_complete: languageStatus.every((l) => l.ready_for_qc),
    };

    res.json({
      submission_id: id,
      summary,
      languages: languageStatus,
    });
  } catch (error) {
    logger.error("Error fetching language status:", error);
    res.status(500).json({ error: "Failed to fetch language status" });
  }
});

/**
 * DELETE /api/submissions/:id/video/:languageCode
 * Delete a video for a specific language
 */
router.delete("/:id/video/:languageCode", async (req, res) => {
  const db = getDb();
  const { id, languageCode } = req.params;

  try {
    const video = db
      .prepare(
        "SELECT * FROM generated_videos WHERE submission_id = ? AND language_code = ?",
      )
      .get(id, languageCode);

    if (!video) {
      return res
        .status(404)
        .json({ error: "Video not found for this language" });
    }

    // Delete from GCS if path exists
    if (video.gcs_path) {
      try {
        await gcsService.deleteFile(video.gcs_path);
      } catch (gcsError) {
        logger.warn(`Failed to delete video from GCS: ${gcsError.message}`);
      }
    }

    // Delete from database
    db.prepare("DELETE FROM generated_videos WHERE id = ?").run(video.id);

    logger.info(
      `[SUBMISSION] Deleted video for submission ${id}, language: ${languageCode}`,
    );

    res.json({
      message: "Video deleted",
      submission_id: id,
      language_code: languageCode,
    });
  } catch (error) {
    logger.error(`Error deleting video for language ${languageCode}:`, error);
    res.status(500).json({ error: "Failed to delete video" });
  }
});

module.exports = router;
