/**
 * Consent Routes
 * Handles OTP-based email consent verification with AWS SES
 * Flow: Send OTP to Doctor → MR enters OTP → Submit Consent Checkboxes
 */

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { body, param, validationResult } = require("express-validator");

const { getDb } = require("../db/database");
const logger = require("../utils/logger");
const { CONSENT_STATUS, OTP_CONFIG } = require("../utils/constants");
const emailService = require("../services/emailService");
const smsService = require("../services/smsService");
const googleSheetsService = require("../services/googleSheetsService");

/**
 * Generate a 6-digit OTP
 */
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Mask email for display (e.g., d***@example.com)
 */
function maskEmail(email) {
  if (!email) return "";
  const [local, domain] = email.split("@");
  const maskedLocal = local.charAt(0) + "***";
  return `${maskedLocal}@${domain}`;
}

/**
 * Mask phone for display (e.g., 91******47)
 */
function maskPhone(phone) {
  if (!phone) return "";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length >= 10) {
    return (
      cleaned.substring(0, 2) + "******" + cleaned.substring(cleaned.length - 2)
    );
  }
  return phone;
}

// Note: Using better-sqlite3 API with prepare().get() instead of exec()

/**
 * GET /api/consent/submission/:submissionId
 * Get submission details for consent verification
 */
router.get("/submission/:submissionId", async (req, res) => {
  const db = getDb();
  const { submissionId } = req.params;

  try {
    // Query for submission using better-sqlite3 API
    const submission = db
      .prepare(
        `
      SELECT 
        id, 
        doctor_name, 
        doctor_email,
        doctor_phone,
        doctor_specialization,
        doctor_clinic_name,
        doctor_city,
        doctor_state,
        campaign_name,
        mr_name,
        consent_status,
        consent_verified_at,
        consent_email_sent_at,
        consent_image_use,
        consent_voice_use,
        consent_voice_cloning,
        consent_public_distribution
      FROM submissions WHERE id = ?
    `
      )
      .get(submissionId);

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    res.json({
      submission_id: submission.id,
      doctor_name: submission.doctor_name,
      doctor_email: maskEmail(submission.doctor_email),
      doctor_email_full: submission.doctor_email, // Full email for OTP sending
      doctor_phone: submission.doctor_phone,
      doctor_specialization: submission.doctor_specialization,
      doctor_clinic_name: submission.doctor_clinic_name,
      doctor_city: submission.doctor_city,
      doctor_state: submission.doctor_state,
      campaign_name: submission.campaign_name,
      mr_name: submission.mr_name,
      consent_status: submission.consent_status,
      verified_at: submission.consent_verified_at,
      email_sent_at: submission.consent_email_sent_at,
      consent_details: {
        image_use: !!submission.consent_image_use,
        voice_use: !!submission.consent_voice_use,
        voice_cloning: !!submission.consent_voice_cloning,
        public_distribution: !!submission.consent_public_distribution,
      },
    });
  } catch (error) {
    logger.error(`[CONSENT] Failed to get submission ${submissionId}:`, error);
    res.status(500).json({ error: "Failed to get submission details" });
  }
});

/**
 * POST /api/consent/send-otp/:submissionId
 * Send OTP to doctor's email for consent verification
 */
router.post("/send-otp/:submissionId", async (req, res) => {
  const db = getDb();
  const { submissionId } = req.params;
  const { doctorEmail, doctorName } = req.body;

  try {
    // Get submission
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

    // Use provided email or fallback to stored email
    const emailToUse = doctorEmail || submission.doctor_email;
    const nameToUse = doctorName || submission.doctor_name;

    if (!emailToUse) {
      return res.status(400).json({ error: "Doctor email is required" });
    }

    // Check if already verified
    if (submission.consent_status === CONSENT_STATUS.VERIFIED) {
      return res.status(400).json({
        error: "Consent already verified",
        verified_at: submission.consent_verified_at,
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiryMinutes = OTP_CONFIG?.EXPIRY_MINUTES || 15;
    const expiresAt = new Date(
      Date.now() + expiryMinutes * 60 * 1000
    ).toISOString();

    // Store OTP in database
    db.prepare(
      `
      UPDATE submissions 
      SET consent_otp = ?, 
          consent_otp_expires_at = ?,
          consent_status = ?,
          consent_email_sent_at = datetime('now'),
          doctor_email = ?,
          doctor_name = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `
    ).run(
      otp,
      expiresAt,
      CONSENT_STATUS.OTP_SENT,
      emailToUse,
      nameToUse,
      submissionId
    );

    // Send email with OTP using AWS SES
    await emailService.sendOTPEmail(emailToUse, nameToUse, otp);

    // Log audit
    db.prepare(
      `
      INSERT INTO audit_log (entity_type, entity_id, action, details, created_at)
      VALUES ('submission', ?, 'consent_otp_sent', ?, datetime('now'))
    `
    ).run(submissionId, JSON.stringify({ email: maskEmail(emailToUse) }));

    logger.info(
      `[CONSENT] OTP sent to ${maskEmail(
        emailToUse
      )} for submission ${submissionId}`
    );

    res.json({
      success: true,
      message: "OTP sent successfully",
      email: maskEmail(emailToUse),
      expires_in_minutes: expiryMinutes,
    });
  } catch (error) {
    logger.error(
      `[CONSENT] Failed to send OTP for submission ${submissionId}:`,
      error
    );
    res
      .status(500)
      .json({ error: "Failed to send OTP", details: error.message });
  }
});

/**
 * POST /api/consent/verify-otp/:submissionId
 * Verify OTP entered by MR on behalf of doctor
 */
router.post(
  "/verify-otp/:submissionId",
  [
    body("otp")
      .isLength({ min: 6, max: 6 })
      .withMessage("OTP must be 6 digits"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const db = getDb();
    const { submissionId } = req.params;
    const { otp } = req.body;

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

      // Check if already verified
      if (submission.consent_status === CONSENT_STATUS.VERIFIED) {
        return res.json({
          success: true,
          message: "Consent already verified",
          verified_at: submission.consent_verified_at,
          already_verified: true,
        });
      }

      // Check if OTP exists
      if (!submission.consent_otp) {
        return res
          .status(400)
          .json({ error: "No OTP found. Please request a new one." });
      }

      // Check OTP expiry
      if (new Date() > new Date(submission.consent_otp_expires_at)) {
        return res
          .status(400)
          .json({ error: "OTP has expired. Please request a new one." });
      }

      // Verify OTP
      if (submission.consent_otp !== otp) {
        // Log failed attempt
        db.prepare(
          `
          INSERT INTO audit_log (entity_type, entity_id, action, details, created_at)
          VALUES ('submission', ?, 'consent_otp_failed', ?, datetime('now'))
        `
        ).run(submissionId, JSON.stringify({ attempted_otp: otp }));

        return res
          .status(400)
          .json({ error: "Invalid OTP. Please try again." });
      }

      // OTP verified - update status to otp_verified (awaiting consent form)
      db.prepare(
        `
        UPDATE submissions 
        SET consent_status = 'otp_verified',
            consent_otp = NULL,
            consent_otp_expires_at = NULL,
            updated_at = datetime('now')
        WHERE id = ?
      `
      ).run(submissionId);

      // Log audit
      db.prepare(
        `
        INSERT INTO audit_log (entity_type, entity_id, action, details, created_at)
        VALUES ('submission', ?, 'otp_verified', ?, datetime('now'))
      `
      ).run(
        submissionId,
        JSON.stringify({ verified_at: new Date().toISOString() })
      );

      logger.info(`[CONSENT] OTP verified for submission ${submissionId}`);

      res.json({
        success: true,
        message: "OTP verified successfully. Please complete consent form.",
        submission_id: submissionId,
        status: "otp_verified",
      });
    } catch (error) {
      logger.error(
        `[CONSENT] Failed to verify OTP for submission ${submissionId}:`,
        error
      );
      res
        .status(500)
        .json({ error: "Failed to verify OTP", details: error.message });
    }
  }
);

/**
 * POST /api/consent/submit/:submissionId
 * Submit consent form with all checkbox states
 */
router.post(
  "/submit/:submissionId",
  [
    body("imageUse").isBoolean().withMessage("Image use consent is required"),
    body("voiceUse").isBoolean().withMessage("Voice use consent is required"),
    body("voiceCloning")
      .isBoolean()
      .withMessage("Voice cloning consent is required"),
    body("publicDistribution")
      .isBoolean()
      .withMessage("Distribution consent is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const db = getDb();
    const { submissionId } = req.params;
    const {
      imageUse,
      voiceUse,
      voiceCloning,
      publicDistribution,
      mrConfirmation = true,
    } = req.body;

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

      // Check if OTP was verified
      if (
        submission.consent_status !== "otp_verified" &&
        submission.consent_status !== CONSENT_STATUS.VERIFIED
      ) {
        return res.status(400).json({
          error: "OTP must be verified before submitting consent form",
        });
      }

      // Check if all required consents are provided
      if (!imageUse || !voiceUse || !voiceCloning || !publicDistribution) {
        return res.status(400).json({
          error: "All consent checkboxes must be checked to proceed",
        });
      }

      // Update submission with consent details
      db.prepare(
        `
        UPDATE submissions 
        SET consent_status = ?,
            consent_verified_at = datetime('now'),
            consent_image_use = ?,
            consent_voice_use = ?,
            consent_voice_cloning = ?,
            consent_public_distribution = ?,
            consent_mr_confirmation = ?,
            status = 'consent_verified',
            updated_at = datetime('now')
        WHERE id = ?
      `
      ).run(
        CONSENT_STATUS.VERIFIED,
        imageUse ? 1 : 0,
        voiceUse ? 1 : 0,
        voiceCloning ? 1 : 0,
        publicDistribution ? 1 : 0,
        mrConfirmation ? 1 : 0,
        submissionId
      );

      // Log audit
      const auditDetails = JSON.stringify({
        verified_at: new Date().toISOString(),
        consent_details: {
          image_use: imageUse,
          voice_use: voiceUse,
          voice_cloning: voiceCloning,
          public_distribution: publicDistribution,
          mr_confirmation: mrConfirmation,
        },
      });

      db.prepare(
        `
        INSERT INTO audit_log (entity_type, entity_id, action, details, created_at)
        VALUES ('submission', ?, 'consent_verified', ?, datetime('now'))
      `
      ).run(submissionId, auditDetails);

      // Sync consent status to Google Sheets
      const updatedSubmission = db
        .prepare("SELECT * FROM submissions WHERE id = ?")
        .get(submissionId);
      googleSheetsService.syncSubmission(updatedSubmission).catch((err) => {
        logger.error(
          `[SHEETS] Failed to sync consent for ${submissionId}:`,
          err
        );
      });

      logger.info(
        `[CONSENT] Full consent verified for submission ${submissionId}`
      );

      res.json({
        success: true,
        message: "Consent submitted successfully",
        submission_id: submissionId,
        status: "consent_verified",
        consent_details: {
          image_use: imageUse,
          voice_use: voiceUse,
          voice_cloning: voiceCloning,
          public_distribution: publicDistribution,
        },
      });
    } catch (error) {
      logger.error(
        `[CONSENT] Failed to submit consent for submission ${submissionId}:`,
        error
      );
      res
        .status(500)
        .json({ error: "Failed to submit consent", details: error.message });
    }
  }
);

/**
 * GET /api/consent/status/:submissionId
 * Get consent status for a submission
 */
router.get("/status/:submissionId", async (req, res) => {
  const db = getDb();
  const { submissionId } = req.params;

  try {
    const submission = db
      .prepare(
        `
      SELECT 
        id, 
        consent_status, 
        consent_verified_at, 
        consent_email_sent_at,
        consent_image_use,
        consent_voice_use,
        consent_voice_cloning,
        consent_public_distribution
      FROM submissions WHERE id = ?
    `
      )
      .get(submissionId);

    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    res.json({
      submission_id: submission.id,
      consent_status: submission.consent_status,
      verified_at: submission.consent_verified_at,
      email_sent_at: submission.consent_email_sent_at,
      consent_details: {
        image_use: !!submission.consent_image_use,
        voice_use: !!submission.consent_voice_use,
        voice_cloning: !!submission.consent_voice_cloning,
        public_distribution: !!submission.consent_public_distribution,
      },
    });
  } catch (error) {
    logger.error(
      `[CONSENT] Failed to get status for submission ${submissionId}:`,
      error
    );
    res.status(500).json({ error: "Failed to get consent status" });
  }
});

/**
 * POST /api/consent/resend-otp/:submissionId
 * Resend OTP (with rate limiting)
 */
router.post("/resend-otp/:submissionId", async (req, res) => {
  const db = getDb();
  const { submissionId } = req.params;
  const { doctorEmail, doctorName } = req.body;

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

    // Check if already verified
    if (submission.consent_status === CONSENT_STATUS.VERIFIED) {
      return res.status(400).json({ error: "Consent already verified" });
    }

    // Rate limiting: Check if last email was sent less than 60 seconds ago
    if (submission.consent_email_sent_at) {
      const lastSent = new Date(submission.consent_email_sent_at);
      const now = new Date();
      const diffSeconds = (now - lastSent) / 1000;

      if (diffSeconds < 60) {
        return res.status(429).json({
          error: "Please wait before requesting another OTP",
          wait_seconds: Math.ceil(60 - diffSeconds),
        });
      }
    }

    // Use provided email or fallback to stored email
    const emailToUse = doctorEmail || submission.doctor_email;
    const nameToUse = doctorName || submission.doctor_name;

    if (!emailToUse) {
      return res.status(400).json({ error: "Doctor email is required" });
    }

    // Generate new OTP
    const otp = generateOTP();
    const expiryMinutes = OTP_CONFIG?.EXPIRY_MINUTES || 15;
    const expiresAt = new Date(
      Date.now() + expiryMinutes * 60 * 1000
    ).toISOString();

    // Store OTP in database
    db.prepare(
      `
      UPDATE submissions 
      SET consent_otp = ?, 
          consent_otp_expires_at = ?,
          consent_status = ?,
          consent_email_sent_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `
    ).run(otp, expiresAt, CONSENT_STATUS.OTP_SENT, submissionId);

    // Send email with OTP using AWS SES
    await emailService.sendOTPEmail(emailToUse, nameToUse, otp);

    // Log audit
    db.prepare(
      `
      INSERT INTO audit_log (entity_type, entity_id, action, details, created_at)
      VALUES ('submission', ?, 'consent_otp_resent', ?, datetime('now'))
    `
    ).run(submissionId, JSON.stringify({ email: maskEmail(emailToUse) }));

    logger.info(
      `[CONSENT] OTP resent to ${maskEmail(
        emailToUse
      )} for submission ${submissionId}`
    );

    res.json({
      success: true,
      message: "OTP resent successfully",
      email: maskEmail(emailToUse),
      expires_in_minutes: expiryMinutes,
    });
  } catch (error) {
    logger.error(
      `[CONSENT] Failed to resend OTP for submission ${submissionId}:`,
      error
    );
    res.status(500).json({ error: "Failed to resend OTP" });
  }
});

/**
 * POST /api/consent/send-mobile-otp/:submissionId
 * Send OTP to doctor's mobile number via SMS
 */
router.post("/send-mobile-otp/:submissionId", async (req, res) => {
  const db = getDb();
  const { submissionId } = req.params;
  const { doctorPhone, doctorName } = req.body;

  try {
    // Check if SMS is configured
    if (!smsService.isSMSConfigured()) {
      return res.status(503).json({
        error: "SMS service not configured",
        message: "Please use email OTP instead",
      });
    }

    // Get submission
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

    // Use provided phone or fallback to stored phone
    const phoneToUse = doctorPhone || submission.doctor_phone;
    const nameToUse = doctorName || submission.doctor_name;

    if (!phoneToUse) {
      return res.status(400).json({ error: "Doctor phone number is required" });
    }

    // Check if already verified
    if (submission.consent_status === CONSENT_STATUS.VERIFIED) {
      return res.status(400).json({
        error: "Consent already verified",
        verified_at: submission.consent_verified_at,
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiryMinutes = OTP_CONFIG?.EXPIRY_MINUTES || 15;
    const expiresAt = new Date(
      Date.now() + expiryMinutes * 60 * 1000
    ).toISOString();

    // Store OTP in database (using mobile_otp fields)
    db.prepare(
      `
      UPDATE submissions 
      SET consent_mobile_otp = ?, 
          consent_mobile_otp_expires_at = ?,
          consent_status = ?,
          consent_sms_sent_at = datetime('now'),
          doctor_phone = ?,
          doctor_name = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `
    ).run(
      otp,
      expiresAt,
      CONSENT_STATUS.OTP_SENT,
      phoneToUse,
      nameToUse,
      submissionId
    );

    // Send SMS with OTP using AWS SNS
    await smsService.sendOTPSMS(phoneToUse, nameToUse, otp);

    // Log audit
    db.prepare(
      `
      INSERT INTO audit_log (entity_type, entity_id, action, details, created_at)
      VALUES ('submission', ?, 'consent_mobile_otp_sent', ?, datetime('now'))
    `
    ).run(submissionId, JSON.stringify({ phone: maskPhone(phoneToUse) }));

    logger.info(
      `[CONSENT] Mobile OTP sent to ${maskPhone(
        phoneToUse
      )} for submission ${submissionId}`
    );

    res.json({
      success: true,
      message: "OTP sent successfully to mobile",
      phone: maskPhone(phoneToUse),
      expires_in_minutes: expiryMinutes,
    });
  } catch (error) {
    logger.error(
      `[CONSENT] Failed to send mobile OTP for submission ${submissionId}:`,
      error
    );
    res
      .status(500)
      .json({ error: "Failed to send SMS OTP", details: error.message });
  }
});

/**
 * POST /api/consent/verify-mobile-otp/:submissionId
 * Verify OTP sent to doctor's mobile
 */
router.post(
  "/verify-mobile-otp/:submissionId",
  [
    body("otp")
      .isLength({ min: 6, max: 6 })
      .withMessage("OTP must be 6 digits"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const db = getDb();
    const { submissionId } = req.params;
    const { otp } = req.body;

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

      // Check if already verified
      if (submission.consent_status === CONSENT_STATUS.VERIFIED) {
        return res.json({
          success: true,
          message: "Consent already verified",
          verified_at: submission.consent_verified_at,
          already_verified: true,
        });
      }

      // Check if mobile OTP exists
      if (!submission.consent_mobile_otp) {
        return res
          .status(400)
          .json({ error: "No mobile OTP found. Please request a new one." });
      }

      // Check OTP expiry
      if (new Date() > new Date(submission.consent_mobile_otp_expires_at)) {
        return res
          .status(400)
          .json({ error: "OTP has expired. Please request a new one." });
      }

      // Verify OTP
      if (submission.consent_mobile_otp !== otp) {
        // Log failed attempt
        db.prepare(
          `
          INSERT INTO audit_log (entity_type, entity_id, action, details, created_at)
          VALUES ('submission', ?, 'consent_mobile_otp_failed', ?, datetime('now'))
        `
        ).run(submissionId, JSON.stringify({ attempted_otp: otp }));

        return res
          .status(400)
          .json({ error: "Invalid OTP. Please try again." });
      }

      // OTP verified - update status to otp_verified (awaiting consent form)
      db.prepare(
        `
        UPDATE submissions 
        SET consent_status = 'otp_verified',
            consent_mobile_otp = NULL,
            consent_mobile_otp_expires_at = NULL,
            updated_at = datetime('now')
        WHERE id = ?
      `
      ).run(submissionId);

      // Log audit
      db.prepare(
        `
        INSERT INTO audit_log (entity_type, entity_id, action, details, created_at)
        VALUES ('submission', ?, 'mobile_otp_verified', ?, datetime('now'))
      `
      ).run(
        submissionId,
        JSON.stringify({ verified_at: new Date().toISOString() })
      );

      logger.info(
        `[CONSENT] Mobile OTP verified for submission ${submissionId}`
      );

      res.json({
        success: true,
        message:
          "Mobile OTP verified successfully. Please complete consent form.",
        submission_id: submissionId,
        status: "otp_verified",
      });
    } catch (error) {
      logger.error(
        `[CONSENT] Failed to verify mobile OTP for submission ${submissionId}:`,
        error
      );
      res
        .status(500)
        .json({ error: "Failed to verify OTP", details: error.message });
    }
  }
);

/**
 * POST /api/consent/resend-mobile-otp/:submissionId
 * Resend mobile OTP (with rate limiting)
 */
router.post("/resend-mobile-otp/:submissionId", async (req, res) => {
  const db = getDb();
  const { submissionId } = req.params;
  const { doctorPhone, doctorName } = req.body;

  try {
    // Check if SMS is configured
    if (!smsService.isSMSConfigured()) {
      return res.status(503).json({
        error: "SMS service not configured",
        message: "Please use email OTP instead",
      });
    }

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

    // Check if already verified
    if (submission.consent_status === CONSENT_STATUS.VERIFIED) {
      return res.status(400).json({ error: "Consent already verified" });
    }

    // Rate limiting: Check if last SMS was sent less than 60 seconds ago
    if (submission.consent_sms_sent_at) {
      const lastSent = new Date(submission.consent_sms_sent_at);
      const now = new Date();
      const diffSeconds = (now - lastSent) / 1000;

      if (diffSeconds < 60) {
        return res.status(429).json({
          error: "Please wait before requesting another OTP",
          wait_seconds: Math.ceil(60 - diffSeconds),
        });
      }
    }

    // Use provided phone or fallback to stored phone
    const phoneToUse = doctorPhone || submission.doctor_phone;
    const nameToUse = doctorName || submission.doctor_name;

    if (!phoneToUse) {
      return res.status(400).json({ error: "Doctor phone number is required" });
    }

    // Generate new OTP
    const otp = generateOTP();
    const expiryMinutes = OTP_CONFIG?.EXPIRY_MINUTES || 15;
    const expiresAt = new Date(
      Date.now() + expiryMinutes * 60 * 1000
    ).toISOString();

    // Store OTP in database
    db.prepare(
      `
      UPDATE submissions 
      SET consent_mobile_otp = ?, 
          consent_mobile_otp_expires_at = ?,
          consent_status = ?,
          consent_sms_sent_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `
    ).run(otp, expiresAt, CONSENT_STATUS.OTP_SENT, submissionId);

    // Send SMS with OTP using AWS SNS
    await smsService.sendOTPSMS(phoneToUse, nameToUse, otp);

    // Log audit
    db.prepare(
      `
      INSERT INTO audit_log (entity_type, entity_id, action, details, created_at)
      VALUES ('submission', ?, 'consent_mobile_otp_resent', ?, datetime('now'))
    `
    ).run(submissionId, JSON.stringify({ phone: maskPhone(phoneToUse) }));

    logger.info(
      `[CONSENT] Mobile OTP resent to ${maskPhone(
        phoneToUse
      )} for submission ${submissionId}`
    );

    res.json({
      success: true,
      message: "OTP resent successfully to mobile",
      phone: maskPhone(phoneToUse),
      expires_in_minutes: expiryMinutes,
    });
  } catch (error) {
    logger.error(
      `[CONSENT] Failed to resend mobile OTP for submission ${submissionId}:`,
      error
    );
    res.status(500).json({ error: "Failed to resend SMS OTP" });
  }
});

/**
 * GET /api/consent/sms-status
 * Check if SMS service is available
 */
router.get("/sms-status", (req, res) => {
  res.json({
    available: smsService.isSMSConfigured(),
    message: smsService.isSMSConfigured()
      ? "SMS OTP service is available"
      : "SMS OTP service not configured, use email OTP",
  });
});

module.exports = router;
