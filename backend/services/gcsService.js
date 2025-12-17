/**
 * Google Cloud Storage Service
 * Handles file uploads/downloads to GCS buckets
 */

const { Storage } = require("@google-cloud/storage");
const path = require("path");
const fs = require("fs");
const logger = require("../utils/logger");

// Initialize GCS client
const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename:
    process.env.GCP_KEY_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

// Bucket names from environment (with correct default bucket names)
const BUCKETS = {
  UPLOADS:
    process.env.GCS_BUCKET_UPLOADS ||
    "sunpharma-video-uploads-sage-shard-448708-v9",
  AUDIO_MASTERS:
    process.env.GCS_BUCKET_AUDIO_MASTERS ||
    "sunpharma-video-audio-masters-sage-shard-448708-v9",
  GENERATED_AUDIO:
    process.env.GCS_BUCKET_GENERATED_AUDIO ||
    "sunpharma-video-generated-audio-sage-shard-448708-v9",
  GENERATED_VIDEO:
    process.env.GCS_BUCKET_GENERATED_VIDEO ||
    "sunpharma-video-generated-video-sage-shard-448708-v9",
};

/**
 * Get a bucket reference
 * @param {string} bucketType - One of: UPLOADS, AUDIO_MASTERS, GENERATED_AUDIO, GENERATED_VIDEO
 */
function getBucket(bucketType) {
  const bucketName = BUCKETS[bucketType];
  if (!bucketName) {
    throw new Error(`Unknown bucket type: ${bucketType}`);
  }
  return storage.bucket(bucketName);
}

/**
 * Upload a file to GCS
 * @param {string} localFilePath - Path to local file
 * @param {string} bucketType - Target bucket type
 * @param {string} destinationPath - Path in GCS (e.g., "submissions/123/image.jpg")
 * @param {object} options - Additional options
 * @returns {Promise<{gcsPath: string, publicUrl: string}>}
 */
async function uploadFile(
  localFilePath,
  bucketType,
  destinationPath,
  options = {}
) {
  try {
    const bucket = getBucket(bucketType);
    const { contentType, makePublic = false } = options;

    logger.info(
      `[GCS] Uploading ${localFilePath} to ${BUCKETS[bucketType]}/${destinationPath}`
    );

    const uploadOptions = {
      destination: destinationPath,
      metadata: {
        contentType: contentType || getMimeType(localFilePath),
      },
    };

    await bucket.upload(localFilePath, uploadOptions);

    const gcsPath = `gs://${BUCKETS[bucketType]}/${destinationPath}`;
    let publicUrl = `https://storage.googleapis.com/${BUCKETS[bucketType]}/${destinationPath}`;

    // Make file public if requested
    // Note: This will fail silently if the bucket has uniform bucket-level access enabled
    // In that case, public access is controlled at the bucket level via IAM
    if (makePublic) {
      try {
        await bucket.file(destinationPath).makePublic();
      } catch (aclError) {
        // Bucket likely has uniform bucket-level access enabled
        // Public URL will still work if bucket has allUsers read access via IAM
        logger.warn(`[GCS] Could not set individual ACL (uniform bucket access?): ${aclError.message}`);
      }
    }

    logger.info(`[GCS] Upload successful: ${gcsPath}`);

    return {
      gcsPath,
      publicUrl,
      bucket: BUCKETS[bucketType],
      path: destinationPath,
    };
  } catch (error) {
    logger.error(`[GCS] Upload failed for ${localFilePath}:`, error);
    throw new Error(`GCS upload failed: ${error.message}`);
  }
}

/**
 * Upload a buffer to GCS
 * @param {Buffer} buffer - File buffer
 * @param {string} bucketType - Target bucket type
 * @param {string} destinationPath - Path in GCS
 * @param {object} options - Additional options
 */
async function uploadBuffer(buffer, bucketType, destinationPath, options = {}) {
  try {
    const bucket = getBucket(bucketType);
    const { contentType, makePublic = false } = options;

    const file = bucket.file(destinationPath);

    await file.save(buffer, {
      contentType: contentType || "application/octet-stream",
      resumable: false,
    });

    const gcsPath = `gs://${BUCKETS[bucketType]}/${destinationPath}`;
    const publicUrl = `https://storage.googleapis.com/${BUCKETS[bucketType]}/${destinationPath}`;

    if (makePublic) {
      try {
        await file.makePublic();
      } catch (aclError) {
        // Bucket likely has uniform bucket-level access enabled
        logger.warn(`[GCS] Could not set individual ACL (uniform bucket access?): ${aclError.message}`);
      }
    }

    logger.info(`[GCS] Buffer upload successful: ${gcsPath}`);

    return {
      gcsPath,
      publicUrl,
      bucket: BUCKETS[bucketType],
      path: destinationPath,
    };
  } catch (error) {
    logger.error(`[GCS] Buffer upload failed:`, error);
    throw new Error(`GCS buffer upload failed: ${error.message}`);
  }
}

/**
 * Download a file from GCS
 * @param {string} gcsPath - GCS path (gs://bucket/path or just path)
 * @param {string} bucketType - Bucket type (if gcsPath doesn't include bucket)
 * @param {string} localDestination - Local file path to save to
 */
async function downloadFile(gcsPath, bucketType, localDestination) {
  try {
    let bucketName, filePath;

    if (gcsPath.startsWith("gs://")) {
      // Parse gs:// URL
      const withoutPrefix = gcsPath.slice(5);
      const firstSlash = withoutPrefix.indexOf("/");
      bucketName = withoutPrefix.slice(0, firstSlash);
      filePath = withoutPrefix.slice(firstSlash + 1);
    } else {
      bucketName = BUCKETS[bucketType];
      filePath = gcsPath;
    }

    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);

    // Ensure destination directory exists
    const destDir = path.dirname(localDestination);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    await file.download({ destination: localDestination });

    logger.info(`[GCS] Downloaded ${gcsPath} to ${localDestination}`);

    return localDestination;
  } catch (error) {
    logger.error(`[GCS] Download failed for ${gcsPath}:`, error);
    throw new Error(`GCS download failed: ${error.message}`);
  }
}

/**
 * Get a signed URL for direct upload
 * @param {string} bucketType - Target bucket type
 * @param {string} filePath - Path in GCS
 * @param {object} options - Options including contentType and expiry
 */
async function getSignedUploadUrl(bucketType, filePath, options = {}) {
  try {
    const bucket = getBucket(bucketType);
    const file = bucket.file(filePath);

    const { contentType = "application/octet-stream", expiresInMinutes = 15 } =
      options;

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + expiresInMinutes * 60 * 1000,
      contentType,
    });

    logger.info(`[GCS] Generated signed upload URL for ${filePath}`);

    return {
      uploadUrl: url,
      gcsPath: `gs://${BUCKETS[bucketType]}/${filePath}`,
      expiresAt: new Date(
        Date.now() + expiresInMinutes * 60 * 1000
      ).toISOString(),
    };
  } catch (error) {
    logger.error(`[GCS] Failed to generate signed URL:`, error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
}

/**
 * Get a signed URL for download
 * @param {string} bucketType - Source bucket type
 * @param {string} filePath - Path in GCS
 * @param {object} options - Options including expiry
 */
async function getSignedDownloadUrl(bucketType, filePath, options = {}) {
  try {
    const bucket = getBucket(bucketType);
    const file = bucket.file(filePath);

    const { expiresInMinutes = 60 } = options;

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + expiresInMinutes * 60 * 1000,
    });

    return {
      downloadUrl: url,
      expiresAt: new Date(
        Date.now() + expiresInMinutes * 60 * 1000
      ).toISOString(),
    };
  } catch (error) {
    logger.error(`[GCS] Failed to generate signed download URL:`, error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
}

/**
 * Delete a file from GCS
 * @param {string} gcsPath - GCS path (gs://bucket/path)
 */
async function deleteFile(gcsPath) {
  try {
    if (!gcsPath.startsWith("gs://")) {
      throw new Error("Invalid GCS path format");
    }

    const withoutPrefix = gcsPath.slice(5);
    const firstSlash = withoutPrefix.indexOf("/");
    const bucketName = withoutPrefix.slice(0, firstSlash);
    const filePath = withoutPrefix.slice(firstSlash + 1);

    const bucket = storage.bucket(bucketName);
    await bucket.file(filePath).delete();

    logger.info(`[GCS] Deleted ${gcsPath}`);

    return true;
  } catch (error) {
    if (error.code === 404) {
      logger.warn(`[GCS] File not found for deletion: ${gcsPath}`);
      return true;
    }
    logger.error(`[GCS] Delete failed for ${gcsPath}:`, error);
    throw new Error(`GCS delete failed: ${error.message}`);
  }
}

/**
 * Check if a file exists in GCS
 * @param {string} bucketType - Bucket type
 * @param {string} filePath - Path in GCS
 */
async function fileExists(bucketType, filePath) {
  try {
    const bucket = getBucket(bucketType);
    const [exists] = await bucket.file(filePath).exists();
    return exists;
  } catch (error) {
    logger.error(`[GCS] Error checking file existence:`, error);
    return false;
  }
}

/**
 * Get file metadata
 * @param {string} bucketType - Bucket type
 * @param {string} filePath - Path in GCS
 */
async function getFileMetadata(bucketType, filePath) {
  try {
    const bucket = getBucket(bucketType);
    const [metadata] = await bucket.file(filePath).getMetadata();
    return {
      size: parseInt(metadata.size, 10),
      contentType: metadata.contentType,
      created: metadata.timeCreated,
      updated: metadata.updated,
      md5Hash: metadata.md5Hash,
    };
  } catch (error) {
    logger.error(`[GCS] Error getting file metadata:`, error);
    throw new Error(`Failed to get file metadata: ${error.message}`);
  }
}

/**
 * List files in a GCS path
 * @param {string} bucketType - Bucket type
 * @param {string} prefix - Path prefix to list
 */
async function listFiles(bucketType, prefix = "") {
  try {
    const bucket = getBucket(bucketType);
    const [files] = await bucket.getFiles({ prefix });

    return files.map((file) => ({
      name: file.name,
      size: parseInt(file.metadata.size, 10),
      contentType: file.metadata.contentType,
      updated: file.metadata.updated,
    }));
  } catch (error) {
    logger.error(`[GCS] Error listing files:`, error);
    throw new Error(`Failed to list files: ${error.message}`);
  }
}

/**
 * Copy a file within or between buckets
 * @param {string} sourceBucket - Source bucket type
 * @param {string} sourcePath - Source file path
 * @param {string} destBucket - Destination bucket type
 * @param {string} destPath - Destination file path
 */
async function copyFile(sourceBucket, sourcePath, destBucket, destPath) {
  try {
    const srcBucketRef = getBucket(sourceBucket);
    const destBucketRef = getBucket(destBucket);

    await srcBucketRef.file(sourcePath).copy(destBucketRef.file(destPath));

    logger.info(`[GCS] Copied ${sourcePath} to ${destPath}`);

    return {
      gcsPath: `gs://${BUCKETS[destBucket]}/${destPath}`,
      publicUrl: `https://storage.googleapis.com/${BUCKETS[destBucket]}/${destPath}`,
    };
  } catch (error) {
    logger.error(`[GCS] Copy failed:`, error);
    throw new Error(`GCS copy failed: ${error.message}`);
  }
}

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".json": "application/json",
    ".pdf": "application/pdf",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Convert gs:// URL to https:// URL
 */
function gsToHttpUrl(gsUrl) {
  if (!gsUrl.startsWith("gs://")) {
    return gsUrl;
  }
  return gsUrl.replace("gs://", "https://storage.googleapis.com/");
}

/**
 * Convert https:// URL to gs:// URL
 */
function httpToGsUrl(httpUrl) {
  const prefix = "https://storage.googleapis.com/";
  if (!httpUrl.startsWith(prefix)) {
    return httpUrl;
  }
  return "gs://" + httpUrl.slice(prefix.length);
}

module.exports = {
  // Core operations
  uploadFile,
  uploadBuffer,
  downloadFile,
  deleteFile,
  copyFile,

  // Signed URLs
  getSignedUploadUrl,
  getSignedDownloadUrl,

  // Utilities
  fileExists,
  getFileMetadata,
  listFiles,
  getBucket,
  gsToHttpUrl,
  httpToGsUrl,
  getMimeType,

  // Constants
  BUCKETS,
};
