const initSqlJs = require("sql.js");
const path = require("path");
const fs = require("fs");
const logger = require("../utils/logger");

const DB_PATH =
  process.env.DATABASE_PATH || path.join(__dirname, "../data/sun_pharma.db");

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db = null;
let SQL = null;
let dbWrapper = null;

// Save database to disk
function saveDatabase() {
  if (db) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    } catch (error) {
      logger.error("Error saving database:", error);
    }
  }
}

// Auto-save every 30 seconds
setInterval(() => {
  if (db) {
    saveDatabase();
  }
}, 30000);

// Save on process exit
process.on("exit", saveDatabase);
process.on("SIGINT", () => {
  saveDatabase();
  process.exit();
});
process.on("SIGTERM", () => {
  saveDatabase();
  process.exit();
});

// PreparedStatement class for better-sqlite3 API compatibility
class PreparedStatement {
  constructor(database, sql) {
    this.db = database;
    this.sql = sql;
  }

  run(...params) {
    const flatParams = params.flat();
    this.db.run(this.sql, flatParams);
    const lastId =
      this.db.exec("SELECT last_insert_rowid() as id")[0]?.values[0]?.[0] || 0;
    return { changes: this.db.getRowsModified(), lastInsertRowid: lastId };
  }

  get(...params) {
    const flatParams = params.flat();
    const result = this.db.exec(this.sql, flatParams);
    if (result.length === 0 || result[0].values.length === 0) return undefined;
    const columns = result[0].columns;
    const values = result[0].values[0];
    const row = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });
    return row;
  }

  all(...params) {
    const flatParams = params.flat();
    const result = this.db.exec(this.sql, flatParams);
    if (result.length === 0) return [];
    const columns = result[0].columns;
    return result[0].values.map((values) => {
      const row = {};
      columns.forEach((col, i) => {
        row[col] = values[i];
      });
      return row;
    });
  }
}

// DbWrapper class for better-sqlite3 API compatibility
class DbWrapper {
  constructor(database) {
    this.db = database;
  }

  prepare(sql) {
    return new PreparedStatement(this.db, sql);
  }

  exec(sql) {
    this.db.run(sql);
    saveDatabase();
  }

  pragma(pragma) {
    try {
      this.db.run(`PRAGMA ${pragma}`);
    } catch (e) {
      // sql.js may not support all pragmas
    }
  }

  transaction(fn) {
    return (...args) => {
      this.db.run("BEGIN TRANSACTION");
      try {
        const result = fn(...args);
        this.db.run("COMMIT");
        saveDatabase();
        return result;
      } catch (error) {
        this.db.run("ROLLBACK");
        throw error;
      }
    };
  }
}

// Get database wrapper (sync - requires init first)
function getDb() {
  if (!dbWrapper) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return dbWrapper;
}

async function initDatabase() {
  // Initialize sql.js
  if (!SQL) {
    SQL = await initSqlJs();
  }

  // Try to load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create wrapper
  dbWrapper = new DbWrapper(db);

  // Enable foreign keys
  try {
    db.run("PRAGMA foreign_keys = ON");
  } catch (e) {
    // sql.js may not support all pragmas
  }

  const database = dbWrapper;

  // Create tables
  database.exec(`
    -- Supported Languages Table
    CREATE TABLE IF NOT EXISTS languages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      native_name TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Audio Masters Table (master audio for each language - used for speech-to-speech)
    CREATE TABLE IF NOT EXISTS audio_masters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      language_code TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      file_path TEXT NOT NULL,
      gcs_path TEXT,
      duration_seconds REAL,
      elevenlabs_voice_id TEXT,
      is_active INTEGER DEFAULT 1,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (language_code) REFERENCES languages(code)
    );

    -- Doctors Table
    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      specialty TEXT NOT NULL,
      years_of_practice INTEGER,
      clinic_name TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Medical Representatives Table
    CREATE TABLE IF NOT EXISTS medical_reps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      mr_code TEXT UNIQUE NOT NULL,
      emp_code TEXT UNIQUE NOT NULL,
      phone TEXT,
      email TEXT,
      designation TEXT,
      hq TEXT,
      region TEXT,
      zone TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Doctor Submissions Table
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER,
      mr_id INTEGER,
      
      -- Doctor Information (stored directly for per-entry consent)
      doctor_name TEXT,
      doctor_email TEXT,
      doctor_phone TEXT,
      doctor_specialization TEXT,
      doctor_clinic_name TEXT,
      
      -- MR Information
      mr_name TEXT,
      mr_code TEXT,
      
      -- Campaign Information
      campaign_name TEXT,
      
      -- Media files
      image_path TEXT,
      image_gcs_path TEXT,
      audio_path TEXT,
      audio_gcs_path TEXT,
      audio_duration_seconds REAL,
      
      -- Language selection (JSON array of language codes)
      selected_languages TEXT NOT NULL DEFAULT '[]',
      
      -- Consent OTP
      consent_status TEXT DEFAULT 'pending',
      consent_otp TEXT,
      consent_otp_expires_at DATETIME,
      consent_verified_at DATETIME,
      consent_email_sent_at DATETIME,
      
      -- Consent Checkbox States
      consent_image_use INTEGER DEFAULT 0,
      consent_voice_use INTEGER DEFAULT 0,
      consent_voice_cloning INTEGER DEFAULT 0,
      consent_public_distribution INTEGER DEFAULT 0,
      consent_mr_confirmation INTEGER DEFAULT 0,
      
      -- Voice cloning
      elevenlabs_voice_id TEXT,
      voice_clone_status TEXT DEFAULT 'pending',
      voice_clone_error TEXT,
      
      -- Processing status
      status TEXT DEFAULT 'draft',
      
      -- QC
      qc_status TEXT DEFAULT 'pending',
      qc_notes TEXT,
      qc_reviewed_by TEXT,
      qc_reviewed_at DATETIME,
      
      -- Metadata
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (doctor_id) REFERENCES doctors(id),
      FOREIGN KEY (mr_id) REFERENCES medical_reps(id)
    );

    -- Generated Audio Table (speech-to-speech output per language)
    CREATE TABLE IF NOT EXISTS generated_audio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL,
      language_code TEXT NOT NULL,
      audio_master_id INTEGER,
      
      -- File info
      file_path TEXT,
      gcs_path TEXT,
      duration_seconds REAL,
      
      -- Generation status
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      
      -- ElevenLabs tracking
      elevenlabs_request_id TEXT,
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (submission_id) REFERENCES submissions(id),
      FOREIGN KEY (language_code) REFERENCES languages(code),
      FOREIGN KEY (audio_master_id) REFERENCES audio_masters(id)
    );

    -- Generated Videos Table
    CREATE TABLE IF NOT EXISTS generated_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL,
      language_code TEXT NOT NULL,
      generated_audio_id INTEGER,
      
      -- File info
      file_path TEXT,
      gcs_path TEXT,
      duration_seconds REAL,
      
      -- Generation status
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (submission_id) REFERENCES submissions(id),
      FOREIGN KEY (generated_audio_id) REFERENCES generated_audio(id)
    );

    -- QC Review History
    CREATE TABLE IF NOT EXISTS qc_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL,
      reviewer_name TEXT NOT NULL,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (submission_id) REFERENCES submissions(id)
    );

    -- Image Validation Results
    CREATE TABLE IF NOT EXISTS image_validations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL,
      is_valid INTEGER DEFAULT 0,
      
      -- Validation checks
      has_face INTEGER DEFAULT 0,
      is_front_facing INTEGER DEFAULT 0,
      has_good_lighting INTEGER DEFAULT 0,
      has_plain_background INTEGER DEFAULT 0,
      resolution_ok INTEGER DEFAULT 0,
      no_occlusion INTEGER DEFAULT 0,
      
      -- Details
      validation_details TEXT,
      validated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (submission_id) REFERENCES submissions(id)
    );

    -- Audio Validation Results
    CREATE TABLE IF NOT EXISTS audio_validations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL,
      is_valid INTEGER DEFAULT 0,
      
      -- Validation checks
      duration_ok INTEGER DEFAULT 0,
      format_ok INTEGER DEFAULT 0,
      quality_ok INTEGER DEFAULT 0,
      no_background_noise INTEGER DEFAULT 0,
      speech_clarity_ok INTEGER DEFAULT 0,
      
      -- Details
      actual_duration_seconds REAL,
      format_detected TEXT,
      sample_rate INTEGER,
      validation_details TEXT,
      validated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (submission_id) REFERENCES submissions(id)
    );

    -- Audit Log
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      actor TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes for better query performance
    CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
    CREATE INDEX IF NOT EXISTS idx_submissions_qc_status ON submissions(qc_status);
    CREATE INDEX IF NOT EXISTS idx_submissions_doctor_id ON submissions(doctor_id);
    CREATE INDEX IF NOT EXISTS idx_generated_audio_submission ON generated_audio(submission_id);
    CREATE INDEX IF NOT EXISTS idx_generated_videos_submission ON generated_videos(submission_id);
    CREATE INDEX IF NOT EXISTS idx_audio_masters_language ON audio_masters(language_code);
    CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
  `);

  // Migration: Add new consent columns if they don't exist (for existing databases)
  const migrationColumns = [
    { name: "doctor_name", type: "TEXT" },
    { name: "doctor_email", type: "TEXT" },
    { name: "doctor_phone", type: "TEXT" },
    { name: "doctor_specialization", type: "TEXT" },
    { name: "doctor_clinic_name", type: "TEXT" },
    { name: "mr_name", type: "TEXT" },
    { name: "mr_code", type: "TEXT" },
    { name: "campaign_name", type: "TEXT" },
    { name: "consent_image_use", type: "INTEGER DEFAULT 0" },
    { name: "consent_voice_use", type: "INTEGER DEFAULT 0" },
    { name: "consent_voice_cloning", type: "INTEGER DEFAULT 0" },
    { name: "consent_public_distribution", type: "INTEGER DEFAULT 0" },
    { name: "consent_mr_confirmation", type: "INTEGER DEFAULT 0" },
    // Mobile OTP fields
    { name: "consent_mobile_otp", type: "TEXT" },
    { name: "consent_mobile_otp_expires_at", type: "DATETIME" },
    { name: "consent_sms_sent_at", type: "DATETIME" },
    // Doctor address fields
    { name: "doctor_city", type: "TEXT" },
    { name: "doctor_state", type: "TEXT" },
    // GCS upload fields
    { name: "image_public_url", type: "TEXT" },
    { name: "submission_prefix", type: "TEXT" },
    { name: "upload_source", type: "TEXT DEFAULT 'local'" },
    // Final video fields
    { name: "final_video_gcs_path", type: "TEXT" },
    { name: "final_video_public_url", type: "TEXT" },
    { name: "final_video_uploaded_at", type: "DATETIME" },
    { name: "final_video_uploaded_by", type: "TEXT" },
  ];

  for (const col of migrationColumns) {
    try {
      db.run(`ALTER TABLE submissions ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // Column already exists, ignore
    }
  }

  // Migration: Add new columns to medical_reps table
  const mrMigrationColumns = [
    { name: "emp_code", type: "TEXT" },
    { name: "designation", type: "TEXT" },
    { name: "hq", type: "TEXT" },
    { name: "region", type: "TEXT" },
    { name: "zone", type: "TEXT" },
    { name: "mobile", type: "TEXT" },
  ];

  for (const col of mrMigrationColumns) {
    try {
      db.run(`ALTER TABLE medical_reps ADD COLUMN ${col.name} ${col.type}`);
    } catch (e) {
      // Column already exists, ignore
    }
  }

  // Update emp_code from mr_code if emp_code is null
  try {
    db.run(`UPDATE medical_reps SET emp_code = mr_code WHERE emp_code IS NULL`);
  } catch (e) {
    // Ignore errors
  }

  // Seed default languages
  const insertLanguage = database.prepare(`
    INSERT OR IGNORE INTO languages (code, name, native_name) VALUES (?, ?, ?)
  `);

  const defaultLanguages = [
    ["hi", "Hindi", "हिन्दी"],
    ["en", "English", "English"],
    ["mr", "Marathi", "मराठी"],
    ["gu", "Gujarati", "ગુજરાતી"],
    ["ta", "Tamil", "தமிழ்"],
    ["te", "Telugu", "తెలుగు"],
    ["kn", "Kannada", "ಕನ್ನಡ"],
    ["bn", "Bengali", "বাংলা"],
    ["ml", "Malayalam", "മലയാളം"],
    ["pa", "Punjabi", "ਪੰਜਾਬੀ"],
  ];

  const insertMany = database.transaction((languages) => {
    for (const [code, name, nativeName] of languages) {
      insertLanguage.run(code, name, nativeName);
    }
  });

  insertMany(defaultLanguages);

  // Save the initial database
  saveDatabase();

  logger.info("Database initialized with default languages");
  return database;
}

// Helper function for async operations
function asyncQuery(fn) {
  return new Promise((resolve, reject) => {
    try {
      const result = fn(getDb());
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  getDb,
  initDatabase,
  asyncQuery,
  saveDatabase,
};
