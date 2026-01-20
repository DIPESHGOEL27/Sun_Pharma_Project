# Sun Pharma Video Platform - AI Agent Instructions

## Architecture Overview

This is a **doctor video generation platform** for Sun Pharma's Sustencap VoiceReach campaign. Medical Representatives (MRs) submit doctor data; the platform clones doctor voices via ElevenLabs and generates multilingual promotional videos.

```
Frontend (React/Vite)  →  Backend (Express)  →  SQLite (sql.js)
                              ↓
          ┌─────────────────────────────────────┐
          │   External Services                 │
          │   • ElevenLabs (voice cloning)      │
          │   • GCS (file storage)              │
          │   • Google Sheets (QC reporting)    │
          │   • AWS SES/SMTP (email consent)    │
          └─────────────────────────────────────┘
```

---

## Production Environment Details

### GCP VM Configuration

| Property         | Value                       |
| ---------------- | --------------------------- |
| **VM Name**      | `sunpharma-video-platform`  |
| **External IP**  | `34.14.133.242`             |
| **Zone**         | `asia-south1-a`             |
| **GCP Project**  | `sage-shard-448708-v9`      |
| **Domain**       | https://sustencap.gonuts.ai |
| **Machine Type** | `e2-standard-2`             |
| **OS**           | Ubuntu 22.04 LTS            |

### VM Directory Structure

```
/opt/sunpharma/                    # Main application directory
├── docker-compose.yml             # Container orchestration
├── .env                           # Environment variables (secrets)
├── backend/                       # Backend source code
│   ├── routes/
│   ├── services/
│   ├── db/
│   └── server.js
├── frontend/                      # Frontend source code
│   ├── src/
│   └── dist/                      # Built static files
├── data/                          # Persistent data (mounted volume)
│   ├── uploads/
│   │   ├── image/                 # Doctor photos
│   │   ├── audio/                 # Doctor audio samples
│   │   ├── video/                 # Generated videos
│   │   └── audio-masters/         # Language master audio files
│   └── db/
│       └── sun_pharma.db          # SQLite database file
├── credentials/                   # Service account keys (read-only mount)
│   └── gcp-key.json
└── logs/                          # Application logs
```

### Docker Containers

| Container            | Port    | Description               |
| -------------------- | ------- | ------------------------- |
| `sunpharma-backend`  | 3001    | Express.js API server     |
| `sunpharma-frontend` | 5173→80 | Nginx serving React build |

### Nginx Reverse Proxy (on VM host)

- Location: `/etc/nginx/sites-enabled/sustencap.gonuts.ai`
- Routes `/` → frontend container (:5173)
- Routes `/api/*` → backend container (:3001)
- SSL via Let's Encrypt certbot

---

## Deployment & Update Procedures

### SSH into VM

```bash
gcloud compute ssh sunpharma-video-platform --zone=asia-south1-a --project=sage-shard-448708-v9
```

### Copy Files to VM

```bash
# Single file
gcloud compute scp <local-file> sunpharma-video-platform:/tmp/<file> --zone=asia-south1-a --project=sage-shard-448708-v9

# Directory (recursive)
gcloud compute scp --recurse <local-dir> sunpharma-video-platform:/tmp/<dir> --zone=asia-south1-a --project=sage-shard-448708-v9
```

### Update Backend Code

```bash
# 1. Copy changed file(s) to VM
gcloud compute scp backend/routes/admin.js sunpharma-video-platform:/tmp/admin.js --zone=asia-south1-a --project=sage-shard-448708-v9

# 2. SSH and deploy
gcloud compute ssh sunpharma-video-platform --zone=asia-south1-a --project=sage-shard-448708-v9 --command="
  sudo cp /tmp/admin.js /opt/sunpharma/backend/routes/admin.js
  cd /opt/sunpharma
  sudo docker compose build --no-cache backend
  sudo docker compose up -d backend
"
```

### Update Frontend Code

```bash
# 1. Build locally
cd frontend && npm run build

# 2. Copy dist folder to VM
gcloud compute scp --recurse frontend/dist sunpharma-video-platform:/tmp/frontend-dist --zone=asia-south1-a --project=sage-shard-448708-v9

# 3. SSH and deploy
gcloud compute ssh sunpharma-video-platform --zone=asia-south1-a --project=sage-shard-448708-v9 --command="
  sudo rm -rf /opt/sunpharma/frontend/dist
  sudo cp -r /tmp/frontend-dist /opt/sunpharma/frontend/dist
  cd /opt/sunpharma
  sudo docker compose build --no-cache frontend
  sudo docker compose up -d frontend
"
```

### Full Rebuild (Both Containers)

```bash
gcloud compute ssh sunpharma-video-platform --zone=asia-south1-a --project=sage-shard-448708-v9 --command="
  cd /opt/sunpharma
  sudo docker compose build --no-cache
  sudo docker compose up -d
"
```

### View Logs

```bash
# Backend logs
gcloud compute ssh sunpharma-video-platform --zone=asia-south1-a --project=sage-shard-448708-v9 --command="sudo docker logs sunpharma-backend --tail=50"

# Frontend logs
gcloud compute ssh sunpharma-video-platform --zone=asia-south1-a --project=sage-shard-448708-v9 --command="sudo docker logs sunpharma-frontend --tail=50"

# Follow logs in real-time
gcloud compute ssh sunpharma-video-platform --zone=asia-south1-a --project=sage-shard-448708-v9 --command="sudo docker logs -f sunpharma-backend"
```

### Test API Endpoints

```bash
# From VM
gcloud compute ssh sunpharma-video-platform --zone=asia-south1-a --project=sage-shard-448708-v9 --command="curl -s http://localhost:3001/api/health"

# From local machine via domain
curl -s https://sustencap.gonuts.ai/api/health
```

---

## Local Development

```bash
# Backend (starts on :3001)
cd backend
npm install
npm run dev

# Frontend (starts on :5173)
cd frontend
npm install
npm run dev
```

---

## Key Technical Patterns

### Database: sql.js with better-sqlite3 API wrapper

- Uses `sql.js` (WebAssembly SQLite) with a custom wrapper in `backend/db/database.js`
- **Critical**: Always use `db.prepare(sql).get()/.all()/.run()` pattern
- Auto-saves to disk every 30s and on process exit
- Database file: `/opt/sunpharma/data/db/sun_pharma.db`
- Key tables: `submissions`, `doctors`, `medical_reps`, `generated_videos`, `generated_audio`

```javascript
// Correct pattern
const db = getDb();
const result = db.prepare("SELECT * FROM submissions WHERE id = ?").get(id);
```

### Column naming conventions (database)

| Wrong Name                   | Correct Name     | Notes                               |
| ---------------------------- | ---------------- | ----------------------------------- |
| `doctor_photo_url`           | `image_path`     | Local path to uploaded photo        |
| `video_url`                  | `gcs_path`       | GCS path for generated video        |
| `consent_verified` (boolean) | `consent_status` | Values: `'pending'` or `'verified'` |

### Frontend API layer

All API calls go through `frontend/src/services/api.js`:

- `submissionsApi`, `voiceApi`, `audioMastersApi`, `consentApi`, `qcApi`, `adminApi`
- Uses axios with interceptors for auth tokens

### Route structure

```
/                           → DoctorSubmission (MR-facing form)
/consent/:submissionId      → Doctor consent verification
/admin/*                    → Internal dashboards (with Layout wrapper)
```

---

## External Service Integration

### Google Cloud Storage

| Bucket                        | Purpose                      |
| ----------------------------- | ---------------------------- |
| `sunpharma-video-uploads-*`   | Doctor photos, audio samples |
| `sunpharma-audio-masters-*`   | Language master audio files  |
| `sunpharma-generated-audio-*` | Speech-to-speech output      |
| `sunpharma-generated-video-*` | Final generated videos       |

- Service: `backend/services/gcsService.js`
- Auth: Service account key at `/opt/sunpharma/credentials/gcp-key.json`

#### Uniform Bucket-Level Access

All GCS buckets use **uniform bucket-level access** (no per-object ACLs). This means:

- `file.makePublic()` will fail - this is expected and handled gracefully
- Public URLs work if bucket IAM grants `allUsers` the `Storage Object Viewer` role
- The code logs a warning but continues successfully:

```javascript
// gcsService.js handles this gracefully
if (makePublic) {
  try {
    await file.makePublic();
  } catch (aclError) {
    logger.warn(`[GCS] Could not set individual ACL (uniform bucket access?)`);
  }
}
```

**Do not** try to fix "uniform bucket-level access" errors by changing code - configure bucket IAM instead.

### Google Sheets (QC Sync)

- Sheet ID: `1Tpjl1Qebk6H8JhkgUG4mdiQtJQfzlqKtRQUkDEllPgA`
- One row per submission-language pair (e.g., submission 42 with 3 languages = 3 rows)
- Service: `backend/services/googleSheetsService.js`
- Sync endpoint: `POST /api/admin/sync-sheets`

### ElevenLabs Voice Cloning

- Service: `backend/services/elevenlabs.js`
- Workflow: Upload doctor audio → Clone voice → Generate speech-to-speech per language
- Voice IDs stored in `submissions.elevenlabs_voice_id`

#### Model Selection (CRITICAL)

| Use Case             | Model ID                     | Notes                                       |
| -------------------- | ---------------------------- | ------------------------------------------- |
| **Speech-to-Speech** | `eleven_multilingual_sts_v2` | Voice conversion/cloning output             |
| **Text-to-Speech**   | `eleven_multilingual_v2`     | TTS only, does NOT support voice conversion |

**Important**: The `elevenLabsModel` in `constants.js` is for TTS. For speech-to-speech, always use `elevenLabsStsModel` which defaults to `eleven_multilingual_sts_v2`. Using the wrong model will cause "model_can_not_do_voice_conversion" errors.

```javascript
// Correct STS usage in elevenlabs.js
const stsModel = langConfig.elevenLabsStsModel || "eleven_multilingual_sts_v2";
form.append("model_id", stsModel);
```

---

## Admin Dashboard

### Authentication

- **Username**: `ADMIN`
- **Password**: `ADMIN@Sun_Pharma`
- Hardcoded in `backend/routes/admin.js` (`POST /api/admin/login`)
- Session stored in browser `sessionStorage`

### Three Tabs

1. **Overall Data** - All submissions with filters
2. **MR Grouped** - Submissions grouped by Medical Representative with search
3. **Metrics** - Charts showing videos uploaded, delivered, status breakdown

### Date Filtering

All admin endpoints support `?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`

---

## MR Data Import

Medical Representatives are imported via CSV:

```bash
cd backend
node scripts/import-mr-csv.js path/to/mr-data.csv
```

CSV columns: `name`, `mr_code`, `emp_code`, `phone`, `email`, `designation`, `hq`, `region`, `zone`

---

## Supported Languages

10 Indian languages defined in `backend/utils/constants.js`:

| Code | Language  |
| ---- | --------- |
| `en` | English   |
| `hi` | Hindi     |
| `mr` | Marathi   |
| `gu` | Gujarati  |
| `ta` | Tamil     |
| `te` | Telugu    |
| `kn` | Kannada   |
| `ml` | Malayalam |
| `bn` | Bengali   |
| `pa` | Punjabi   |

Each language config includes:

- `elevenLabsModel`: `eleven_multilingual_v2` (for TTS)
- `elevenLabsStsModel`: `eleven_multilingual_sts_v2` (for speech-to-speech)
- `voiceSettings`: stability, similarity_boost, style, use_speaker_boost

---

## Audio Validation Limits

Defined in `backend/utils/constants.js`:

| Constant                     | Value | Purpose                        |
| ---------------------------- | ----- | ------------------------------ |
| `AUDIO_MIN_DURATION_SECONDS` | 60    | Minimum audio sample duration  |
| `AUDIO_MAX_FILES`            | 5     | Max audio files per submission |
| `AUDIO_MIN_SAMPLE_RATE`      | 44100 | Minimum sample rate (Hz)       |
| `MAX_CONSENT_ATTEMPTS`       | 3     | Max OTP verification attempts  |

---

## Voice Processing Pipeline

Endpoint: `POST /api/voice/process/:submissionId`

```
1. Fetch submission + audio samples from DB
2. Clone voice via ElevenLabs API
   → Returns voice_id (e.g., "4cle1YIenQcR6mFOJ6pa")
3. For each language with master audio:
   a. Run speech-to-speech with eleven_multilingual_sts_v2
   b. Save MP3 locally to /app/uploads/generated_audio/{id}/
   c. Upload to GCS bucket
   d. Store paths in generated_audio table
4. Delete cloned voice from ElevenLabs (cleanup)
5. Return results with public URLs
```

**Key files:**

- `backend/routes/voice.js` - Processing endpoint
- `backend/services/elevenlabs.js` - ElevenLabs API wrapper
- `backend/services/gcsService.js` - GCS upload/download

---

## Troubleshooting

### Container not starting

```bash
# Check container status
sudo docker compose ps

# View detailed logs
sudo docker logs sunpharma-backend 2>&1 | tail -100
```

### Database errors

- Check column names match schema in `backend/db/database.js`
- Database auto-saves every 30s; check logs for save errors

### API returning 500 errors

```bash
# Check backend logs for stack trace
sudo docker logs sunpharma-backend --tail=50
```

### Nginx/SSL issues

```bash
# Check nginx status on VM
sudo systemctl status nginx
sudo nginx -t

# Renew SSL certificate
sudo certbot renew
```
