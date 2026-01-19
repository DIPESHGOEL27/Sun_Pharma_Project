/**
 * Voice Routes
 * Handles voice cloning, speech-to-speech, and voice management
 */

const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const os = require("os");
const { v4: uuidv4 } = require("uuid");

const { getDb } = require("../db/database");
const logger = require("../utils/logger");
const elevenLabs = require("../services/elevenlabs");
const { SUBMISSION_STATUS, VOICE_CLONE_STATUS } = require("../utils/constants");
const gcsService = require("../services/gcsService");

const TEMP_DIR = path.join(os.tmpdir(), "sunpharma-voice");
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const buildTempPath = (filename) =>
  path.join(TEMP_DIR, `${uuidv4()}_${filename || "temp"}`);

const isTempFile = (p) => p && p.startsWith(TEMP_DIR);

const cleanupTempFiles = (paths = []) => {
  paths.forEach((p) => {
    if (p && isTempFile(p) && fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch (e) {
        logger.warn(`[VOICE] Failed to clean temp file ${p}: ${e.message}`);
      }
    }
  });
};

const parseAudioSources = (audioPath) => {
  if (!audioPath) return [];
  try {
    const parsed = JSON.parse(audioPath);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // not JSON
  }
  return [audioPath];
};

async function downloadHttpToTemp(url) {
  const fetch = (await import("node-fetch")).default;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to download file: ${resp.status}`);
  }
  const buffer = await resp.buffer();
  const dest = buildTempPath(path.basename(url.split("?")[0]) || "audio.mp3");
  fs.writeFileSync(dest, buffer);
  return dest;
}

async function ensureLocalFile(sourcePath, bucketType = "UPLOADS") {
  if (!sourcePath) return null;

  // Already local and exists
  if (fs.existsSync(sourcePath)) {
    return sourcePath;
  }

  // If relative, resolve against project root
  const absolute = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.join(__dirname, "..", sourcePath);
  if (fs.existsSync(absolute)) {
    return absolute;
  }

  // GCS path
  if (sourcePath.startsWith("gs://")) {
    const dest = buildTempPath(path.basename(sourcePath));
    await gcsService.downloadFile(sourcePath, bucketType, dest);
    return dest;
  }

  // Public GCS URL
  if (sourcePath.includes("storage.googleapis.com")) {
    return downloadHttpToTemp(sourcePath);
  }

  // Generic HTTP(S)
  if (sourcePath.startsWith("http")) {
    return downloadHttpToTemp(sourcePath);
  }

  throw new Error(`Audio file not found or inaccessible: ${sourcePath}`);
}

/**
 * POST /api/voice/clone/:submissionId
 * Clone voice from submission's audio sample
 */
router.post("/clone/:submissionId", async (req, res) => {
  const db = getDb();
  const { submissionId } = req.params;

  try {
    // Get submission
    const submission = db
      .prepare(
        `
      SELECT s.*, d.full_name as doctor_name 
      FROM submissions s
      JOIN doctors d ON s.doctor_id = d.id
      WHERE s.id = ?
    `
      )
      .get(submissionId);

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const audioSources = parseAudioSources(submission.audio_path);
    if (!audioSources.length) {
      return res.status(400).json({ error: "Audio file not found" });
    }

    const tempFiles = [];
    const samplePaths = [];

    try {
      for (const src of audioSources) {
        const candidate =
          src?.gcsPath ||
          src?.gcs_path ||
          src?.publicUrl ||
          src?.public_url ||
          src;
        const localPath = await ensureLocalFile(candidate, "UPLOADS");
        samplePaths.push(localPath);
        if (isTempFile(localPath)) {
          tempFiles.push(localPath);
        }
      }

      // Check if already cloned
      if (
        submission.elevenlabs_voice_id &&
        submission.voice_clone_status === VOICE_CLONE_STATUS.COMPLETED
      ) {
        return res.status(400).json({
          error: "Voice already cloned",
          voice_id: submission.elevenlabs_voice_id,
        });
      }

      // Update status to in progress
      db.prepare(
        `
      UPDATE submissions 
      SET voice_clone_status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `
      ).run(VOICE_CLONE_STATUS.IN_PROGRESS, submissionId);

      // Clone voice
      const voiceName = `SunPharma_${submission.doctor_name.replace(
        /\s+/g,
        "_"
      )}_${submissionId}`;
      const result = await elevenLabs.cloneVoice(
        voiceName,
        samplePaths,
        `Voice clone for Dr. ${submission.doctor_name} - Submission ${submissionId}`
      );

      // Update submission with voice ID
      db.prepare(
        `
      UPDATE submissions 
      SET elevenlabs_voice_id = ?, 
          voice_clone_status = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `
      ).run(
        result.voice_id,
        VOICE_CLONE_STATUS.COMPLETED,
        SUBMISSION_STATUS.CONSENT_VERIFIED,
        submissionId
      );

      // Log audit
      db.prepare(
        `
      INSERT INTO audit_log (entity_type, entity_id, action, details)
      VALUES (?, ?, ?, ?)
    `
      ).run(
        "submission",
        submissionId,
        "voice_cloned",
        JSON.stringify({ voice_id: result.voice_id })
      );

      logger.info(
        `[VOICE] Cloned voice for submission ${submissionId}: ${result.voice_id}`
      );

      res.json({
        message: "Voice cloned successfully",
        voice_id: result.voice_id,
        submission_id: submissionId,
      });
    } finally {
      cleanupTempFiles(tempFiles);
    }
  } catch (error) {
    logger.error(`[VOICE] Clone failed for submission ${submissionId}:`, error);

    // Update status to failed
    db.prepare(
      `
      UPDATE submissions 
      SET voice_clone_status = ?, voice_clone_error = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `
    ).run(VOICE_CLONE_STATUS.FAILED, error.message, submissionId);

    res
      .status(500)
      .json({ error: "Voice cloning failed", details: error.message });
  }
});

/**
 * DELETE /api/voice/:submissionId
 * Delete cloned voice after successful audio generation
 */
router.delete("/:submissionId", async (req, res) => {
  const db = getDb();
  const { submissionId } = req.params;

  try {
    const submission = db
      .prepare(
        `
      SELECT * FROM submissions WHERE id = ?
    `
      )
      .get(submissionId);

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    if (!submission.elevenlabs_voice_id) {
      return res
        .status(400)
        .json({ error: "No voice ID found for this submission" });
    }

    // Delete voice from ElevenLabs
    await elevenLabs.deleteVoice(submission.elevenlabs_voice_id);

    // Update submission
    db.prepare(
      `
      UPDATE submissions 
      SET voice_clone_status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `
    ).run(VOICE_CLONE_STATUS.DELETED, submissionId);

    // Log audit
    db.prepare(
      `
      INSERT INTO audit_log (entity_type, entity_id, action, details)
      VALUES (?, ?, ?, ?)
    `
    ).run(
      "submission",
      submissionId,
      "voice_deleted",
      JSON.stringify({
        voice_id: submission.elevenlabs_voice_id,
      })
    );

    logger.info(
      `[VOICE] Deleted voice ${submission.elevenlabs_voice_id} for submission ${submissionId}`
    );

    res.json({
      message: "Voice deleted successfully",
      voice_id: submission.elevenlabs_voice_id,
    });
  } catch (error) {
    logger.error(
      `[VOICE] Delete failed for submission ${submissionId}:`,
      error
    );
    res
      .status(500)
      .json({ error: "Failed to delete voice", details: error.message });
  }
});

/**
 * POST /api/voice/speech-to-speech/:submissionId
 * Generate speech-to-speech audio for all selected languages
 */
router.post("/speech-to-speech/:submissionId", async (req, res) => {
  const db = getDb();
  const { submissionId } = req.params;
  let tempFiles = [];

  try {
    const submission = db
      .prepare(
        `
      SELECT * FROM submissions WHERE id = ?
    `
      )
      .get(submissionId);

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    if (!submission.elevenlabs_voice_id) {
      return res.status(400).json({ error: "Voice not cloned yet" });
    }

    const selectedLanguages = JSON.parse(submission.selected_languages || "[]");
    if (selectedLanguages.length === 0) {
      return res.status(400).json({ error: "No languages selected" });
    }

    // Update submission status
    db.prepare(
      `
      UPDATE submissions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `
    ).run(SUBMISSION_STATUS.AUDIO_GENERATION, submissionId);

    const results = [];
    const errors = [];
    const tempFiles = [];

    // Process each language
    for (const langCode of selectedLanguages) {
      try {
        // Get audio master for this language
        const audioMaster = db
          .prepare(
            `
          SELECT * FROM audio_masters 
          WHERE language_code = ? AND is_active = 1 
          ORDER BY created_at DESC LIMIT 1
        `
          )
          .get(langCode);

        if (!audioMaster) {
          errors.push({ language: langCode, error: "No audio master found" });
          continue;
        }

        // Ensure master audio is available locally
        const masterPath = await ensureLocalFile(
          audioMaster.file_path,
          "AUDIO_MASTERS"
        );
        if (isTempFile(masterPath)) tempFiles.push(masterPath);

        // Generate speech-to-speech
        const outputDir = path.join(
          __dirname,
          "../uploads/generated_audio",
          submissionId.toString()
        );
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        const outputFilename = `${uuidv4()}_${langCode}.mp3`;
        const outputPath = path.join(outputDir, outputFilename);

        // Use streaming for better performance
        await elevenLabs.speechToSpeechStream(
          submission.elevenlabs_voice_id,
          masterPath,
          outputPath,
          langCode
        );

        // Insert generated audio record
        db.prepare(
          `
          INSERT INTO generated_audio (
            submission_id, language_code, audio_master_id,
            file_path, status
          )
          VALUES (?, ?, ?, ?, ?)
        `
        ).run(submissionId, langCode, audioMaster.id, outputPath, "completed");

        results.push({
          language: langCode,
          status: "completed",
          file_path: outputPath,
        });

        logger.info(
          `[VOICE] Generated audio for submission ${submissionId}, language: ${langCode}`
        );
      } catch (langError) {
        logger.error(
          `[VOICE] Error generating audio for ${langCode}:`,
          langError
        );
        errors.push({ language: langCode, error: langError.message });

        // Insert failed record
        db.prepare(
          `
          INSERT INTO generated_audio (
            submission_id, language_code, status, error_message
          )
          VALUES (?, ?, ?, ?)
        `
        ).run(submissionId, langCode, "failed", langError.message);
      }
    }

    // Update submission status
    const allCompleted = errors.length === 0;
    db.prepare(
      `
      UPDATE submissions 
      SET status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `
    ).run(
      allCompleted ? SUBMISSION_STATUS.PENDING_QC : SUBMISSION_STATUS.FAILED,
      submissionId
    );

    // NOTE: Voice is NOT auto-deleted after generation.
    // Voices are deleted on a schedule (end of day) or when slots are full.
    // Use POST /api/voice/cleanup to delete voices manually or on schedule.
    if (allCompleted) {
      logger.info(
        `[VOICE] Audio generation completed for submission ${submissionId}. Voice ${submission.elevenlabs_voice_id} retained for reuse.`
      );
    }

    res.json({
      message: allCompleted
        ? "Audio generation completed"
        : "Audio generation partially completed",
      submission_id: submissionId,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });

    cleanupTempFiles(tempFiles);
  } catch (error) {
    logger.error(
      `[VOICE] Speech-to-speech failed for submission ${submissionId}:`,
      error
    );

    db.prepare(
      `
      UPDATE submissions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `
    ).run(SUBMISSION_STATUS.FAILED, submissionId);

    res.status(500).json({
      error: "Speech-to-speech generation failed",
      details: error.message,
    });
  } finally {
    cleanupTempFiles(tempFiles);
  }
});

/**
 * POST /api/voice/process/:submissionId
 * Clone doctor voice using all uploaded samples, generate speech-to-speech with audio masters,
 * then delete the cloned voice (one-shot pipeline for admin dashboard)
 */
router.post("/process/:submissionId", async (req, res) => {
  const db = getDb();
  const { submissionId } = req.params;
  let tempFiles = [];

  try {
    const submission = db
      .prepare(
        `
        SELECT s.*, d.full_name as doctor_name
        FROM submissions s
        JOIN doctors d ON s.doctor_id = d.id
        WHERE s.id = ?
      `
      )
      .get(submissionId);

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const selectedLanguages = JSON.parse(submission.selected_languages || "[]");
    if (!selectedLanguages.length) {
      return res.status(400).json({ error: "No languages selected" });
    }

    const audioSources = parseAudioSources(submission.audio_path);
    if (!audioSources.length) {
      return res.status(400).json({ error: "No audio samples available" });
    }

    const samplePaths = [];
    for (const src of audioSources) {
      const candidate =
        src?.gcsPath ||
        src?.gcs_path ||
        src?.publicUrl ||
        src?.public_url ||
        src;
      const localPath = await ensureLocalFile(candidate, "UPLOADS");
      samplePaths.push(localPath);
      if (isTempFile(localPath)) tempFiles.push(localPath);
    }

    // Mark cloning started
    db.prepare(
      `
      UPDATE submissions 
      SET voice_clone_status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `
    ).run(VOICE_CLONE_STATUS.IN_PROGRESS, submissionId);

    const voiceName = `SunPharma_${submission.doctor_name.replace(
      /\s+/g,
      "_"
    )}_${submissionId}`;
    const cloneResult = await elevenLabs.cloneVoice(
      voiceName,
      samplePaths,
      `Voice clone for Dr. ${submission.doctor_name} - Submission ${submissionId}`
    );

    const voiceId = cloneResult.voice_id;

    db.prepare(
      `
      UPDATE submissions 
      SET elevenlabs_voice_id = ?, voice_clone_status = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `
    ).run(
      voiceId,
      VOICE_CLONE_STATUS.COMPLETED,
      SUBMISSION_STATUS.CONSENT_VERIFIED,
      submissionId
    );

    const results = [];
    const errors = [];

    for (const langCode of selectedLanguages) {
      try {
        const audioMaster = db
          .prepare(
            `
            SELECT * FROM audio_masters 
            WHERE language_code = ? AND is_active = 1 
            ORDER BY created_at DESC LIMIT 1
          `
          )
          .get(langCode);

        if (!audioMaster) {
          errors.push({ language: langCode, error: "No audio master found" });
          continue;
        }

        const masterPath = await ensureLocalFile(
          audioMaster.file_path,
          "AUDIO_MASTERS"
        );
        if (isTempFile(masterPath)) tempFiles.push(masterPath);

        const outputDir = path.join(
          __dirname,
          "../uploads/generated_audio",
          submissionId.toString()
        );
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        const outputFilename = `${uuidv4()}_${langCode}.mp3`;
        const outputPath = path.join(outputDir, outputFilename);

        await elevenLabs.speechToSpeechStream(
          voiceId,
          masterPath,
          outputPath,
          langCode
        );

        // Upload generated audio to GCS for download access
        let gcsPath = null;
        let publicUrl = null;
        try {
          const gcsDestination = `submissions/${submissionId}/generated_audio/${outputFilename}`;
          const uploadResult = await gcsService.uploadFile(
            outputPath,
            "GENERATED_AUDIO",
            gcsDestination,
            { contentType: "audio/mpeg", makePublic: true }
          );
          gcsPath = uploadResult.gcsPath;
          publicUrl = uploadResult.publicUrl;
          logger.info(`[VOICE] Uploaded generated audio to GCS: ${publicUrl}`);
        } catch (uploadErr) {
          logger.warn(
            `[VOICE] Failed to upload to GCS, using local path: ${uploadErr.message}`
          );
          // Fall back to local path if GCS upload fails
          publicUrl = `/api/uploads/generated_audio/${submissionId}/${outputFilename}`;
        }

        db.prepare(
          `
          INSERT INTO generated_audio (
            submission_id, language_code, audio_master_id,
            file_path, gcs_path, public_url, status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          submissionId,
          langCode,
          audioMaster.id,
          outputPath,
          gcsPath,
          publicUrl,
          "completed"
        );

        results.push({
          language: langCode,
          status: "completed",
          file_path: outputPath,
          gcs_path: gcsPath,
          public_url: publicUrl,
        });
      } catch (langError) {
        errors.push({ language: langCode, error: langError.message });
        db.prepare(
          `
          INSERT INTO generated_audio (
            submission_id, language_code, status, error_message
          )
          VALUES (?, ?, ?, ?)
        `
        ).run(submissionId, langCode, "failed", langError.message);
      }
    }

    const allCompleted = errors.length === 0;
    db.prepare(
      `
      UPDATE submissions 
      SET status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `
    ).run(
      allCompleted ? SUBMISSION_STATUS.PENDING_QC : SUBMISSION_STATUS.FAILED,
      submissionId
    );

    // NOTE: Voice is NOT auto-deleted after /process pipeline.
    // Voices are deleted on a schedule (end of day) or when slots are full.
    // Use POST /api/voice/cleanup to delete voices manually or on schedule.
    logger.info(
      `[VOICE] Process pipeline completed for submission ${submissionId}. Voice ${voiceId} retained for reuse.`
    );

    res.json({
      message: allCompleted
        ? "Voice processed and audio generated"
        : "Voice processed with partial audio generation",
      voice_id: voiceId,
      submission_id: submissionId,
      results,
      errors: errors.length ? errors : undefined,
    });
  } catch (error) {
    logger.error(
      `[VOICE] Process pipeline failed for submission ${submissionId}:`,
      error
    );

    db.prepare(
      `
      UPDATE submissions 
      SET voice_clone_status = ?, status = ?, voice_clone_error = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `
    ).run(
      VOICE_CLONE_STATUS.FAILED,
      SUBMISSION_STATUS.FAILED,
      error.message,
      submissionId
    );

    res
      .status(500)
      .json({ error: "Voice processing failed", details: error.message });
  } finally {
    cleanupTempFiles(tempFiles);
  }
});

/**
 * GET /api/voice/status
 * Get ElevenLabs API status and quota
 */
router.get("/status", async (req, res) => {
  try {
    const health = await elevenLabs.checkApiHealth();
    res.json(health);
  } catch (error) {
    logger.error("[VOICE] Status check failed:", error);
    res.status(500).json({ error: "Failed to check API status" });
  }
});

/**
 * GET /api/voice/list
 * List all voices in ElevenLabs account
 */
router.get("/list", async (req, res) => {
  try {
    const voices = await elevenLabs.listVoices();
    res.json(voices);
  } catch (error) {
    logger.error("[VOICE] List voices failed:", error);
    res.status(500).json({ error: "Failed to list voices" });
  }
});

/**
 * POST /api/voice/cleanup
 * Scheduled voice cleanup - deletes voices based on criteria
 * Query params:
 *   - max_age_hours: Delete voices older than X hours (default: 24)
 *   - status_filter: Only delete voices with this status ('completed', 'all') (default: 'completed')
 *   - dry_run: If 'true', returns what would be deleted without actually deleting (default: false)
 */
router.post("/cleanup", async (req, res) => {
  try {
    const maxAgeHours = parseInt(req.query.max_age_hours) || 24;
    const statusFilter = req.query.status_filter || 'completed';
    const dryRun = req.query.dry_run === 'true';
    
    logger.info(`[VOICE CLEANUP] Starting cleanup - max_age: ${maxAgeHours}h, status: ${statusFilter}, dry_run: ${dryRun}`);
    
    // Get submissions with active voices that meet cleanup criteria
    let query = `
      SELECT id, doctor_name, elevenlabs_voice_id, voice_clone_status, 
             created_at, updated_at, status as submission_status
      FROM submissions 
      WHERE elevenlabs_voice_id IS NOT NULL 
        AND voice_clone_status = ?
        AND datetime(updated_at) < datetime('now', ?)
    `;
    
    const params = [
      VOICE_CLONE_STATUS.COMPLETED,
      `-${maxAgeHours} hours`
    ];
    
    // If status_filter is 'all', include submissions regardless of their status
    if (statusFilter === 'all') {
      query = `
        SELECT id, doctor_name, elevenlabs_voice_id, voice_clone_status, 
               created_at, updated_at, status as submission_status
        FROM submissions 
        WHERE elevenlabs_voice_id IS NOT NULL 
          AND voice_clone_status = ?
          AND datetime(updated_at) < datetime('now', ?)
      `;
    }
    
    const voicesToDelete = db.prepare(query).all(...params);
    
    logger.info(`[VOICE CLEANUP] Found ${voicesToDelete.length} voices eligible for cleanup`);
    
    if (dryRun) {
      return res.json({
        message: 'Dry run - no voices deleted',
        dry_run: true,
        eligible_count: voicesToDelete.length,
        voices: voicesToDelete.map(v => ({
          submission_id: v.id,
          doctor_name: v.doctor_name,
          voice_id: v.elevenlabs_voice_id,
          status: v.voice_clone_status,
          age_hours: Math.round((Date.now() - new Date(v.updated_at).getTime()) / (1000 * 60 * 60))
        }))
      });
    }
    
    const results = {
      deleted: [],
      failed: [],
      skipped: []
    };
    
    for (const submission of voicesToDelete) {
      try {
        // Delete from ElevenLabs
        await elevenLabs.deleteVoice(submission.elevenlabs_voice_id);
        
        // Update database
        db.prepare(`
          UPDATE submissions 
          SET voice_clone_status = ?, elevenlabs_voice_id = NULL, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(VOICE_CLONE_STATUS.DELETED, submission.id);
        
        results.deleted.push({
          submission_id: submission.id,
          doctor_name: submission.doctor_name,
          voice_id: submission.elevenlabs_voice_id
        });
        
        logger.info(`[VOICE CLEANUP] Deleted voice ${submission.elevenlabs_voice_id} for submission ${submission.id}`);
      } catch (deleteError) {
        // If voice doesn't exist on ElevenLabs, still mark as deleted in DB
        if (deleteError.message?.includes('not found') || deleteError.status === 404) {
          db.prepare(`
            UPDATE submissions 
            SET voice_clone_status = ?, elevenlabs_voice_id = NULL, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(VOICE_CLONE_STATUS.DELETED, submission.id);
          
          results.skipped.push({
            submission_id: submission.id,
            reason: 'Voice not found on ElevenLabs - marked as deleted'
          });
        } else {
          results.failed.push({
            submission_id: submission.id,
            voice_id: submission.elevenlabs_voice_id,
            error: deleteError.message
          });
          logger.error(`[VOICE CLEANUP] Failed to delete voice ${submission.elevenlabs_voice_id}:`, deleteError);
        }
      }
    }
    
    res.json({
      message: 'Cleanup completed',
      summary: {
        total_eligible: voicesToDelete.length,
        deleted: results.deleted.length,
        failed: results.failed.length,
        skipped: results.skipped.length
      },
      results
    });
    
  } catch (error) {
    logger.error("[VOICE CLEANUP] Cleanup failed:", error);
    res.status(500).json({ error: "Voice cleanup failed", details: error.message });
  }
});

/**
 * DELETE /api/voice/cleanup/all
 * Emergency cleanup - delete ALL active voices when slots are full
 * Requires confirmation query param: ?confirm=true
 */
router.delete("/cleanup/all", async (req, res) => {
  try {
    if (req.query.confirm !== 'true') {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'Add ?confirm=true to confirm deletion of ALL active voices'
      });
    }
    
    logger.warn("[VOICE CLEANUP] Emergency cleanup - deleting ALL active voices");
    
    // Get all submissions with active voices
    const activeVoices = db.prepare(`
      SELECT id, doctor_name, elevenlabs_voice_id, voice_clone_status
      FROM submissions 
      WHERE elevenlabs_voice_id IS NOT NULL 
        AND voice_clone_status IN (?, ?)
    `).all(VOICE_CLONE_STATUS.COMPLETED, VOICE_CLONE_STATUS.PENDING);
    
    logger.info(`[VOICE CLEANUP] Found ${activeVoices.length} active voices to delete`);
    
    const results = {
      deleted: [],
      failed: []
    };
    
    for (const submission of activeVoices) {
      try {
        await elevenLabs.deleteVoice(submission.elevenlabs_voice_id);
        
        db.prepare(`
          UPDATE submissions 
          SET voice_clone_status = ?, elevenlabs_voice_id = NULL, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(VOICE_CLONE_STATUS.DELETED, submission.id);
        
        results.deleted.push({
          submission_id: submission.id,
          voice_id: submission.elevenlabs_voice_id
        });
        
        logger.info(`[VOICE CLEANUP] Emergency delete: voice ${submission.elevenlabs_voice_id}`);
      } catch (deleteError) {
        // If not found, still mark as deleted
        if (deleteError.message?.includes('not found') || deleteError.status === 404) {
          db.prepare(`
            UPDATE submissions 
            SET voice_clone_status = ?, elevenlabs_voice_id = NULL, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(VOICE_CLONE_STATUS.DELETED, submission.id);
          results.deleted.push({
            submission_id: submission.id,
            voice_id: submission.elevenlabs_voice_id,
            note: 'Not found on ElevenLabs'
          });
        } else {
          results.failed.push({
            submission_id: submission.id,
            voice_id: submission.elevenlabs_voice_id,
            error: deleteError.message
          });
        }
      }
    }
    
    res.json({
      message: 'Emergency cleanup completed',
      summary: {
        total: activeVoices.length,
        deleted: results.deleted.length,
        failed: results.failed.length
      },
      results
    });
    
  } catch (error) {
    logger.error("[VOICE CLEANUP] Emergency cleanup failed:", error);
    res.status(500).json({ error: "Emergency cleanup failed", details: error.message });
  }
});

/**
 * GET /api/voice/active
 * List all submissions with active (non-deleted) voices
 */
router.get("/active", async (req, res) => {
  try {
    const activeVoices = db.prepare(`
      SELECT 
        s.id,
        s.doctor_name,
        s.elevenlabs_voice_id,
        s.voice_clone_status,
        s.status as submission_status,
        s.created_at,
        s.updated_at,
        COUNT(DISTINCT ga.id) as generated_audio_count,
        GROUP_CONCAT(DISTINCT ga.language_code) as languages_generated
      FROM submissions s
      LEFT JOIN generated_audio ga ON s.id = ga.submission_id AND ga.status = 'completed'
      WHERE s.elevenlabs_voice_id IS NOT NULL 
        AND s.voice_clone_status IN (?, ?)
      GROUP BY s.id
      ORDER BY s.updated_at DESC
    `).all(VOICE_CLONE_STATUS.COMPLETED, VOICE_CLONE_STATUS.PENDING);
    
    // Calculate age for each voice
    const voicesWithAge = activeVoices.map(v => ({
      ...v,
      age_hours: Math.round((Date.now() - new Date(v.updated_at).getTime()) / (1000 * 60 * 60)),
      languages_generated: v.languages_generated ? v.languages_generated.split(',') : []
    }));
    
    res.json({
      count: activeVoices.length,
      voices: voicesWithAge
    });
    
  } catch (error) {
    logger.error("[VOICE] List active voices failed:", error);
    res.status(500).json({ error: "Failed to list active voices" });
  }
});

module.exports = router;
