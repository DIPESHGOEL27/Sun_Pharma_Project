/**
 * Sun Pharma Video Platform - Configuration Constants
 */

// Supported Languages with ElevenLabs model mappings
const SUPPORTED_LANGUAGES = {
  hi: {
    code: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    elevenLabsModel: "eleven_multilingual_v2",
    elevenLabsStsModel: "eleven_multilingual_sts_v2",
    voiceSettings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      use_speaker_boost: true,
    },
  },
  en: {
    code: "en",
    name: "English",
    nativeName: "English",
    elevenLabsModel: "eleven_multilingual_v2",
    elevenLabsStsModel: "eleven_multilingual_sts_v2",
    voiceSettings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      use_speaker_boost: true,
    },
  },
  mr: {
    code: "mr",
    name: "Marathi",
    nativeName: "मराठी",
    elevenLabsModel: "eleven_multilingual_v2",
    elevenLabsStsModel: "eleven_multilingual_sts_v2",
    voiceSettings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      use_speaker_boost: true,
    },
  },
  gu: {
    code: "gu",
    name: "Gujarati",
    nativeName: "ગુજરાતી",
    elevenLabsModel: "eleven_multilingual_v2",
    elevenLabsStsModel: "eleven_multilingual_sts_v2",
    voiceSettings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      use_speaker_boost: true,
    },
  },
  ta: {
    code: "ta",
    name: "Tamil",
    nativeName: "தமிழ்",
    elevenLabsModel: "eleven_multilingual_v2",
    elevenLabsStsModel: "eleven_multilingual_sts_v2",
    voiceSettings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      use_speaker_boost: true,
    },
  },
  te: {
    code: "te",
    name: "Telugu",
    nativeName: "తెలుగు",
    elevenLabsModel: "eleven_multilingual_v2",
    elevenLabsStsModel: "eleven_multilingual_sts_v2",
    voiceSettings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      use_speaker_boost: true,
    },
  },
  kn: {
    code: "kn",
    name: "Kannada",
    nativeName: "ಕನ್ನಡ",
    elevenLabsModel: "eleven_multilingual_v2",
    elevenLabsStsModel: "eleven_multilingual_sts_v2",
    voiceSettings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      use_speaker_boost: true,
    },
  },
  bn: {
    code: "bn",
    name: "Bengali",
    nativeName: "বাংলা",
    elevenLabsModel: "eleven_multilingual_v2",
    elevenLabsStsModel: "eleven_multilingual_sts_v2",
    voiceSettings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      use_speaker_boost: true,
    },
  },
  ml: {
    code: "ml",
    name: "Malayalam",
    nativeName: "മലയാളം",
    elevenLabsModel: "eleven_multilingual_v2",
    elevenLabsStsModel: "eleven_multilingual_sts_v2",
    voiceSettings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      use_speaker_boost: true,
    },
  },
  pa: {
    code: "pa",
    name: "Punjabi",
    nativeName: "ਪੰਜਾਬੀ",
    elevenLabsModel: "eleven_multilingual_v2",
    elevenLabsStsModel: "eleven_multilingual_sts_v2",
    voiceSettings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      use_speaker_boost: true,
    },
  },
};

// Submission Status
const SUBMISSION_STATUS = {
  DRAFT: "draft",
  PENDING_CONSENT: "pending_consent",
  CONSENT_VERIFIED: "consent_verified",
  PROCESSING: "processing",
  VOICE_CLONING: "voice_cloning",
  AUDIO_GENERATION: "audio_generation",
  VIDEO_GENERATION: "video_generation",
  PENDING_QC: "pending_qc",
  QC_APPROVED: "qc_approved",
  QC_REJECTED: "qc_rejected",
  COMPLETED: "completed",
  FAILED: "failed",
};

// Consent Status
const CONSENT_STATUS = {
  PENDING: "pending",
  OTP_SENT: "otp_sent",
  VERIFIED: "verified",
  EXPIRED: "expired",
};

// OTP Configuration
const OTP_CONFIG = {
  EXPIRY_MINUTES: 10,
  LENGTH: 6,
  MAX_ATTEMPTS: 3,
};

// QC Status
const QC_STATUS = {
  PENDING: "pending",
  IN_REVIEW: "in_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  NEEDS_REVISION: "needs_revision",
};

// Voice Clone Status
const VOICE_CLONE_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  FAILED: "failed",
  DELETED: "deleted",
};

// File Upload Configuration
const UPLOAD_CONFIG = {
  IMAGE: {
    maxSizeMB: 10,
    maxSizeBytes: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/jpg"],
    allowedExtensions: [".jpg", ".jpeg", ".png"],
    minWidth: 720,
    minHeight: 720,
    recommendedWidth: 1080,
    recommendedHeight: 1080,
  },
  AUDIO: {
    maxSizeMB: 100,
    maxSizeBytes: 100 * 1024 * 1024,
    allowedMimeTypes: [
      "audio/mpeg",
      "audio/wav",
      "audio/mp3",
      "audio/x-wav",
      "audio/x-m4a",
      "audio/mp4",
    ],
    allowedExtensions: [".mp3", ".wav", ".m4a"],
    minDurationSeconds: 60, // 1 minute minimum per file
    maxFilesCount: 5, // Maximum 5 audio files
    minSampleRate: 44100,
  },
};

// Image Validation Requirements
const IMAGE_REQUIREMENTS = {
  POSE_FRAMING: [
    "Front-facing",
    "Full face clearly visible",
    "Mid-torso or above",
    "Neutral expression preferred",
  ],
  NO_OCCLUSION: [
    "No glasses causing glare",
    "No masks",
    "No hands on face",
    "No shadows across the face",
  ],
  CLARITY: [
    "Well-lit environment (natural or soft indoor light)",
    "Avoid backlighting",
    "No motion blur",
    "No pixelation",
  ],
  BACKGROUND: [
    "Plain, light background preferred",
    "No clutter, text, posters, or people",
    "No harsh shadows",
  ],
};

// Audio Validation Requirements
const AUDIO_REQUIREMENTS = {
  DURATION_FORMAT: [
    "Minimum Duration: 1 minute per file",
    "Maximum Files: 5 audio files",
    "Audio Format: WAV or MP3",
    "Quality: 44.1 kHz or above",
  ],
  RECORDING_ENVIRONMENT: [
    "A quiet room",
    "No background noise (traffic, fans, patients)",
    "No echo",
    "Phone kept 15–20 cm from mouth",
    "Avoid movement while recording",
  ],
  REJECTION_REASONS: [
    "Background noise",
    "Distortion",
    "Wind or echo",
    "Too short (<2 minutes)",
    "Wrong format",
    "Unclear speech",
    "Incomplete script",
  ],
};

// GCS Bucket Paths
const GCS_PATHS = {
  DOCTOR_IMAGES: "doctor-images",
  DOCTOR_AUDIO: "doctor-audio",
  AUDIO_MASTERS: "audio-masters",
  GENERATED_AUDIO: "generated-audio",
  GENERATED_VIDEOS: "generated-videos",
};

// Maximum language selections per submission
const MAX_LANGUAGE_SELECTIONS = 3;

module.exports = {
  SUPPORTED_LANGUAGES,
  SUBMISSION_STATUS,
  CONSENT_STATUS,
  OTP_CONFIG,
  QC_STATUS,
  VOICE_CLONE_STATUS,
  UPLOAD_CONFIG,
  IMAGE_REQUIREMENTS,
  AUDIO_REQUIREMENTS,
  GCS_PATHS,
  MAX_LANGUAGE_SELECTIONS,
};
