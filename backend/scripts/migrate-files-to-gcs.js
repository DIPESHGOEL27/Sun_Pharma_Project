/**
 * Migration Script: Upload existing local files to GCS
 *
 * This script:
 * 1. Reads all submissions from the database
 * 2. Uploads image_path and audio_path files to GCS
 * 3. Updates the database with image_gcs_path and audio_gcs_path
 *
 * Usage: node scripts/migrate-files-to-gcs.js
 */

require("dotenv").config();
const path = require("path");
const fs = require("fs");

// Set up path to service account key
process.env.GCP_KEY_FILE =
  process.env.GCP_KEY_FILE ||
  path.join(__dirname, "../sunpharma-video-sa-key.json");

const { Storage } = require("@google-cloud/storage");
const initSqlJs = require("sql.js");

// GCS Configuration
const BUCKETS = {
  UPLOADS:
    process.env.GCS_BUCKET_UPLOADS ||
    "sunpharma-video-uploads-sage-shard-448708-v9",
};

const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID || "sage-shard-448708-v9",
  keyFilename: process.env.GCP_KEY_FILE,
});

const DB_PATH =
  process.env.DATABASE_PATH || path.join(__dirname, "../data/sun_pharma.db");
const UPLOADS_DIR = path.join(__dirname, "../uploads");

let db = null;

async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log("✅ Database loaded from:", DB_PATH);
  } else {
    throw new Error(`Database not found at ${DB_PATH}`);
  }
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
    console.log("💾 Database saved");
  }
}

async function uploadToGCS(localPath, destinationPath) {
  try {
    const bucket = storage.bucket(BUCKETS.UPLOADS);

    console.log(`  📤 Uploading: ${localPath} -> ${destinationPath}`);

    await bucket.upload(localPath, {
      destination: destinationPath,
      metadata: {
        contentType: getContentType(localPath),
      },
    });

    // With uniform bucket-level access, we don't need makePublic()
    // The bucket should have allUsers:objectViewer IAM binding for public access
    const publicUrl = `https://storage.googleapis.com/${BUCKETS.UPLOADS}/${destinationPath}`;
    console.log(`  ✅ Uploaded: ${publicUrl}`);

    return publicUrl;
  } catch (error) {
    console.error(`  ❌ Upload failed: ${error.message}`);
    return null;
  }
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".webm": "audio/webm",
    ".ogg": "audio/ogg",
  };
  return types[ext] || "application/octet-stream";
}

function extractFilename(dbPath) {
  // Handle paths like "/app/uploads/image/filename.png"
  if (!dbPath) return null;
  return dbPath.split("/").pop();
}

async function migrateSubmission(submission) {
  console.log(`\n📋 Processing submission #${submission.id}`);

  let imageGcsPath = submission.image_gcs_path;
  let audioGcsPath = submission.audio_gcs_path;
  let updated = false;

  // Migrate image
  if (submission.image_path && !submission.image_gcs_path) {
    const filename = extractFilename(submission.image_path);
    if (filename) {
      const localPath = path.join(UPLOADS_DIR, "image", filename);

      if (fs.existsSync(localPath)) {
        const gcsDestination = `submissions/${submission.id}/image/${filename}`;
        imageGcsPath = await uploadToGCS(localPath, gcsDestination);
        if (imageGcsPath) updated = true;
      } else {
        console.log(`  ⚠️ Image file not found: ${localPath}`);
      }
    }
  } else if (submission.image_gcs_path) {
    console.log(`  ℹ️ Image already has GCS path`);
  }

  // Migrate audio
  if (submission.audio_path && !submission.audio_gcs_path) {
    let audioPath = submission.audio_path;

    // Handle JSON array format
    try {
      const parsed = JSON.parse(audioPath);
      if (Array.isArray(parsed) && parsed.length > 0) {
        audioPath = parsed[0];
      }
    } catch (e) {
      // Not JSON, use as-is
    }

    const filename = extractFilename(audioPath);
    if (filename) {
      const localPath = path.join(UPLOADS_DIR, "audio", filename);

      if (fs.existsSync(localPath)) {
        const gcsDestination = `submissions/${submission.id}/audio/${filename}`;
        audioGcsPath = await uploadToGCS(localPath, gcsDestination);
        if (audioGcsPath) updated = true;
      } else {
        console.log(`  ⚠️ Audio file not found: ${localPath}`);
      }
    }
  } else if (submission.audio_gcs_path) {
    console.log(`  ℹ️ Audio already has GCS path`);
  }

  // Update database
  if (updated) {
    const updateSql = `
      UPDATE submissions 
      SET image_gcs_path = ?, audio_gcs_path = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    db.run(updateSql, [imageGcsPath, audioGcsPath, submission.id]);
    console.log(`  💾 Database updated for submission #${submission.id}`);
  }

  return updated;
}

async function main() {
  console.log("🚀 Starting GCS Migration Script");
  console.log("================================\n");

  try {
    // Initialize database
    await initDatabase();

    // Get all submissions
    const result = db.exec(`
      SELECT id, image_path, image_gcs_path, audio_path, audio_gcs_path 
      FROM submissions 
      ORDER BY id
    `);

    if (!result.length || !result[0].values.length) {
      console.log("No submissions found");
      return;
    }

    const columns = result[0].columns;
    const submissions = result[0].values.map((row) => {
      const obj = {};
      columns.forEach((col, i) => (obj[col] = row[i]));
      return obj;
    });

    console.log(`📊 Found ${submissions.length} submissions to process\n`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const submission of submissions) {
      const wasUpdated = await migrateSubmission(submission);
      if (wasUpdated) {
        migratedCount++;
        // Save after each successful migration
        saveDatabase();
      } else {
        skippedCount++;
      }
    }

    console.log("\n================================");
    console.log("📈 Migration Summary:");
    console.log(`   ✅ Migrated: ${migratedCount}`);
    console.log(`   ⏭️ Skipped: ${skippedCount}`);
    console.log(`   📁 Total: ${submissions.length}`);
    console.log("================================\n");

    // Final save
    saveDatabase();
    console.log("✅ Migration complete!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

main();
