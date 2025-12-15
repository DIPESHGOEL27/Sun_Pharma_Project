const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const logger = require("./logger");
const {
  UPLOAD_CONFIG,
  IMAGE_REQUIREMENTS,
  AUDIO_REQUIREMENTS,
} = require("./constants");

/**
 * Validate image file for video generation
 * @param {string} filePath - Path to the image file
 * @returns {Object} Validation result with details
 */
async function validateImage(filePath) {
  const result = {
    isValid: false,
    checks: {
      exists: false,
      format: false,
      size: false,
      resolution: false,
      hasFace: false,
      frontFacing: false,
      goodLighting: false,
      plainBackground: false,
      noOcclusion: false,
    },
    details: {},
    errors: [],
    warnings: [],
  };

  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      result.errors.push("Image file not found");
      return result;
    }
    result.checks.exists = true;

    // Get file stats
    const stats = fs.statSync(filePath);
    result.details.fileSizeBytes = stats.size;
    result.details.fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    // Check file size
    if (stats.size > UPLOAD_CONFIG.IMAGE.maxSizeBytes) {
      result.errors.push(
        `Image size (${result.details.fileSizeMB}MB) exceeds maximum (${UPLOAD_CONFIG.IMAGE.maxSizeMB}MB)`
      );
    } else {
      result.checks.size = true;
    }

    // Get image metadata using sharp
    const metadata = await sharp(filePath).metadata();
    result.details.width = metadata.width;
    result.details.height = metadata.height;
    result.details.format = metadata.format;
    result.details.channels = metadata.channels;
    result.details.hasAlpha = metadata.hasAlpha;

    // Check format
    const allowedFormats = ["jpeg", "jpg", "png"];
    if (allowedFormats.includes(metadata.format)) {
      result.checks.format = true;
    } else {
      result.errors.push(
        `Image format '${metadata.format}' not supported. Use JPG or PNG`
      );
    }

    // Check resolution
    if (
      metadata.width >= UPLOAD_CONFIG.IMAGE.minWidth &&
      metadata.height >= UPLOAD_CONFIG.IMAGE.minHeight
    ) {
      result.checks.resolution = true;
    } else {
      result.errors.push(
        `Image resolution (${metadata.width}x${metadata.height}) below minimum (${UPLOAD_CONFIG.IMAGE.minWidth}x${UPLOAD_CONFIG.IMAGE.minHeight})`
      );
    }

    // Recommended resolution warning
    if (
      metadata.width < UPLOAD_CONFIG.IMAGE.recommendedWidth ||
      metadata.height < UPLOAD_CONFIG.IMAGE.recommendedHeight
    ) {
      result.warnings.push(
        `For best results, use at least ${UPLOAD_CONFIG.IMAGE.recommendedWidth}x${UPLOAD_CONFIG.IMAGE.recommendedHeight} resolution`
      );
    }

    // Basic image quality checks using sharp stats
    const imageStats = await sharp(filePath).stats();

    // Check for proper lighting (not too dark or too bright)
    const avgBrightness =
      imageStats.channels.reduce((sum, ch) => sum + ch.mean, 0) /
      imageStats.channels.length;
    result.details.avgBrightness = avgBrightness;

    if (avgBrightness > 30 && avgBrightness < 220) {
      result.checks.goodLighting = true;
    } else if (avgBrightness <= 30) {
      result.warnings.push("Image appears too dark. Ensure good lighting");
    } else {
      result.warnings.push(
        "Image appears overexposed. Avoid direct backlighting"
      );
    }

    // Note: Full face detection, front-facing check, and occlusion detection
    // would require a dedicated ML service (like Google Vision API or OpenCV)
    // For now, we mark these as requiring manual QC review
    result.checks.hasFace = true; // Placeholder - requires ML
    result.checks.frontFacing = true; // Placeholder - requires ML
    result.checks.noOcclusion = true; // Placeholder - requires ML
    result.checks.plainBackground = true; // Placeholder - requires ML

    result.warnings.push(
      "Face detection, pose verification, and background check will be performed during QC review"
    );

    // Calculate overall validity
    const criticalChecks = ["exists", "format", "size", "resolution"];
    result.isValid = criticalChecks.every((check) => result.checks[check]);

    result.details.requirements = IMAGE_REQUIREMENTS;
  } catch (error) {
    logger.error("Image validation error:", error);
    result.errors.push(`Validation error: ${error.message}`);
  }

  return result;
}

/**
 * Validate audio file for voice cloning
 * @param {string} filePath - Path to the audio file
 * @returns {Object} Validation result with details
 */
async function validateAudio(filePath) {
  const result = {
    isValid: false,
    checks: {
      exists: false,
      format: false,
      size: false,
      duration: false,
      sampleRate: false,
      noBackgroundNoise: false,
      speechClarity: false,
    },
    details: {},
    errors: [],
    warnings: [],
  };

  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      result.errors.push("Audio file not found");
      return result;
    }
    result.checks.exists = true;

    // Get file stats
    const stats = fs.statSync(filePath);
    result.details.fileSizeBytes = stats.size;
    result.details.fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    // Check file size
    if (stats.size > UPLOAD_CONFIG.AUDIO.maxSizeBytes) {
      result.errors.push(
        `Audio size (${result.details.fileSizeMB}MB) exceeds maximum (${UPLOAD_CONFIG.AUDIO.maxSizeMB}MB)`
      );
    } else {
      result.checks.size = true;
    }

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (UPLOAD_CONFIG.AUDIO.allowedExtensions.includes(ext)) {
      result.checks.format = true;
      result.details.format = ext.replace(".", "").toUpperCase();
    } else {
      result.errors.push(
        `Audio format '${ext}' not supported. Use MP3, WAV, or M4A`
      );
    }

    // Get audio duration and metadata using ffprobe (if available)
    try {
      const ffprobeOutput = execSync(
        `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
        { encoding: "utf8" }
      );
      const ffprobeData = JSON.parse(ffprobeOutput);

      // Extract duration
      const duration = parseFloat(ffprobeData.format?.duration || 0);
      result.details.durationSeconds = duration;
      result.details.durationFormatted = formatDuration(duration);

      // Check minimum duration (1 minute = 60 seconds per file)
      if (duration >= UPLOAD_CONFIG.AUDIO.minDurationSeconds) {
        result.checks.duration = true;
      } else {
        result.errors.push(
          `Audio duration (${result.details.durationFormatted}) is less than minimum (1 minute)`
        );
      }

      // Extract audio stream info
      const audioStream = ffprobeData.streams?.find(
        (s) => s.codec_type === "audio"
      );
      if (audioStream) {
        result.details.sampleRate = parseInt(audioStream.sample_rate);
        result.details.channels = audioStream.channels;
        result.details.codec = audioStream.codec_name;
        result.details.bitRate = audioStream.bit_rate
          ? parseInt(audioStream.bit_rate) / 1000 + " kbps"
          : "N/A";

        // Check sample rate
        if (result.details.sampleRate >= UPLOAD_CONFIG.AUDIO.minSampleRate) {
          result.checks.sampleRate = true;
        } else {
          result.warnings.push(
            `Sample rate (${result.details.sampleRate}Hz) below recommended (${UPLOAD_CONFIG.AUDIO.minSampleRate}Hz)`
          );
        }
      }
    } catch (ffprobeError) {
      // ffprobe not available, try alternative method or skip duration check
      result.warnings.push(
        "Could not analyze audio metadata (ffprobe not available). Duration check will be performed during processing."
      );
      result.checks.duration = true; // Allow to proceed, will be checked later
      result.checks.sampleRate = true;
    }

    // Note: Background noise and speech clarity detection
    // would require audio analysis ML service
    result.checks.noBackgroundNoise = true; // Placeholder - requires ML analysis
    result.checks.speechClarity = true; // Placeholder - requires ML analysis
    result.warnings.push(
      "Audio quality (noise, clarity) will be verified during QC review"
    );

    // Calculate overall validity
    const criticalChecks = ["exists", "format", "size", "duration"];
    result.isValid = criticalChecks.every((check) => result.checks[check]);

    result.details.requirements = AUDIO_REQUIREMENTS;
  } catch (error) {
    logger.error("Audio validation error:", error);
    result.errors.push(`Validation error: ${error.message}`);
  }

  return result;
}

/**
 * Format duration in seconds to MM:SS format
 */
function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Validate email format
 */
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number (Indian format)
 */
function validatePhone(phone) {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, "");
  // Indian phone: 10 digits, optionally starting with +91 or 91
  return (
    digits.length === 10 ||
    (digits.length === 12 && digits.startsWith("91")) ||
    (digits.length === 13 && digits.startsWith("91"))
  );
}

/**
 * Normalize phone number to standard format
 */
function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return "+91" + digits;
  } else if (digits.length === 12 && digits.startsWith("91")) {
    return "+" + digits;
  } else if (digits.length === 13 && digits.startsWith("91")) {
    return "+" + digits.substring(0);
  }
  return phone;
}

/**
 * Validate language codes
 */
function validateLanguageCodes(codes, maxSelections = 3) {
  const { SUPPORTED_LANGUAGES } = require("./constants");
  const validCodes = Object.keys(SUPPORTED_LANGUAGES);

  const result = {
    isValid: true,
    validCodes: [],
    invalidCodes: [],
    errors: [],
  };

  if (!Array.isArray(codes)) {
    result.isValid = false;
    result.errors.push("Language codes must be an array");
    return result;
  }

  if (codes.length === 0) {
    result.isValid = false;
    result.errors.push("At least one language must be selected");
    return result;
  }

  if (codes.length > maxSelections) {
    result.isValid = false;
    result.errors.push(`Maximum ${maxSelections} languages can be selected`);
    return result;
  }

  codes.forEach((code) => {
    if (validCodes.includes(code)) {
      result.validCodes.push(code);
    } else {
      result.invalidCodes.push(code);
    }
  });

  if (result.invalidCodes.length > 0) {
    result.isValid = false;
    result.errors.push(
      `Invalid language codes: ${result.invalidCodes.join(", ")}`
    );
  }

  return result;
}

module.exports = {
  validateImage,
  validateAudio,
  validateEmail,
  validatePhone,
  normalizePhone,
  validateLanguageCodes,
  formatDuration,
};
