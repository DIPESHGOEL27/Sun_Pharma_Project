# Sun Pharma Image to Video Platform

A comprehensive platform for collecting doctor data, cloning their voices using ElevenLabs, generating multilingual audio content, and managing QC workflows.

## 🏗️ Architecture

```
sun-pharma-video-platform/
├── backend/                  # Express.js API server
│   ├── db/                   # SQLite database
│   ├── routes/               # API routes
│   ├── services/             # External services (ElevenLabs)
│   ├── utils/                # Utilities (validators, logger)
│   └── server.js             # Main server entry
├── frontend/                 # React + Vite application
│   ├── src/
│   │   ├── components/       # Reusable components
│   │   ├── pages/            # Page components
│   │   └── services/         # API service layer
│   └── index.html
└── uploads/                  # File storage (images, audio, video)
```

## ✨ Features

### 1. Doctor Submission Dashboard

- Medical Representative (MR) lookup
- Doctor information collection
- Photo upload with validation (JPG/PNG, min 512x512)
- Audio sample recording/upload (2-5 minutes, high quality)
- Multi-language selection (10 Indian languages)
- Email consent verification with OTP

### 2. Audio Masters Management

- Language-specific audio masters
- Upload and organize master audio files
- Audio playback and management

### 3. Voice Cloning (ElevenLabs Integration)

- Clone doctor's voice from audio sample
- Speech-to-speech generation
- Multi-language audio generation
- Voice cleanup after video generation

### 4. Quality Control (QC) Dashboard

- Review pending submissions
- Approve/Reject with detailed reasons
- QC history and audit trail
- Stats and performance metrics

### 5. Admin Dashboard

- Submission statistics
- Medical representative management
- Language configuration
- System overview

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or pnpm
- FFmpeg (for audio validation)
- ElevenLabs API key

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment file and configure
cp .env.example .env
# Edit .env with your ElevenLabs API key and SMTP settings

# Start development server
npm run dev
```

The backend will run on `http://localhost:3001`

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

The frontend will run on `http://localhost:5173`

## 📚 API Endpoints

### Submissions

| Method | Endpoint                          | Description                      |
| ------ | --------------------------------- | -------------------------------- |
| GET    | `/api/submissions`                | List all submissions (paginated) |
| GET    | `/api/submissions/:id`            | Get submission details           |
| POST   | `/api/submissions`                | Create new submission            |
| PUT    | `/api/submissions/:id`            | Update submission                |
| DELETE | `/api/submissions/:id`            | Delete submission                |
| POST   | `/api/submissions/validate-image` | Validate image file              |
| POST   | `/api/submissions/validate-audio` | Validate audio file              |

### Voice (ElevenLabs)

| Method | Endpoint                                | Description                  |
| ------ | --------------------------------------- | ---------------------------- |
| POST   | `/api/voice/clone/:submissionId`        | Clone voice from submission  |
| POST   | `/api/voice/speech-to-speech`           | Generate speech from voice   |
| POST   | `/api/voice/:submissionId/generate-all` | Generate all language audio  |
| DELETE | `/api/voice/:submissionId`              | Delete voice from ElevenLabs |

### Audio Masters

| Method | Endpoint                         | Description                     |
| ------ | -------------------------------- | ------------------------------- |
| GET    | `/api/audio-masters`             | List all audio masters          |
| GET    | `/api/audio-masters/by-language` | Get masters grouped by language |
| POST   | `/api/audio-masters`             | Upload new audio master         |
| DELETE | `/api/audio-masters/:id`         | Delete audio master             |

### Consent

| Method | Endpoint              | Description       |
| ------ | --------------------- | ----------------- |
| POST   | `/api/consent/send`   | Send OTP to email |
| POST   | `/api/consent/verify` | Verify OTP        |

### QC

| Method | Endpoint                   | Description                |
| ------ | -------------------------- | -------------------------- |
| GET    | `/api/qc/pending`          | Get pending submissions    |
| GET    | `/api/qc/stats`            | Get QC statistics          |
| POST   | `/api/qc/:id/start-review` | Start reviewing submission |
| POST   | `/api/qc/:id/approve`      | Approve submission         |
| POST   | `/api/qc/:id/reject`       | Reject submission          |
| GET    | `/api/qc/history`          | Get QC history             |

### Admin

| Method | Endpoint                  | Description                  |
| ------ | ------------------------- | ---------------------------- |
| GET    | `/api/admin/dashboard`    | Dashboard statistics         |
| GET    | `/api/admin/medical-reps` | List medical representatives |
| POST   | `/api/admin/medical-reps` | Add medical representative   |
| GET    | `/api/admin/languages`    | List languages               |

## 🌐 Supported Languages

| Code | Language  | Native  |
| ---- | --------- | ------- |
| hi   | Hindi     | हिंदी   |
| en   | English   | English |
| mr   | Marathi   | मराठी   |
| gu   | Gujarati  | ગુજરાતી |
| ta   | Tamil     | தமிழ்   |
| te   | Telugu    | తెలుగు  |
| kn   | Kannada   | ಕನ್ನಡ   |
| bn   | Bengali   | বাংলা   |
| ml   | Malayalam | മലയാളം  |
| pa   | Punjabi   | ਪੰਜਾਬੀ  |

## 🔧 Configuration

### Environment Variables

```env
# Server
NODE_ENV=development
PORT=3001

# ElevenLabs
ELEVENLABS_API_KEY=your_api_key

# Email (for OTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Storage
UPLOAD_DIR=./uploads
```

### File Validation Rules

**Images:**

- Formats: JPEG, PNG
- Minimum resolution: 512 × 512 pixels
- Maximum size: 10MB

**Audio:**

- Formats: MP3, WAV, M4A, WEBM
- Duration: 2-5 minutes (recommended)
- Sample rate: 16kHz+ (recommended)
- Maximum size: 50MB

## 🛠️ Development

### Running Tests

```bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test
```

### Building for Production

```bash
# Build frontend
cd frontend && npm run build

# Backend is ready to deploy as-is
```

## 📊 Database Schema

The SQLite database includes the following tables:

- `languages` - Supported languages
- `audio_masters` - Language audio master files
- `doctors` - Doctor information
- `medical_reps` - Medical representative info
- `submissions` - Main submission records
- `generated_audio` - AI-generated audio files
- `generated_videos` - Generated video files
- `qc_history` - QC review history
- `image_validations` - Image validation results
- `audio_validations` - Audio validation results
- `audit_log` - System audit log

## 🔐 Security Considerations

- OTP-based email verification for consent
- File type validation
- Input sanitization
- CORS configuration
- Rate limiting (recommended for production)

## 📝 License

Proprietary - Sun Pharma

## 👥 Contributors

Sun Pharma AI Team
