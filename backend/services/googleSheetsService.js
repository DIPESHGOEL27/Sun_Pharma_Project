/**
 * Google Sheets Integration Service
 * Syncs submission data to Sun Pharma QC Google Sheet
 * Creates one row per language selection (e.g., 2 languages = 2 rows)
 * Sheet: https://docs.google.com/spreadsheets/d/1lFmBPuNWG99qVx_NdDpD72P7aSuCruynnsbWMdol7_g
 */

const { google } = require("googleapis");
const path = require("path");
const logger = require("../utils/logger");

// Google Sheet Configuration - Sun Pharma QC Sheet
const SHEET_ID = "1lFmBPuNWG99qVx_NdDpD72P7aSuCruynnsbWMdol7_g";
const SHEET_NAME = "Sheet1";

// Language name mapping
const LANGUAGE_NAMES = {
  en: "English",
  hi: "Hindi",
  mr: "Marathi",
  gu: "Gujarati",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  bn: "Bengali",
  pa: "Punjabi",
};

// Initialize Google Sheets client
let sheets = null;
let auth = null;

/**
 * Initialize the Google Sheets API client
 */
async function initSheetsClient() {
  if (sheets) return sheets;

  try {
    // Use podcast-setup service account key
    const keyFilePath = path.join(__dirname, "../sheets-sa-key.json");

    auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    sheets = google.sheets({ version: "v4", auth });
    logger.info("[SHEETS] Google Sheets client initialized successfully");
    return sheets;
  } catch (error) {
    logger.error("[SHEETS] Failed to initialize Google Sheets client:", error);
    throw error;
  }
}

/**
 * Get the header row matching the QC CSV structure
 * Columns: A-V (22 columns)
 */
function getHeaders() {
  return [
    "ID",                           // A: Entry ID (submissionId-langCode)
    "Video Language",               // B: Language name
    "Campaign Name",                // C: Campaign
    "MR Code",                      // D: MR Code
    "MR Name",                      // E: MR Name
    "MR Mobile no.",                // F: MR Mobile
    "Dr. Full Name",                // G: Doctor Name
    "Dr. Email",                    // H: Doctor Email
    "Dr. Mobile no.",               // I: Doctor Phone
    "Dr. Specialty",                // J: Specialty
    "Dr. Clinic/Hospital Name",     // K: Clinic Name
    "Doctor's City",                // L: City
    "Doctor's State",               // M: State
    "Doctor Photo Link",            // N: Image URL
    "Doctor Voice Samples Links",   // O: Audio URL
    "Final video link",             // P: Generated Video URL
    "Video Generated on",           // Q: Video generated timestamp
    "Status",                       // R: QC Status (Approved/Rejected/Regenerate)
    "Reason for rejection / re-upload", // S: QC Notes/Rejection reason
    "Hindi Pronunciation",          // T: Hindi pronunciation notes
    "Regenerated?",                 // U: Whether regenerated
    "Comments",                     // V: Additional comments
  ];
}

/**
 * Initialize the sheet with headers if not already set
 */
async function initializeSheet() {
  try {
    const client = await initSheetsClient();

    logger.info(`[SHEETS] Checking sheet ${SHEET_ID} for headers...`);
    const response = await client.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1:V1`,
    });

    const existingHeaders = response.data.values?.[0];
    const requiredHeaders = getHeaders();

    // Check if headers need to be set
    const needsUpdate = !existingHeaders || 
                        existingHeaders.length === 0 || 
                        existingHeaders[0] !== "ID";

    if (needsUpdate) {
      // Set headers (don't clear - preserve existing data)
      await client.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: "RAW",
        resource: {
          values: [requiredHeaders],
        },
      });
      logger.info("[SHEETS] Sheet headers initialized with QC format");

      // Format header row (bold, background color, freeze)
      await client.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        resource: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: 0,
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.2, green: 0.4, blue: 0.6 },
                    textFormat: {
                      bold: true,
                      foregroundColor: { red: 1, green: 1, blue: 1 },
                    },
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat)",
              },
            },
            {
              updateSheetProperties: {
                properties: {
                  sheetId: 0,
                  gridProperties: {
                    frozenRowCount: 1,
                  },
                },
                fields: "gridProperties.frozenRowCount",
              },
            },
          ],
        },
      });
    }

    return true;
  } catch (error) {
    logger.error("[SHEETS] Failed to initialize sheet:", error);
    return false;
  }
}

/**
 * Format submission data for a single language row
 * Matches the QC CSV column structure
 */
function formatSubmissionLanguageRow(submission, languageCode, options = {}) {
  const { video = null, audio = null } = options;

  const entryId = `${submission.id}-${languageCode}`;
  const languageName = LANGUAGE_NAMES[languageCode] || languageCode;

  // Determine QC status text
  let qcStatusText = "";
  if (video?.qc_status === "approved" || audio?.qc_status === "approved") {
    qcStatusText = "Approved";
  } else if (video?.qc_status === "rejected" || audio?.qc_status === "rejected") {
    qcStatusText = "Rejected";
  } else if (video?.status === "completed" || audio?.status === "completed") {
    qcStatusText = ""; // Pending QC
  }

  // Format doctor voice samples - check both audio_path and audio_gcs_path
  let voiceSamplesLinks = "";
  const audioPathSource = submission.audio_gcs_path || submission.audio_path;
  if (audioPathSource) {
    try {
      // Try parsing as JSON first
      const audioArray = JSON.parse(audioPathSource);
      if (Array.isArray(audioArray)) {
        // Extract GCS paths or public URLs from array items
        voiceSamplesLinks = audioArray
          .slice(0, 5) // Max 5 samples
          .map(item => {
            if (typeof item === 'string') return item;
            return item.gcsPath || item.gcs_path || item.publicUrl || item.public_url || '';
          })
          .filter(url => url)
          .join(", ");
      } else if (typeof audioArray === 'object') {
        voiceSamplesLinks = audioArray.gcsPath || audioArray.gcs_path || audioArray.publicUrl || '';
      }
    } catch (e) {
      // Not JSON, use as-is (might be comma-separated or single path)
      voiceSamplesLinks = audioPathSource;
    }
  }

  // Get video URL and timestamp
  const videoUrl = video?.public_url || video?.gcs_path || "";
  const videoGeneratedOn = video?.updated_at || video?.created_at || "";

  // Get MR mobile - check both mr_mobile and mr_phone (from joined query)
  const mrMobile = submission.mr_mobile || submission.mr_phone || "";

  return [
    entryId,                                                    // A: ID
    languageName,                                               // B: Video Language
    submission.campaign_name || "sunpharma",                    // C: Campaign Name
    submission.mr_code || "",                                   // D: MR Code
    submission.mr_name || "",                                   // E: MR Name
    mrMobile,                                                   // F: MR Mobile no.
    submission.doctor_name || "",                               // G: Dr. Full Name
    submission.doctor_email || "",                              // H: Dr. Email
    submission.doctor_phone || "",                              // I: Dr. Mobile no.
    submission.doctor_specialization || "",                     // J: Dr. Specialty
    submission.doctor_clinic_name || "",                        // K: Dr. Clinic/Hospital Name
    submission.doctor_city || "",                               // L: Doctor's City
    submission.doctor_state || "",                              // M: Doctor's State
    submission.image_public_url || submission.image_gcs_path || "", // N: Doctor Photo Link
    voiceSamplesLinks,                                          // O: Doctor Voice Samples Links
    videoUrl,                                                   // P: Final video link
    videoGeneratedOn,                                           // Q: Video Generated on
    qcStatusText,                                               // R: Status
    video?.qc_notes || audio?.qc_notes || "",                   // S: Reason for rejection / re-upload
    "",                                                         // T: Hindi Pronunciation
    "",                                                         // U: Regenerated?
    "",                                                         // V: Comments
  ];
}

/**
 * Find the row number for an entry ID (submissionId-langCode)
 */
async function findEntryRow(entryId) {
  try {
    const client = await initSheetsClient();

    const response = await client.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:A`,
    });

    const rows = response.data.values || [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === entryId) {
        return i + 1; // 1-indexed row number
      }
    }
    return null;
  } catch (error) {
    logger.error(`[SHEETS] Error finding entry row ${entryId}:`, error);
    return null;
  }
}

/**
 * Add or update a submission in the sheet (creates multiple rows for multiple languages)
 */
async function syncSubmission(submission, options = {}) {
  try {
    await initializeSheet();
    const client = await initSheetsClient();

    // Parse selected languages
    let languages = [];
    try {
      languages = JSON.parse(submission.selected_languages || "[]");
    } catch (e) {
      languages = [];
    }

    if (languages.length === 0) {
      logger.warn(`[SHEETS] Submission ${submission.id} has no languages selected`);
      return false;
    }

    const { videos = [], audios = [] } = options;

    // Create/update one row per language
    for (const langCode of languages) {
      const entryId = `${submission.id}-${langCode}`;
      const video = videos.find((v) => v.language_code === langCode);
      const audio = audios.find((a) => a.language_code === langCode);
      const rowData = formatSubmissionLanguageRow(submission, langCode, { video, audio });

      const existingRow = await findEntryRow(entryId);

      if (existingRow) {
        // Update existing row
        await client.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_NAME}!A${existingRow}:V${existingRow}`,
          valueInputOption: "RAW",
          resource: {
            values: [rowData],
          },
        });
        logger.info(`[SHEETS] Updated entry ${entryId} in sheet (row ${existingRow})`);
      } else {
        // Append new row
        await client.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_NAME}!A:V`,
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          resource: {
            values: [rowData],
          },
        });
        logger.info(`[SHEETS] Added entry ${entryId} to sheet`);
      }
    }

    return true;
  } catch (error) {
    logger.error(`[SHEETS] Failed to sync submission ${submission.id}:`, error);
    return false;
  }
}

/**
 * Sync all submissions to the sheet (full refresh)
 */
async function syncAllSubmissions(getSubmissions, getVideos, getAudios) {
  try {
    await initializeSheet();
    const client = await initSheetsClient();

    const submissions = await getSubmissions();
    const rows = [getHeaders()];
    let totalEntries = 0;

    for (const submission of submissions) {
      let languages = [];
      try {
        languages = JSON.parse(submission.selected_languages || "[]");
      } catch (e) {
        languages = [];
      }

      if (languages.length === 0) continue;

      const videos = getVideos ? await getVideos(submission.id) : [];
      const audios = getAudios ? await getAudios(submission.id) : [];

      for (const langCode of languages) {
        const video = videos.find((v) => v.language_code === langCode);
        const audio = audios.find((a) => a.language_code === langCode);
        rows.push(formatSubmissionLanguageRow(submission, langCode, { video, audio }));
        totalEntries++;
      }
    }

    // Clear and update entire sheet
    await client.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:V`,
    });

    await client.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: "RAW",
      resource: {
        values: rows,
      },
    });

    // Re-format header row
    await client.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: 0,
                startRowIndex: 0,
                endRowIndex: 1,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.2, green: 0.4, blue: 0.6 },
                  textFormat: {
                    bold: true,
                    foregroundColor: { red: 1, green: 1, blue: 1 },
                  },
                },
              },
              fields: "userEnteredFormat(backgroundColor,textFormat)",
            },
          },
        ],
      },
    });

    logger.info(`[SHEETS] Synced ${totalEntries} entries (from ${submissions.length} submissions) to sheet`);
    return true;
  } catch (error) {
    logger.error("[SHEETS] Failed to sync all submissions:", error);
    return false;
  }
}

/**
 * Update video URL for a specific submission+language entry
 * Updates columns P (Final video link) and Q (Video Generated on)
 */
async function updateVideoUrl(submissionId, languageCode, videoUrl) {
  try {
    const client = await initSheetsClient();
    const entryId = `${submissionId}-${languageCode}`;
    const existingRow = await findEntryRow(entryId);

    if (!existingRow) {
      logger.warn(`[SHEETS] Entry ${entryId} not found for video update`);
      return false;
    }

    // Update columns P (Final video link) and Q (Video Generated on)
    await client.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!P${existingRow}:Q${existingRow}`,
      valueInputOption: "RAW",
      resource: {
        values: [[videoUrl, new Date().toISOString()]],
      },
    });

    logger.info(`[SHEETS] Updated video URL for entry ${entryId}`);
    return true;
  } catch (error) {
    logger.error(`[SHEETS] Failed to update video URL for ${submissionId}-${languageCode}:`, error);
    return false;
  }
}

/**
 * Update QC status for a specific submission+language entry
 * Updates columns R (Status), S (Reason), and optionally T (Hindi Pronunciation)
 * @param {number} submissionId
 * @param {string} languageCode
 * @param {object} qcData - { status: 'Approved'|'Rejected'|'Regenerate', reason, hindiPronunciation, comments }
 */
async function updateQCStatusForLanguage(submissionId, languageCode, qcData) {
  try {
    const client = await initSheetsClient();
    const entryId = `${submissionId}-${languageCode}`;
    const existingRow = await findEntryRow(entryId);

    if (!existingRow) {
      logger.warn(`[SHEETS] Entry ${entryId} not found for QC update`);
      return false;
    }

    // Update columns R (Status), S (Reason), T (Hindi Pronunciation), U (Regenerated?), V (Comments)
    await client.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!R${existingRow}:V${existingRow}`,
      valueInputOption: "RAW",
      resource: {
        values: [[
          qcData.status || "",
          qcData.reason || "",
          qcData.hindiPronunciation || "",
          qcData.regenerated || "",
          qcData.comments || "",
        ]],
      },
    });

    logger.info(`[SHEETS] Updated QC status for entry ${entryId} to ${qcData.status}`);
    return true;
  } catch (error) {
    logger.error(`[SHEETS] Failed to update QC for ${submissionId}-${languageCode}:`, error);
    return false;
  }
}

/**
 * Update QC status for all language entries of a submission
 * @param {number} submissionId
 * @param {object} qcData - {status, notes, reviewedBy}
 * @param {array} languages - Array of language codes to update (optional)
 */
async function updateQCStatus(submissionId, qcData, languages = null) {
  try {
    const client = await initSheetsClient();

    // If languages not provided, find all entries for this submission
    if (!languages) {
      const response = await client.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A:A`,
      });

      const rows = response.data.values || [];
      languages = [];
      for (const row of rows) {
        if (row[0]?.startsWith(`${submissionId}-`)) {
          const langCode = row[0].split("-").pop();
          languages.push(langCode);
        }
      }
    }

    // Map internal status to sheet status
    const sheetStatus = qcData.status === "approved" ? "Approved" : 
                        qcData.status === "rejected" ? "Rejected" : "";

    // Update each language entry
    for (const langCode of languages) {
      await updateQCStatusForLanguage(submissionId, langCode, {
        status: sheetStatus,
        reason: qcData.notes || "",
        comments: qcData.reviewedBy ? `Reviewed by: ${qcData.reviewedBy}` : "",
      });
    }

    return true;
  } catch (error) {
    logger.error(`[SHEETS] Failed to update QC status for submission ${submissionId}:`, error);
    return false;
  }
}

module.exports = {
  initSheetsClient,
  initializeSheet,
  syncSubmission,
  syncAllSubmissions,
  updateVideoUrl,
  updateQCStatus,
  updateQCStatusForLanguage,
  findEntryRow,
};
