/**
 * Storage Routes
 * Handles file upload/download operations via GCS
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const gcsService = require("../services/gcsService");
const logger = require("../utils/logger");

// Configure multer for temporary local storage
const upload = multer({
  dest: path.join(__dirname, "../uploads/temp"),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  },
});

/**
 * POST /api/storage/signed-upload-url
 * Get a signed URL for direct upload to GCS
 */
router.post("/signed-upload-url", async (req, res) => {
  try {
    const {
      fileName,
      fileType,
      bucketType = "UPLOADS",
      folder = "",
    } = req.body;

    if (!fileName || !fileType) {
      return res
        .status(400)
        .json({ error: "fileName and fileType are required" });
    }

    // Generate unique file path
    const uniqueId = uuidv4();
    const ext = path.extname(fileName);
    const safeName = `${uniqueId}${ext}`;
    const filePath = folder ? `${folder}/${safeName}` : safeName;

    const result = await gcsService.getSignedUploadUrl(bucketType, filePath, {
      contentType: fileType,
      expiresInMinutes: 15,
    });

    res.json({
      uploadUrl: result.uploadUrl,
      gcsPath: result.gcsPath,
      filePath,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    logger.error("[STORAGE] Error generating signed upload URL:", error);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * POST /api/storage/submission-upload-urls
 * Get signed URLs for a doctor submission with structured naming
 * Naming format: submissions/{doctor_phone}_{submission_id}/{file_type}_{timestamp}.{ext}
 */
router.post("/submission-upload-urls", async (req, res) => {
  try {
    const { doctorPhone, imageFile, audioFiles = [] } = req.body;

    if (!doctorPhone) {
      return res.status(400).json({ error: "doctorPhone is required" });
    }

    // Normalize phone number (remove non-digits, keep last 10 digits)
    const normalizedPhone = doctorPhone.replace(/\D/g, "").slice(-10);
    
    // Generate a unique submission identifier (will be used until actual submission ID is created)
    const timestamp = Date.now();
    const submissionPrefix = `submissions/${normalizedPhone}_${timestamp}`;

    const result = {
      submissionPrefix,
      phone: normalizedPhone,
      timestamp,
      image: null,
      audioFiles: [],
    };

    // Generate signed URL for image
    if (imageFile) {
      const ext = path.extname(imageFile.name) || ".jpg";
      const imagePath = `${submissionPrefix}/image_${timestamp}${ext}`;
      
      const imageUrl = await gcsService.getSignedUploadUrl("UPLOADS", imagePath, {
        contentType: imageFile.type || "image/jpeg",
        expiresInMinutes: 30,
      });

      result.image = {
        uploadUrl: imageUrl.uploadUrl,
        gcsPath: imageUrl.gcsPath,
        publicUrl: `https://storage.googleapis.com/${gcsService.BUCKETS.UPLOADS}/${imagePath}`,
        filePath: imagePath,
        expiresAt: imageUrl.expiresAt,
      };
    }

    // Generate signed URLs for audio files
    for (let i = 0; i < audioFiles.length; i++) {
      const audioFile = audioFiles[i];
      const ext = path.extname(audioFile.name) || ".mp3";
      const audioPath = `${submissionPrefix}/audio_${i + 1}_${timestamp}${ext}`;

      const audioUrl = await gcsService.getSignedUploadUrl("UPLOADS", audioPath, {
        contentType: audioFile.type || "audio/mpeg",
        expiresInMinutes: 30,
      });

      result.audioFiles.push({
        uploadUrl: audioUrl.uploadUrl,
        gcsPath: audioUrl.gcsPath,
        publicUrl: `https://storage.googleapis.com/${gcsService.BUCKETS.UPLOADS}/${audioPath}`,
        filePath: audioPath,
        expiresAt: audioUrl.expiresAt,
        index: i,
        originalName: audioFile.name,
      });
    }

    logger.info(`[STORAGE] Generated upload URLs for submission prefix: ${submissionPrefix}`);

    res.json(result);
  } catch (error) {
    logger.error("[STORAGE] Error generating submission upload URLs:", error);
    res.status(500).json({ error: "Failed to generate upload URLs" });
  }
});

/**
 * POST /api/storage/signed-download-url
 * Get a signed URL for downloading a file from GCS
 */
router.post("/signed-download-url", async (req, res) => {
  try {
    const { gcsPath, bucketType, filePath, expiresInMinutes = 60 } = req.body;

    let result;

    if (gcsPath) {
      // Parse gcsPath to get bucket and file
      const withoutPrefix = gcsPath.replace("gs://", "");
      const firstSlash = withoutPrefix.indexOf("/");
      const bucket = withoutPrefix.slice(0, firstSlash);
      const file = withoutPrefix.slice(firstSlash + 1);

      // Find bucket type from bucket name
      const bucketTypes = Object.entries(gcsService.BUCKETS);
      const foundType = bucketTypes.find(([, name]) => name === bucket);

      if (!foundType) {
        return res.status(400).json({ error: "Unknown bucket" });
      }

      result = await gcsService.getSignedDownloadUrl(foundType[0], file, {
        expiresInMinutes,
      });
    } else if (bucketType && filePath) {
      result = await gcsService.getSignedDownloadUrl(bucketType, filePath, {
        expiresInMinutes,
      });
    } else {
      return res.status(400).json({
        error: "Either gcsPath or (bucketType + filePath) is required",
      });
    }

    res.json(result);
  } catch (error) {
    logger.error("[STORAGE] Error generating signed download URL:", error);
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

/**
 * POST /api/storage/upload
 * Upload a file directly through the server to GCS
 */
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const {
      bucketType = "UPLOADS",
      folder = "",
      makePublic = false,
    } = req.body;

    // Generate destination path
    const uniqueId = uuidv4();
    const ext = path.extname(req.file.originalname);
    const destPath = folder
      ? `${folder}/${uniqueId}${ext}`
      : `${uniqueId}${ext}`;

    // Upload to GCS
    const result = await gcsService.uploadFile(
      req.file.path,
      bucketType,
      destPath,
      {
        contentType: req.file.mimetype,
        makePublic: makePublic === "true" || makePublic === true,
      }
    );

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      ...result,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });
  } catch (error) {
    logger.error("[STORAGE] Error uploading file:", error);

    // Clean up temp file on error
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ error: "Failed to upload file" });
  }
});

/**
 * POST /api/storage/upload-multiple
 * Upload multiple files to GCS
 */
router.post("/upload-multiple", upload.array("files", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files provided" });
    }

    const {
      bucketType = "UPLOADS",
      folder = "",
      makePublic = false,
    } = req.body;

    const uploadResults = [];

    for (const file of req.files) {
      try {
        const uniqueId = uuidv4();
        const ext = path.extname(file.originalname);
        const destPath = folder
          ? `${folder}/${uniqueId}${ext}`
          : `${uniqueId}${ext}`;

        const result = await gcsService.uploadFile(
          file.path,
          bucketType,
          destPath,
          {
            contentType: file.mimetype,
            makePublic: makePublic === "true" || makePublic === true,
          }
        );

        uploadResults.push({
          success: true,
          originalName: file.originalname,
          ...result,
        });

        // Clean up temp file
        fs.unlinkSync(file.path);
      } catch (uploadError) {
        uploadResults.push({
          success: false,
          originalName: file.originalname,
          error: uploadError.message,
        });

        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    const successCount = uploadResults.filter((r) => r.success).length;

    res.json({
      total: req.files.length,
      successful: successCount,
      failed: req.files.length - successCount,
      results: uploadResults,
    });
  } catch (error) {
    logger.error("[STORAGE] Error uploading multiple files:", error);
    res.status(500).json({ error: "Failed to upload files" });
  }
});

/**
 * DELETE /api/storage/delete
 * Delete a file from GCS
 */
router.delete("/delete", async (req, res) => {
  try {
    const { gcsPath } = req.body;

    if (!gcsPath) {
      return res.status(400).json({ error: "gcsPath is required" });
    }

    await gcsService.deleteFile(gcsPath);

    res.json({ success: true, deleted: gcsPath });
  } catch (error) {
    logger.error("[STORAGE] Error deleting file:", error);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

/**
 * GET /api/storage/metadata
 * Get metadata for a file in GCS
 */
router.get("/metadata", async (req, res) => {
  try {
    const { bucketType, filePath } = req.query;

    if (!bucketType || !filePath) {
      return res
        .status(400)
        .json({ error: "bucketType and filePath are required" });
    }

    const metadata = await gcsService.getFileMetadata(bucketType, filePath);

    res.json(metadata);
  } catch (error) {
    logger.error("[STORAGE] Error getting file metadata:", error);
    res.status(500).json({ error: "Failed to get file metadata" });
  }
});

/**
 * GET /api/storage/list
 * List files in a GCS bucket/folder
 */
router.get("/list", async (req, res) => {
  try {
    const { bucketType, prefix = "" } = req.query;

    if (!bucketType) {
      return res.status(400).json({ error: "bucketType is required" });
    }

    const files = await gcsService.listFiles(bucketType, prefix);

    res.json({ files, count: files.length });
  } catch (error) {
    logger.error("[STORAGE] Error listing files:", error);
    res.status(500).json({ error: "Failed to list files" });
  }
});

/**
 * GET /api/storage/buckets
 * Get configured bucket information
 */
router.get("/buckets", (req, res) => {
  res.json({
    buckets: gcsService.BUCKETS,
    configured: Object.entries(gcsService.BUCKETS).map(([type, name]) => ({
      type,
      name,
      url: `gs://${name}`,
    })),
  });
});

module.exports = router;
