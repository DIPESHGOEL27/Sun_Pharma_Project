/**
 * Update Audio Masters Script
 *
 * Updates existing audio master records with new GCS paths and file paths.
 * Run this inside the Docker container AFTER copying new audio files.
 */

const { initDatabase, getDb, saveDatabase } = require("../db/database.js");
const gcsService = require("../services/gcsService.js");
const fs = require("fs");
const path = require("path");

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

const AUDIO_MASTERS_DIR = "/app/uploads/audio_masters";

async function main() {
  console.log("=".repeat(60));
  console.log("Audio Masters Update Script");
  console.log("=".repeat(60));

  await initDatabase();
  const db = getDb();

  // First, clean up duplicate entries - keep only the most recent per language
  console.log("\nCleaning up duplicate entries...");
  const duplicates = db
    .prepare(
      `
    SELECT language_code, COUNT(*) as cnt 
    FROM audio_masters 
    GROUP BY language_code 
    HAVING cnt > 1
  `,
    )
    .all();

  for (const dup of duplicates) {
    // Get IDs to delete (all except the most recent)
    const toDelete = db
      .prepare(
        `
      SELECT id FROM audio_masters 
      WHERE language_code = ? 
      ORDER BY id DESC 
      LIMIT -1 OFFSET 1
    `,
      )
      .all(dup.language_code);

    for (const row of toDelete) {
      db.prepare("DELETE FROM audio_masters WHERE id = ?").run(row.id);
      console.log(
        `  Deleted duplicate ${dup.language_code} entry with ID: ${row.id}`,
      );
    }
  }

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
      const gcsDestPath = `audio_masters/${lang.code}_master.wav`;
      console.log(`  Uploading to GCS: ${gcsDestPath}...`);

      const uploadResult = await gcsService.uploadFile(
        filePath,
        "AUDIO_MASTERS",
        gcsDestPath,
      );
      console.log(`  ✓ Uploaded to: ${uploadResult.gcsPath}`);

      // Check if record exists for this language
      const existing = db
        .prepare(
          `
        SELECT id FROM audio_masters WHERE language_code = ? ORDER BY id DESC LIMIT 1
      `,
        )
        .get(lang.code);

      if (existing) {
        // Update existing record
        db.prepare(
          `
          UPDATE audio_masters 
          SET file_path = ?, gcs_path = ?, name = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        ).run(
          filePath,
          uploadResult.gcsPath,
          `${lang.name} Master Audio`,
          existing.id,
        );
        console.log(`  ✓ Updated DB record ID: ${existing.id}`);
      } else {
        // Insert new record
        const result = db
          .prepare(
            `
          INSERT INTO audio_masters (
            language_code, name, description, file_path, gcs_path, 
            is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
          )
          .run(
            lang.code,
            `${lang.name} Master Audio`,
            `Master voice over audio for ${lang.name} language video generation`,
            filePath,
            uploadResult.gcsPath,
          );
        console.log(`  ✓ Inserted new DB record ID: ${result.lastInsertRowid}`);
      }

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
    .prepare(
      "SELECT id, language_code, name, gcs_path, file_path FROM audio_masters ORDER BY language_code",
    )
    .all();
  console.log("\nCurrent Audio Masters:");
  masters.forEach((m) => {
    console.log(`  [${m.id}] ${m.language_code}: ${m.name}`);
    console.log(`      GCS: ${m.gcs_path || "NULL"}`);
    console.log(`      File: ${m.file_path}`);
  });

  // Save database to disk
  console.log("\nSaving database...");
  saveDatabase();
  console.log("Database saved successfully!");
}

main().catch(console.error);
