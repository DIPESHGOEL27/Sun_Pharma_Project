/**
 * Email Service - AWS SES Integration
 * Handles OTP email sending via AWS SES (v3 SDK) or fallback SMTP
 */

const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

// Email templates
const EMAIL_TEMPLATES = {
  OTP_VERIFICATION: "otp_verification",
  CONSENT_CONFIRMED: "consent_confirmed",
};

let transporter = null;

/**
 * Create transporter based on configuration
 * Supports AWS SES or standard SMTP
 */
async function createTransporter() {
  // Check if using AWS SES
  if (
    process.env.AWS_SES_REGION &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  ) {
    try {
      // Use SESv2 client as required by nodemailer 7.x
      const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2");

      const sesClient = new SESv2Client({
        region: process.env.AWS_SES_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });

      // Import aws module for nodemailer SES transport
      const aws = require("@aws-sdk/client-sesv2");

      logger.info("[EMAIL] Using AWS SES v2 for email delivery", {
        region: process.env.AWS_SES_REGION,
        from: process.env.SES_FROM_EMAIL,
      });

      return nodemailer.createTransport({
        SES: { ses: sesClient, aws },
      });
    } catch (error) {
      logger.error("[EMAIL] AWS SES initialization failed:", error.message, error.stack);
    }
  }

  // Check if SMTP credentials are configured
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    logger.info("[EMAIL] Using SMTP for email delivery", {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
    });

    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // No email configuration - log warning
  logger.warn(
    "[EMAIL] No email service configured! Set AWS_SES_REGION or SMTP credentials."
  );
  return null;
}

async function getTransporter() {
  if (!transporter) {
    transporter = await createTransporter();
  }
  return transporter;
}

/**
 * Strip "Dr." prefix from name if already present
 */
function stripDrPrefix(name) {
  if (!name) return name;
  return name.replace(/^Dr\.?\s*/i, "").trim();
}

/**
 * Generate OTP verification email HTML
 */
function generateOTPEmail({ doctorName, otp, expiryMinutes = 15, mrName }) {
  // Strip Dr. prefix to avoid "Dr. Dr." repetition
  const cleanName = stripDrPrefix(doctorName);
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sun Pharma - Consent Verification</title>
  <style>
    body { 
      font-family: 'Times New Roman', Georgia, serif; 
      line-height: 1.8; 
      color: #1a1a1a; 
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .container { 
      max-width: 650px; 
      margin: 0 auto; 
      background: white;
      border: 1px solid #d1d5db;
    }
    .header { 
      background: #1a365d; 
      color: white; 
      padding: 25px 30px; 
      text-align: center;
      border-bottom: 3px solid #c9a227;
    }
    .header h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: 1px;
    }
    .header p {
      margin: 8px 0 0;
      font-size: 13px;
      font-weight: 400;
      letter-spacing: 0.5px;
    }
    .content { 
      padding: 35px 40px; 
      background: #ffffff; 
    }
    .greeting {
      font-size: 16px;
      color: #1a1a1a;
      margin-bottom: 25px;
    }
    .section-title {
      font-size: 14px;
      font-weight: bold;
      color: #1a365d;
      margin: 25px 0 15px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 8px;
    }
    .message {
      color: #374151;
      margin-bottom: 20px;
      font-size: 14px;
      text-align: justify;
    }
    .otp-container {
      text-align: center;
      margin: 35px 0;
      padding: 25px;
      background: #f8fafc;
      border: 2px solid #1a365d;
    }
    .otp-label {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 12px;
    }
    .otp-box { 
      display: inline-block;
      background: #1a365d; 
      color: white; 
      font-size: 32px; 
      letter-spacing: 10px; 
      padding: 18px 35px; 
      font-weight: bold;
      font-family: 'Courier New', monospace;
    }
    .expiry-notice {
      text-align: center;
      font-size: 13px;
      color: #6b7280;
      margin-top: 15px;
    }
    .expiry-notice strong {
      color: #1a365d;
    }
    .consent-section {
      background: #fafafa;
      border: 1px solid #e5e7eb;
      padding: 25px;
      margin: 25px 0;
    }
    .consent-section h3 {
      color: #1a365d;
      margin: 0 0 15px;
      font-size: 14px;
      font-weight: bold;
    }
    .consent-list {
      margin: 0;
      padding-left: 25px;
      color: #374151;
      font-size: 13px;
    }
    .consent-list li {
      margin-bottom: 10px;
      text-align: justify;
    }
    .notice-box {
      background: #fff7ed;
      border: 1px solid #fed7aa;
      padding: 15px 20px;
      margin: 25px 0;
      font-size: 13px;
      color: #9a3412;
    }
    .notice-box strong {
      display: block;
      margin-bottom: 5px;
    }
    .footer { 
      text-align: center; 
      padding: 20px 30px; 
      font-size: 11px; 
      color: #6b7280; 
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
    }
    .footer p {
      margin: 4px 0;
    }
    .confidential {
      font-size: 10px;
      color: #9ca3af;
      margin-top: 15px;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SUN PHARMACEUTICAL INDUSTRIES LTD.</h1>
      <p>AI Video Platform - Consent Verification</p>
    </div>
    
    <div class="content">
      <p class="greeting">Dear Dr. ${cleanName || "Doctor"},</p>
      
      <p class="section-title">Purpose of the Video</p>
      <p class="message">
        This video is part of a patient education initiative aimed at improving treatment adherence 
        and usage of Susten Capsules through Vaginal Route. The video will feature you demonstrating 
        the medically accurate steps for vaginal insertion of the Susten Capsules.
      </p>
      
      <p class="message">
        To verify your consent and proceed with the video generation process, please share the 
        following One-Time Password (OTP) with your authorized Sun Pharma Medical Representative.
      </p>
      
      <div class="otp-container">
        <p class="otp-label">Your Verification Code</p>
        <div class="otp-box">${otp}</div>
        <p class="expiry-notice">This OTP is valid for <strong>${expiryMinutes} minutes</strong> only.</p>
      </div>
      
      <div class="consent-section">
        <h3>Consent and Agreement</h3>
        <p style="font-size: 13px; color: #374151; margin: 0 0 15px;">By verifying this OTP, you hereby give your full consent to:</p>
        <ol class="consent-list">
          <li>Participate in the recording of an AI Video demonstrating the administration of Susten Capsules.</li>
          <li>Allow the use of your name, voice, image, and professional credentials in the video for educational purposes.</li>
          <li>Confirm that the demonstration will be medically accurate, based on standard clinical practice.</li>
          <li>Acknowledge that this video is intended for patient education only, and will be disseminated through approved channels.</li>
          <li>Understand that the video will explicitly feature and refer to the brand Susten Capsules usage through vaginal route.</li>
          <li>Confirm that you have no conflict of interest related to the brand or its manufacturer.</li>
        </ol>
      </div>
      
      <div class="notice-box">
        <strong>Security Notice</strong>
        If you did not request this OTP or do not wish to participate in this initiative, 
        please disregard this email. Do not share this OTP with anyone other than your 
        authorized Sun Pharma Medical Representative.
      </div>
    </div>
    
    <div class="footer">
      <p>This is an automated message from the Sun Pharma AI Video Platform.</p>
      <p>Please do not reply to this email.</p>
      <p class="confidential">
        CONFIDENTIAL: This email and any attachments are intended solely for the addressee and may contain 
        confidential information. If you have received this email in error, please notify the sender immediately.
      </p>
      <p style="margin-top: 15px;">&copy; ${new Date().getFullYear()} Sun Pharmaceutical Industries Ltd. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Generate consent confirmation email HTML
 */
function generateConsentConfirmedEmail({ doctorName, submissionId }) {
  // Strip Dr. prefix to avoid "Dr. Dr." repetition
  const cleanName = stripDrPrefix(doctorName);
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sun Pharma - Consent Confirmation</title>
  <style>
    body { 
      font-family: 'Times New Roman', Georgia, serif; 
      line-height: 1.8; 
      color: #1a1a1a; 
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .container { 
      max-width: 650px; 
      margin: 0 auto; 
      background: white;
      border: 1px solid #d1d5db;
    }
    .header { 
      background: #1a365d; 
      color: white; 
      padding: 25px 30px; 
      text-align: center;
      border-bottom: 3px solid #c9a227;
    }
    .header h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: 1px;
    }
    .header p {
      margin: 8px 0 0;
      font-size: 13px;
      font-weight: 400;
    }
    .content { 
      padding: 35px 40px; 
    }
    .greeting {
      font-size: 16px;
      margin-bottom: 20px;
    }
    .message {
      font-size: 14px;
      color: #374151;
      margin-bottom: 15px;
      text-align: justify;
    }
    .reference-box {
      background: #f8fafc;
      border: 1px solid #e5e7eb;
      padding: 15px 20px;
      margin: 25px 0;
      text-align: center;
    }
    .reference-label {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    .reference-id {
      font-size: 18px;
      font-weight: bold;
      color: #1a365d;
      font-family: 'Courier New', monospace;
    }
    .consent-summary {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      padding: 20px;
      margin: 25px 0;
    }
    .consent-summary h3 {
      color: #166534;
      margin: 0 0 15px;
      font-size: 14px;
    }
    .consent-summary ul {
      margin: 0;
      padding-left: 20px;
      font-size: 13px;
      color: #374151;
    }
    .consent-summary li {
      margin-bottom: 8px;
    }
    .footer { 
      text-align: center; 
      padding: 20px 30px; 
      font-size: 11px; 
      color: #6b7280; 
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
    }
    .footer p {
      margin: 4px 0;
    }
    .confidential {
      font-size: 10px;
      color: #9ca3af;
      margin-top: 15px;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SUN PHARMACEUTICAL INDUSTRIES LTD.</h1>
      <p>Consent Confirmation</p>
    </div>
    <div class="content">
      <p class="greeting">Dear Dr. ${cleanName || "Doctor"},</p>
      
      <p class="message">
        We are pleased to confirm that your consent for participation in the Sun Pharma AI Video Platform 
        has been successfully verified and recorded.
      </p>
      
      <div class="reference-box">
        <p class="reference-label">Your Reference Number</p>
        <p class="reference-id">${submissionId}</p>
      </div>
      
      <div class="consent-summary">
        <h3>Consent Recorded For:</h3>
        <ul>
          <li>AI Video recording demonstrating administration of Susten Capsules</li>
          <li>Use of name, voice, image, and professional credentials for educational purposes</li>
          <li>Distribution through approved patient education channels</li>
        </ul>
      </div>
      
      <p class="message">
        Our team will now proceed with processing your submission. You will be notified once 
        the AI-generated video content is ready for your review.
      </p>
      
      <p class="message">
        Thank you for your valuable participation in this patient education initiative.
      </p>
    </div>
    <div class="footer">
      <p>This is an automated message from the Sun Pharma AI Video Platform.</p>
      <p>Please do not reply to this email.</p>
      <p class="confidential">
        CONFIDENTIAL: This email and any attachments are intended solely for the addressee and may contain 
        confidential information. If you have received this email in error, please notify the sender immediately.
      </p>
      <p style="margin-top: 15px;">&copy; ${new Date().getFullYear()} Sun Pharmaceutical Industries Ltd. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Send OTP verification email
 * @param {string} doctorEmail - Doctor's email address
 * @param {string} doctorName - Doctor's name
 * @param {string} otp - 6-digit OTP
 * @param {object} options - Additional options
 */
async function sendOTPEmail(doctorEmail, doctorName, otp, options = {}) {
  const { expiryMinutes = 15, mrName } = options;

  try {
    const transport = await getTransporter();

    if (!transport) {
      logger.error(
        `[EMAIL] No email transport configured. Cannot send OTP to ${doctorEmail}`
      );
      throw new Error(
        "Email service not configured. Please contact administrator."
      );
    }

    const fromEmail =
      process.env.SES_FROM_EMAIL ||
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      "noreply@sunpharma.com";

    const mailOptions = {
      from: `"Sun Pharma Video Platform" <${fromEmail}>`,
      to: doctorEmail,
      subject: "Sun Pharma - Consent Verification Code",
      html: generateOTPEmail({
        doctorName,
        otp,
        expiryMinutes,
        mrName,
      }),
    };

    logger.info(`[EMAIL] Attempting to send OTP to ${doctorEmail}`, {
      from: fromEmail,
      transport: process.env.AWS_SES_REGION ? "AWS SES" : "SMTP",
    });

    const result = await transport.sendMail(mailOptions);

    logger.info(`[EMAIL] OTP sent successfully to ${doctorEmail}`, {
      messageId: result.messageId,
    });

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    logger.error(`[EMAIL] Failed to send OTP to ${doctorEmail}:`, error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

/**
 * Send consent confirmation email
 * @param {string} doctorEmail - Doctor's email address
 * @param {string} doctorName - Doctor's name
 * @param {string} submissionId - Submission reference ID
 */
async function sendConsentConfirmationEmail(
  doctorEmail,
  doctorName,
  submissionId
) {
  try {
    const transport = await getTransporter();

    const fromEmail =
      process.env.SES_FROM_EMAIL ||
      process.env.SMTP_FROM ||
      process.env.SMTP_USER ||
      "noreply@sunpharma.com";

    const mailOptions = {
      from: `"Sun Pharma Video Platform" <${fromEmail}>`,
      to: doctorEmail,
      subject: "✅ Sun Pharma Video Platform - Consent Confirmed",
      html: generateConsentConfirmedEmail({
        doctorName,
        submissionId,
      }),
    };

    const result = await transport.sendMail(mailOptions);

    logger.info(`[EMAIL] Confirmation sent to ${doctorEmail}`, {
      messageId: result.messageId,
    });

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    logger.error(
      `[EMAIL] Failed to send confirmation to ${doctorEmail}:`,
      error
    );
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

/**
 * Verify email service configuration
 */
async function verifyEmailConfig() {
  try {
    const transport = await getTransporter();
    await transport.verify();
    logger.info("[EMAIL] Email service configuration verified successfully");
    return true;
  } catch (error) {
    logger.error("[EMAIL] Email service verification failed:", error);
    return false;
  }
}

module.exports = {
  sendOTPEmail,
  sendConsentConfirmationEmail,
  verifyEmailConfig,
  EMAIL_TEMPLATES,
};
