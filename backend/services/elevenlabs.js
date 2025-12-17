/**
 * ElevenLabs API Integration Service
 * Handles voice cloning, speech-to-speech, and voice management
 */

const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const logger = require("../utils/logger");
const { SUPPORTED_LANGUAGES } = require("../utils/constants");

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE_URL =
  process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io/v1";

/**
 * Make authenticated request to ElevenLabs API
 */
async function elevenLabsRequest(endpoint, options = {}) {
  const fetch = (await import("node-fetch")).default;

  const url = `${ELEVENLABS_BASE_URL}${endpoint}`;
  const headers = {
    "xi-api-key": ELEVENLABS_API_KEY,
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(`ElevenLabs API error: ${response.status} - ${errorBody}`);
    throw new Error(
      `ElevenLabs API error: ${response.status} - ${response.statusText}`
    );
  }

  // Check if response is audio (binary) or JSON
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("audio")) {
    return response.buffer();
  }

  return response.json();
}

/**
 * Clone a voice from audio sample
 * @param {string} name - Name for the cloned voice
 * @param {string} audioFilePath - Path to the audio sample file
 * @param {string} description - Optional description
 * @returns {Object} Voice data including voice_id
 */
async function cloneVoice(name, audioFilePath, description = "") {
  logger.info(`[ELEVENLABS] Starting voice clone for: ${name}`);

  const fetch = (await import("node-fetch")).default;

  // Accept single path or array of paths; filter out missing files
  const sourcePaths = Array.isArray(audioFilePath)
    ? audioFilePath
    : [audioFilePath];

  const validPaths = sourcePaths.filter((p) => p && fs.existsSync(p));

  if (validPaths.length === 0) {
    throw new Error("No valid audio sample files provided for cloning");
  }

  const form = new FormData();
  form.append("name", name);
  form.append("description", description || `Voice clone for ${name}`);

  validPaths.forEach((p) => {
    form.append("files", fs.createReadStream(p));
  });

  // Optional: Add labels
  form.append(
    "labels",
    JSON.stringify({
      source: "sun-pharma-video-platform",
      created_at: new Date().toISOString(),
    })
  );

  const response = await fetch(`${ELEVENLABS_BASE_URL}/voices/add`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      ...form.getHeaders(),
    },
    body: form,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(
      `[ELEVENLABS] Voice clone failed: ${response.status} - ${errorBody}`
    );
    throw new Error(`Voice cloning failed: ${response.statusText}`);
  }

  const result = await response.json();
  logger.info(
    `[ELEVENLABS] Voice cloned successfully. Voice ID: ${result.voice_id}`
  );

  return result;
}

/**
 * Delete a cloned voice
 * @param {string} voiceId - The voice ID to delete
 */
async function deleteVoice(voiceId) {
  logger.info(`[ELEVENLABS] Deleting voice: ${voiceId}`);

  await elevenLabsRequest(`/voices/${voiceId}`, {
    method: "DELETE",
  });

  logger.info(`[ELEVENLABS] Voice deleted successfully: ${voiceId}`);
  return true;
}

/**
 * Get voice details
 * @param {string} voiceId - The voice ID
 */
async function getVoice(voiceId) {
  return elevenLabsRequest(`/voices/${voiceId}`);
}

/**
 * List all voices
 */
async function listVoices() {
  return elevenLabsRequest("/voices");
}

/**
 * Speech-to-Speech conversion
 * Uses the cloned voice to transform master audio
 * @param {string} voiceId - The cloned voice ID
 * @param {string} sourceAudioPath - Path to the source/master audio
 * @param {string} languageCode - Target language code
 * @param {Object} options - Additional options
 * @returns {Buffer} The generated audio buffer
 */
async function speechToSpeech(
  voiceId,
  sourceAudioPath,
  languageCode = "en",
  options = {}
) {
  logger.info(
    `[ELEVENLABS] Starting speech-to-speech. Voice: ${voiceId}, Language: ${languageCode}`
  );

  const fetch = (await import("node-fetch")).default;

  const langConfig =
    SUPPORTED_LANGUAGES[languageCode] || SUPPORTED_LANGUAGES["en"];
  // Use STS-specific model for speech-to-speech (not TTS model)
  const modelId = options.modelId || langConfig.elevenLabsStsModel || "eleven_multilingual_sts_v2";
  const voiceSettings = {
    ...langConfig.voiceSettings,
    ...options.voiceSettings,
  };

  logger.info(`[ELEVENLABS] Using STS model: ${modelId}`);

  const form = new FormData();
  form.append("audio", fs.createReadStream(sourceAudioPath));
  form.append("model_id", modelId);
  form.append("voice_settings", JSON.stringify(voiceSettings));

  // Optional: Remove background noise
  if (options.removeBackgroundNoise) {
    form.append("remove_background_noise", "true");
  }

  const response = await fetch(
    `${ELEVENLABS_BASE_URL}/speech-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        Accept: "audio/mpeg",
        ...form.getHeaders(),
      },
      body: form,
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(
      `[ELEVENLABS] Speech-to-speech failed: ${response.status} - ${errorBody}`
    );
    throw new Error(`Speech-to-speech failed: ${response.statusText}`);
  }

  const audioBuffer = await response.buffer();
  logger.info(
    `[ELEVENLABS] Speech-to-speech completed. Output size: ${audioBuffer.length} bytes`
  );

  return audioBuffer;
}

/**
 * Speech-to-Speech with streaming (for large files)
 * @param {string} voiceId - The cloned voice ID
 * @param {string} sourceAudioPath - Path to the source audio
 * @param {string} outputPath - Path to save the output
 * @param {string} languageCode - Target language code
 */
async function speechToSpeechStream(
  voiceId,
  sourceAudioPath,
  outputPath,
  languageCode = "en"
) {
  logger.info(
    `[ELEVENLABS] Starting streamed speech-to-speech. Voice: ${voiceId}`
  );

  const fetch = (await import("node-fetch")).default;

  const langConfig =
    SUPPORTED_LANGUAGES[languageCode] || SUPPORTED_LANGUAGES["en"];

  // Use STS-specific model for speech-to-speech (not TTS model)
  const stsModel = langConfig.elevenLabsStsModel || "eleven_multilingual_sts_v2";
  logger.info(`[ELEVENLABS] Using STS model: ${stsModel}`);

  const form = new FormData();
  form.append("audio", fs.createReadStream(sourceAudioPath));
  form.append("model_id", stsModel);
  form.append("voice_settings", JSON.stringify(langConfig.voiceSettings));

  const response = await fetch(
    `${ELEVENLABS_BASE_URL}/speech-to-speech/${voiceId}/stream`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        Accept: "audio/mpeg",
        ...form.getHeaders(),
      },
      body: form,
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Speech-to-speech stream failed: ${response.statusText}`);
  }

  // Pipe response to file
  const fileStream = fs.createWriteStream(outputPath);

  return new Promise((resolve, reject) => {
    response.body.pipe(fileStream);
    response.body.on("error", reject);
    fileStream.on("finish", () => {
      logger.info(`[ELEVENLABS] Streamed audio saved to: ${outputPath}`);
      resolve(outputPath);
    });
  });
}

/**
 * Text-to-Speech (for generating audio from text)
 * @param {string} voiceId - The voice ID to use
 * @param {string} text - Text to convert to speech
 * @param {string} languageCode - Target language code
 * @param {Object} options - Additional options
 * @returns {Buffer} The generated audio buffer
 */
async function textToSpeech(voiceId, text, languageCode = "en", options = {}) {
  logger.info(
    `[ELEVENLABS] Starting text-to-speech. Voice: ${voiceId}, Language: ${languageCode}`
  );

  const langConfig =
    SUPPORTED_LANGUAGES[languageCode] || SUPPORTED_LANGUAGES["en"];

  const body = {
    text,
    model_id: options.modelId || langConfig.elevenLabsModel,
    voice_settings: {
      ...langConfig.voiceSettings,
      ...options.voiceSettings,
    },
  };

  const response = await elevenLabsRequest(`/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
  });

  logger.info(`[ELEVENLABS] Text-to-speech completed`);
  return response;
}

/**
 * Get user subscription info (for quota tracking)
 */
async function getSubscriptionInfo() {
  return elevenLabsRequest("/user/subscription");
}

/**
 * Get user info
 */
async function getUserInfo() {
  return elevenLabsRequest("/user");
}

/**
 * Check API health and remaining quota
 */
async function checkApiHealth() {
  try {
    // Try to list voices as a health check
    const voices = await listVoices();

    // If we can list voices, the API is working
    return {
      healthy: true,
      voicesAvailable: voices?.voices?.length || 0,
      message: "ElevenLabs API is operational",
    };
  } catch (error) {
    logger.error("[ELEVENLABS] Health check failed:", error);
    return {
      healthy: false,
      error: error.message,
    };
  }
}

module.exports = {
  cloneVoice,
  deleteVoice,
  getVoice,
  listVoices,
  speechToSpeech,
  speechToSpeechStream,
  textToSpeech,
  getSubscriptionInfo,
  getUserInfo,
  checkApiHealth,
};
