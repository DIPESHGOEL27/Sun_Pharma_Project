/**
 * Upload Master Audio Files Script
 *
 * This script uploads all master audio files from the VOs folder to the server
 * and registers them in the database as audio_masters.
 *
 * Usage: node scripts/upload-master-audios.js
 */

const fs = require("fs");
const path = require("path");
const FormData = require("form-data");

// API Base URL
const API_BASE = process.env.API_BASE || "http://localhost:3001";

// Language code mapping from file names
const LANGUAGE_MAP = {
  "English VO.wav": { code: "en", name: "English" },
  "Hindi VO.wav": { code: "hi", name: "Hindi" },
  "Marathi VO.wav": { code: "mr", name: "Marathi" },
  "Gujarati VO.wav": { code: "gu", name: "Gujarati" },
  "Tamil VO.wav": { code: "ta", name: "Tamil" },
  "Telugu VO.wav": { code: "te", name: "Telugu" },
  "Kannada VO.wav": { code: "kn", name: "Kannada" },
  "Bengali VO.wav": { code: "bn", name: "Bengali" },
  "Malayalam VO.wav": { code: "ml", name: "Malayalam" },
  "Punjabi VO.wav": { code: "pa", name: "Punjabi" },
  "Odiya VO.wav": { code: "or", name: "Odia" },
};

const MASTER_AUDIO_DIR = path.join(__dirname, "../Master_Audio/VOs");

async function uploadMasterAudio(filePath, languageCode, languageName) {
  const fetch = (await import("node-fetch")).default;

  console.log(`\nUploading ${languageName} (${languageCode})...`);
  console.log(`  File: ${filePath}`);

  const form = new FormData();
  form.append("audio", fs.createReadStream(filePath));
  form.append("language_code", languageCode);
  form.append("name", `${languageName} Master Audio`);
  form.append(
    "description",
    `Master voice over audio for ${languageName} language video generation`,
  );

  try {
    const response = await fetch(`${API_BASE}/api/audio-masters`, {
      method: "POST",
      body: form,
      headers: form.getHeaders(),
    });

    const data = await response.json();

    if (response.ok) {
      console.log(`  ✓ Uploaded successfully! ID: ${data.id}`);
      return { success: true, language: languageCode, id: data.id };
    } else {
      console.log(`  ✗ Failed: ${data.error || "Unknown error"}`);
      return { success: false, language: languageCode, error: data.error };
    }
  } catch (error) {
    console.log(`  ✗ Error: ${error.message}`);
    return { success: false, language: languageCode, error: error.message };
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Master Audio Upload Script");
  console.log("=".repeat(60));
  console.log(`\nAPI Base: ${API_BASE}`);
  console.log(`Source Dir: ${MASTER_AUDIO_DIR}`);

  // Check if directory exists
  if (!fs.existsSync(MASTER_AUDIO_DIR)) {
    console.error(`\nError: Directory not found: ${MASTER_AUDIO_DIR}`);
    process.exit(1);
  }

  // Get all files in the directory
  const files = fs.readdirSync(MASTER_AUDIO_DIR);
  console.log(`\nFound ${files.length} files in VOs folder:`);
  files.forEach((f) => console.log(`  - ${f}`));

  const results = [];

  for (const [fileName, lang] of Object.entries(LANGUAGE_MAP)) {
    const filePath = path.join(MASTER_AUDIO_DIR, fileName);

    if (fs.existsSync(filePath)) {
      const result = await uploadMasterAudio(filePath, lang.code, lang.name);
      results.push(result);
    } else {
      console.log(`\n⚠ File not found: ${fileName}`);
      results.push({
        success: false,
        language: lang.code,
        error: "File not found",
      });
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("Summary");
  console.log("=".repeat(60));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`\n✓ Successfully uploaded: ${successful.length}`);
  successful.forEach((r) => console.log(`  - ${r.language}: ID ${r.id}`));

  if (failed.length > 0) {
    console.log(`\n✗ Failed uploads: ${failed.length}`);
    failed.forEach((r) => console.log(`  - ${r.language}: ${r.error}`));
  }

  console.log("\n" + "=".repeat(60));
}

main().catch(console.error);
