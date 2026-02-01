# Sun Pharma Video Platform - AI Agent Instructions

## Architecture Overview

Doctor video generation platform for Sun Pharma's Sustencap VoiceReach campaign. MRs submit doctor data; platform clones voices via ElevenLabs and generates multilingual promotional videos.

```
Frontend (React/Vite)  →  Backend (Express)  →  SQLite (sql.js)
                              ↓
          ┌─────────────────────────────────────┐
          │   External Services                 │
          │   • ElevenLabs (voice cloning)      │
          │   • GCS (file storage)              │
          │   • Google Sheets (QC reporting)    │
          │   • SMTP (email consent)            │
          └─────────────────────────────────────┘
```

## Quick Deployment (Most Common Task)

```bash
# Commit and push, then deploy to VM
cd sun-pharma-video-platform
git add -A && git commit -m "Your message" && git push

gcloud compute ssh sunpharma-video-platform --zone=asia-south1-a --tunnel-through-iap --command="cd /opt/sunpharma && sudo git pull && sudo docker compose up -d --build"
```

## Production Environment

| Property        | Value                             |
| --------------- | --------------------------------- |
| **VM Name**     | `sunpharma-video-platform`        |
| **Zone**        | `asia-south1-a`                   |
| **Domain**      | https://sustencap.gonuts.ai       |
| **GitHub**      | `DIPESHGOEL27/Sun_Pharma_Project` |

---

## Critical Technical Patterns

### 1. Database: sql.js (synchronous API)

```javascript
const db = getDb();
const result = db.prepare("SELECT * FROM submissions WHERE id = ?").get(id);
const rows = db.prepare("SELECT * FROM submissions").all();
db.prepare("INSERT INTO...").run(values);
```

**Common column mistakes:**
- `audio_masters` uses `name` (not `title`)
- Use `gcs_path` fields (not `url` fields)
- `consent_status` is string `'pending'`/`'verified'`, not boolean

### 2. GCS Signed URLs (CRITICAL)

Buckets use **uniform bucket-level access** - files NOT publicly readable. Always use signed URLs:

```javascript
// Frontend download pattern
import { storageApi } from "../services/api";

const handleDownload = async (gcsPath, fileName) => {
  const response = await storageApi.getSignedDownloadUrl(gcsPath);
  window.open(response.data.downloadUrl, "_blank");
};
```

**Never use direct GCS URLs** - they return 403 Access Denied.

### 3. ElevenLabs Model Selection

| Use Case             | Model ID                     |
| -------------------- | ---------------------------- |
| **Speech-to-Speech** | `eleven_multilingual_sts_v2` |
| **Text-to-Speech**   | `eleven_multilingual_v2`     |

Wrong model causes: `"model_can_not_do_voice_conversion"` error.

### 4. Supported Languages (10 total)

```javascript
// backend/utils/constants.js - keep in sync across files
const LANGUAGE_CODES = ['en', 'hi', 'mr', 'gu', 'ta', 'te', 'kn', 'ml', 'pa', 'or'];
// Note: Bengali removed; Odia added
```

Sync language lists in:
- `backend/utils/constants.js`
- `frontend/src/pages/DoctorSubmission.jsx`
- `frontend/src/pages/SubmissionDetails.jsx`
- `frontend/src/pages/AdminDashboard.jsx`

### 5. Frontend Patterns

```jsx
// Toast notifications
import toast from "react-hot-toast";
toast.loading("Processing...", { id: "unique-id" });
toast.dismiss("unique-id");

// API calls - always through services/api.js
import { submissionsApi, voiceApi, storageApi } from "../services/api";
```

---

## Admin Roles

- **Admin** (`/admin`): Full access, QC approval/rejection
- **Editor**: Video upload per-language (in language cards)
- **Viewer**: Read-only

## Voice Processing Pipeline

```
POST /api/voice/process/:submissionId
1. Clone voice → elevenlabs_voice_id stored
2. For each language: Speech-to-speech with master audio → GCS
3. Cleanup: Delete voice from ElevenLabs
```

Tables: `submissions`, `generated_audio`, `generated_videos`, `audio_masters`

---

## Troubleshooting

```bash
# View logs
gcloud compute ssh sunpharma-video-platform --zone=asia-south1-a --tunnel-through-iap --command="sudo docker logs sunpharma-backend --tail=100"

# Health check
curl -s https://sustencap.gonuts.ai/api/health
```

## File Organization

```
backend/
├── routes/           # submissions.js, voice.js, admin.js, storage.js
├── services/         # elevenlabs.js, gcsService.js
├── db/database.js    # sql.js wrapper
└── utils/constants.js

frontend/src/
├── pages/            # AdminDashboard, SubmissionDetails, DoctorSubmission
├── services/api.js   # Axios API client
└── components/       # Layout.jsx, ui.jsx
```
