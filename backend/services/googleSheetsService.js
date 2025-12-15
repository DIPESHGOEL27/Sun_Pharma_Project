/**
 * Google Sheets Integration Service
 * Syncs submission data to Sustencap QC Google Sheet for internal QC purposes
 * Creates one row per language selection (e.g., 2 languages = 2 rows)
 */

const { google } = require("googleapis");
const path = require("path");
const logger = require("../utils/logger");

// Google Sheet Configuration
const SHEET_ID = "1Tpjl1Qebk6H8JhkgUG4mdiQtJQfzlqKtRQUkDEllPgA";
const SHEET_NAME = "Sheet1"; // Default Google Sheet tab name

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
    // Use dedicated service account key for Google Sheets
    const keyFilePath = path.join(__dirname, "../sheets-sa-key.json");

    auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    sheets = google.sheets({ version: "v4", auth });
    logger.info("Google Sheets client initialized successfully");
    return sheets;
  } catch (error) {
    logger.error("Failed to initialize Google Sheets client:", error);
    throw error;
  }
}

/**
 * Get the header row for the sheet
 * Each row represents one submission + language combination
 */
function getHeaders() {
  return [
    "Entry ID", // Unique: submissionId-langCode (e.g., "42-hi")
    "Submission ID",
    "Language",
    "Language Code",
    "Created At",
    "Doctor Name",
    "Doctor Email",
    "Doctor Phone",
    "Specialty",
    "Clinic Name",
    "City",
    "State",
    "MR Name",
    "MR Code",
    "Consent Status",
    "Consent Verified At",
    "QC Status",
    "QC Notes",
    "QC Reviewed By",
    "QC Reviewed At",
    "Voice Clone Status",
    "Processing Status",
    "Image URL",
    "Audio URL",
    "Generated Video URL",
    "Updated At",
  ];
}

/**
 * Initialize the sheet with headers if not already set
 */
async function initializeSheet() {
  try {
    const client = await initSheetsClient();

    // Check if headers exist
    logger.info(`[SHEETS] Checking sheet ${SHEET_ID} for headers...`);
    const response = await client.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1:Z1`,
    });
    logger.info(`[SHEETS] Got response from sheet`);

    const existingHeaders = response.data.values?.[0];
    const requiredHeaders = getHeaders();

    // Check if we need to update headers (new format check)
    const needsUpdate =
      !existingHeaders ||
      existingHeaders.length === 0 ||
      existingHeaders[0] !== "Entry ID";

    if (needsUpdate) {
      // Clear existing data and set new headers
      await client.spreadsheets.values.clear({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A:Z`,
      });

      // Add headers
      await client.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: "RAW",
        resource: {
          values: [requiredHeaders],
        },
      });
      logger.info(
        "Sheet headers initialized with new format (one row per language)"
      );

      // Format header row (bold, freeze)
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
    logger.error("Failed to initialize sheet:", error);
    return false;
  }
}

/**
 * Format submission data for a single language row
 * @param {object} submission - Submission data from database
 * @param {string} languageCode - Language code (e.g., 'hi', 'en')
 * @param {object} options - Additional data (video for this language)
 */
function formatSubmissionLanguageRow(submission, languageCode, options = {}) {
  const { video = null } = options;

  const entryId = `${submission.id}-${languageCode}`;
  const languageName = LANGUAGE_NAMES[languageCode] || languageCode;

  return [
    entryId,
    submission.id?.toString() || "",
    languageName,
    languageCode,
    submission.created_at || "",
    submission.doctor_name || "",
    submission.doctor_email || "",
    submission.doctor_phone || "",
    submission.doctor_specialization || "",
    submission.doctor_clinic_name || "",
    submission.doctor_city || "",
    submission.doctor_state || "",
    submission.mr_name || "",
    submission.mr_code || "",
    submission.consent_status || "pending",
    submission.consent_verified_at || "",
    submission.qc_status || "pending",
    submission.qc_notes || "",
    submission.qc_reviewed_by || "",
    submission.qc_reviewed_at || "",
    submission.voice_clone_status || "pending",
    submission.status || "draft",
    submission.image_gcs_path || submission.image_path || "",
    submission.audio_gcs_path || submission.audio_path || "",
    video?.gcs_path || video?.file_path || "",
    new Date().toISOString(),
  ];
}

/**
 * Find the row number for an entry ID (submissionId-langCode)
 * @param {string} entryId - e.g., "42-hi"
 * @returns {Promise<number|null>} Row number (1-indexed) or null if not found
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
    logger.error(`Error finding entry row ${entryId}:`, error);
    return null;
  }
}

/**
 * Add or update a submission in the sheet (creates multiple rows for multiple languages)
 * @param {object} submission - Submission data
 * @param {object} options - Additional options (videos array, etc.)
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
      logger.warn(`Submission ${submission.id} has no languages selected`);
      return false;
    }

    const { videos = [] } = options;

    // Create/update one row per language
    for (const langCode of languages) {
      const entryId = `${submission.id}-${langCode}`;
      const video = videos.find((v) => v.language_code === langCode);
      const rowData = formatSubmissionLanguageRow(submission, langCode, {
        video,
      });

      const existingRow = await findEntryRow(entryId);

      if (existingRow) {
        // Update existing row
        await client.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_NAME}!A${existingRow}`,
          valueInputOption: "RAW",
          resource: {
            values: [rowData],
          },
        });
        logger.info(`Updated entry ${entryId} in sheet (row ${existingRow})`);
      } else {
        // Append new row
        await client.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_NAME}!A:Z`,
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          resource: {
            values: [rowData],
          },
        });
        logger.info(`Added entry ${entryId} to sheet`);
      }
    }

    return true;
  } catch (error) {
    logger.error(`Failed to sync submission ${submission.id} to sheet:`, error);
    return false;
  }
}

/**
 * Sync all submissions to the sheet (full refresh)
 * Creates one row per submission+language combination
 * @param {function} getSubmissions - Function to get all submissions from DB
 * @param {function} getVideos - Function to get videos for a submission
 */
async function syncAllSubmissions(getSubmissions, getVideos) {
  try {
    await initializeSheet();
    const client = await initSheetsClient();

    const submissions = await getSubmissions();
    const rows = [getHeaders()];
    let totalEntries = 0;

    for (const submission of submissions) {
      // Parse selected languages
      let languages = [];
      try {
        languages = JSON.parse(submission.selected_languages || "[]");
      } catch (e) {
        languages = [];
      }

      if (languages.length === 0) continue;

      const videos = getVideos ? await getVideos(submission.id) : [];

      // Create one row per language
      for (const langCode of languages) {
        const video = videos.find((v) => v.language_code === langCode);
        rows.push(formatSubmissionLanguageRow(submission, langCode, { video }));
        totalEntries++;
      }
    }

    // Clear and update entire sheet
    await client.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:Z`,
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

    logger.info(
      `Synced ${totalEntries} entries (from ${submissions.length} submissions) to sheet`
    );
    return true;
  } catch (error) {
    logger.error("Failed to sync all submissions:", error);
    return false;
  }
}

/**
 * Update video URL for a specific submission+language entry
 * @param {number} submissionId
 * @param {string} languageCode
 * @param {string} videoUrl
 */
async function updateVideoUrl(submissionId, languageCode, videoUrl) {
  try {
    const client = await initSheetsClient();
    const entryId = `${submissionId}-${languageCode}`;
    const existingRow = await findEntryRow(entryId);

    if (!existingRow) {
      logger.warn(`Entry ${entryId} not found in sheet for video update`);
      return false;
    }

    // Update the Generated Video URL column (Y) and Updated At column (Z)
    await client.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!Y${existingRow}:Z${existingRow}`,
      valueInputOption: "RAW",
      resource: {
        values: [[videoUrl, new Date().toISOString()]],
      },
    });

    logger.info(`Updated video URL for entry ${entryId}`);
    return true;
  } catch (error) {
    logger.error(
      `Failed to update video URL for ${submissionId}-${languageCode}:`,
      error
    );
    return false;
  }
}

/**
 * Update QC status for all language entries of a submission
 * @param {number} submissionId
 * @param {object} qcData - {status, notes, reviewedBy}
 * @param {array} languages - Array of language codes to update
 */
async function updateQCStatus(submissionId, qcData, languages = null) {
  try {
    const client = await initSheetsClient();

    // If languages not provided, we need to find all entries for this submission
    if (!languages) {
      const response = await client.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A:B`,
      });

      const rows = response.data.values || [];
      languages = [];
      for (const row of rows) {
        if (row[1] === submissionId.toString()) {
          // Extract language code from entry ID (e.g., "42-hi" -> "hi")
          const entryId = row[0];
          const langCode = entryId.split("-").pop();
          languages.push(langCode);
        }
      }
    }

    // Update each language entry
    for (const langCode of languages) {
      const entryId = `${submissionId}-${langCode}`;
      const existingRow = await findEntryRow(entryId);

      if (!existingRow) {
        logger.warn(`Entry ${entryId} not found in sheet for QC update`);
        continue;
      }

      // Update QC columns (Q, R, S, T) - QC Status, Notes, Reviewed By, Reviewed At
      // And Updated At column (Z)
      await client.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!Q${existingRow}:T${existingRow}`,
        valueInputOption: "RAW",
        resource: {
          values: [
            [
              qcData.status || "",
              qcData.notes || "",
              qcData.reviewedBy || "",
              new Date().toISOString(),
            ],
          ],
        },
      });

      // Update "Updated At" column (Z)
      await client.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!Z${existingRow}`,
        valueInputOption: "RAW",
        resource: {
          values: [[new Date().toISOString()]],
        },
      });

      logger.info(`Updated QC status for entry ${entryId}`);
    }

    return true;
  } catch (error) {
    logger.error(
      `Failed to update QC status for submission ${submissionId}:`,
      error
    );
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
  findEntryRow,
};
