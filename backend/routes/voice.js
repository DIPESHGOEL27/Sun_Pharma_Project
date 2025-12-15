/**
 * Voice Routes
 * Handles voice cloning, speech-to-speech, and voice management
 */

const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const { getDb } = require("../db/database");
const logger = require("../utils/logger");
const elevenLabs = require("../services/elevenlabs");
const { SUBMISSION_STATUS, VOICE_CLONE_STATUS } = require("../utils/constants");

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

    if (!submission.audio_path || !fs.existsSync(submission.audio_path)) {
      return res.status(400).json({ error: "Audio file not found" });
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
      submission.audio_path,
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
          audioMaster.file_path,
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

    // If all audio generated successfully, delete the voice
    if (allCompleted) {
      try {
        await elevenLabs.deleteVoice(submission.elevenlabs_voice_id);
        db.prepare(
          `
          UPDATE submissions 
          SET voice_clone_status = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `
        ).run(VOICE_CLONE_STATUS.DELETED, submissionId);
        logger.info(
          `[VOICE] Auto-deleted voice after successful generation: ${submission.elevenlabs_voice_id}`
        );
      } catch (deleteError) {
        logger.error(`[VOICE] Failed to auto-delete voice:`, deleteError);
      }
    }

    res.json({
      message: allCompleted
        ? "Audio generation completed"
        : "Audio generation partially completed",
      submission_id: submissionId,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
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

    res
      .status(500)
      .json({
        error: "Speech-to-speech generation failed",
        details: error.message,
      });
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

module.exports = router;
