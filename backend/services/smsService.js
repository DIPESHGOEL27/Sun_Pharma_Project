/**
 * SMS Service - AWS SNS Integration
 * Handles OTP SMS sending via AWS SNS (v3 SDK)
 */

const logger = require("../utils/logger");

let snsClient = null;

/**
 * Initialize SNS Client
 */
async function getSNSClient() {
  if (!snsClient) {
    try {
      const { SNSClient } = require("@aws-sdk/client-sns");

      snsClient = new SNSClient({
        region:
          process.env.AWS_SNS_REGION ||
          process.env.AWS_SES_REGION ||
          "ap-south-1",
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });

      logger.info("[SMS] AWS SNS client initialized successfully");
    } catch (error) {
      logger.error("[SMS] Failed to initialize SNS client:", error.message);
      throw error;
    }
  }
  return snsClient;
}

/**
 * Format phone number for AWS SNS (E.164 format)
 * Indian numbers: +91XXXXXXXXXX
 */
function formatPhoneNumber(phoneNumber) {
  if (!phoneNumber) return null;

  // Remove all non-digit characters
  let cleaned = phoneNumber.replace(/\D/g, "");

  // If starts with 0, remove it
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.substring(1);
  }

  // If 10 digits (Indian mobile), add +91
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }

  // If already has country code (12 digits starting with 91)
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return `+${cleaned}`;
  }

  // If already in international format
  if (cleaned.length > 10) {
    return `+${cleaned}`;
  }

  // Return as-is with + prefix
  return `+${cleaned}`;
}

/**
 * Generate OTP SMS message
 */
function generateOTPMessage({ doctorName, otp, expiryMinutes = 15 }) {
  const name = doctorName ? doctorName.split(" ")[0] : "Doctor";
  return `Dear Dr. ${name}, Your OTP for Sun Pharma consent verification is: ${otp}. Valid for ${expiryMinutes} minutes. Do not share this OTP with anyone.`;
}

/**
 * Send OTP via SMS using AWS SNS
 */
async function sendOTPSMS(phoneNumber, doctorName, otp) {
  const formattedPhone = formatPhoneNumber(phoneNumber);

  if (!formattedPhone) {
    throw new Error("Invalid phone number");
  }

  try {
    const client = await getSNSClient();
    const { PublishCommand } = require("@aws-sdk/client-sns");

    const message = generateOTPMessage({
      doctorName,
      otp,
      expiryMinutes: 15,
    });

    const params = {
      Message: message,
      PhoneNumber: formattedPhone,
      MessageAttributes: {
        "AWS.SNS.SMS.SenderID": {
          DataType: "String",
          StringValue: "SUNPHRM",
        },
        "AWS.SNS.SMS.SMSType": {
          DataType: "String",
          StringValue: "Transactional",
        },
      },
    };

    const command = new PublishCommand(params);
    const response = await client.send(command);

    logger.info(
      `[SMS] OTP sent successfully to ${formattedPhone.substring(
        0,
        5
      )}*****, MessageId: ${response.MessageId}`
    );

    return {
      success: true,
      messageId: response.MessageId,
      phone: formattedPhone.substring(0, 5) + "*****",
    };
  } catch (error) {
    logger.error(
      `[SMS] Failed to send OTP to ${formattedPhone}:`,
      error.message
    );
    throw error;
  }
}

/**
 * Send consent confirmation SMS
 */
async function sendConsentConfirmationSMS(phoneNumber, doctorName) {
  const formattedPhone = formatPhoneNumber(phoneNumber);

  if (!formattedPhone) {
    throw new Error("Invalid phone number");
  }

  try {
    const client = await getSNSClient();
    const { PublishCommand } = require("@aws-sdk/client-sns");

    const name = doctorName ? doctorName.split(" ")[0] : "Doctor";
    const message = `Dear Dr. ${name}, Thank you! Your consent for Sun Pharma AI Video Platform has been successfully verified. For queries, contact your MR.`;

    const params = {
      Message: message,
      PhoneNumber: formattedPhone,
      MessageAttributes: {
        "AWS.SNS.SMS.SenderID": {
          DataType: "String",
          StringValue: "SUNPHRM",
        },
        "AWS.SNS.SMS.SMSType": {
          DataType: "String",
          StringValue: "Transactional",
        },
      },
    };

    const command = new PublishCommand(params);
    const response = await client.send(command);

    logger.info(
      `[SMS] Consent confirmation sent to ${formattedPhone.substring(
        0,
        5
      )}*****, MessageId: ${response.MessageId}`
    );

    return {
      success: true,
      messageId: response.MessageId,
    };
  } catch (error) {
    logger.error(
      `[SMS] Failed to send consent confirmation to ${formattedPhone}:`,
      error.message
    );
    throw error;
  }
}

/**
 * Mask phone number for display
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

/**
 * Check if SMS service is configured
 */
function isSMSConfigured() {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    (process.env.AWS_SNS_REGION || process.env.AWS_SES_REGION)
  );
}

module.exports = {
  sendOTPSMS,
  sendConsentConfirmationSMS,
  formatPhoneNumber,
  maskPhone,
  isSMSConfigured,
};
