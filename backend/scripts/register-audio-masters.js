/**
 * Register Audio Masters Script
 *
 * Uploads audio master files from local uploads folder to GCS and registers in database.
 * Run this inside the Docker container.
 *
 * Usage: node scripts/register-audio-masters.js
 */

const fs = require("fs");
const path = require("path");
const { initDatabase, getDb } = require("../db/database.js");
const gcsService = require("../services/gcsService.js");

// Language code mapping from file names
const LANGUAGE_MAP = {
  "English VO.wav": { code: "en", name: "English" },
  "Hindi VO.wav": { code: "hi", name: "Hindi" },
  "Marathi VO.wav": { code: "mr", name: "Marathi" },
  "Gujarati VO.wav": { code: "gu", name: "Gujarati" },
  "Tamil VO.wav": { code: "ta", name: "Tamil" },
  "Telugu VO.wav": { code: "te", name: "Telugu" },
  "Kannada VO.wav": { code: "kn", name: "Kannada" },
  "Malayalam VO.wav": { code: "ml", name: "Malayalam" },
  "Punjabi VO.wav": { code: "pa", name: "Punjabi" },
  "Odiya VO.wav": { code: "or", name: "Odia" },
};

const AUDIO_MASTERS_DIR = path.join(__dirname, "../uploads/audio_masters");

async function main() {
  console.log("=".repeat(60));
  console.log("Audio Masters Registration Script");
  console.log("=".repeat(60));

  // Initialize database first
  await initDatabase();
  const db = getDb();

  // Clear old audio masters
  console.log("\nClearing old audio masters...");
  db.prepare("DELETE FROM audio_masters").run();
  console.log("Done.");

  // Get all files
  const files = fs.readdirSync(AUDIO_MASTERS_DIR);
  console.log(`\nFound ${files.length} files in audio_masters folder.`);

  let successCount = 0;
  let errorCount = 0;

  for (const [fileName, lang] of Object.entries(LANGUAGE_MAP)) {
    const filePath = path.join(AUDIO_MASTERS_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      console.log(`\n⚠ File not found: ${fileName}`);
      errorCount++;
      continue;
    }

    console.log(`\nProcessing ${lang.name} (${lang.code})...`);

    try {
      // Upload to GCS
      const gcsPath = `audio_masters/${lang.code}_master.wav`;
      console.log(`  Uploading to GCS: ${gcsPath}...`);

      const uploadResult = await gcsService.uploadFile(
        filePath,
        "AUDIO_MASTERS",
        gcsPath,
      );
      console.log(`  ✓ Uploaded to: ${uploadResult.gcsPath}`);

      // Get file stats
      const stats = fs.statSync(filePath);
      const fileSizeKb = Math.round(stats.size / 1024);

      // Insert into database
      const stmt = db.prepare(`
        INSERT INTO audio_masters (
          language_code, name, description, file_path, gcs_path, 
          file_size_kb, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      const result = stmt.run(
        lang.code,
        `${lang.name} Master Audio`,
        `Master voice over audio for ${lang.name} language video generation`,
        filePath,
        uploadResult.gcsPath,
        fileSizeKb,
      );

      console.log(`  ✓ Registered in DB with ID: ${result.lastInsertRowid}`);
      successCount++;
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
      errorCount++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${successCount} success, ${errorCount} errors`);
  console.log("=".repeat(60));

  // Show final state
  const masters = db
    .prepare("SELECT id, language_code, name, gcs_path FROM audio_masters")
    .all();
  console.log("\nRegistered Audio Masters:");
  masters.forEach((m) => {
    console.log(`  [${m.id}] ${m.language_code}: ${m.name}`);
  });
}

main().catch(console.error);
