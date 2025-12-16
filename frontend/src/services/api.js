import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("authToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("authToken");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// Submissions API
export const submissionsApi = {
  list: (params = {}) => api.get("/submissions", { params }),
  get: (id) => api.get(`/submissions/${id}`),
  create: (data) =>
    api.post("/submissions", data, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  // Create submission with files already uploaded to GCS
  createGCS: (data) => api.post("/submissions/gcs", data),
  update: (id, data) => api.put(`/submissions/${id}`, data),
  delete: (id) => api.delete(`/submissions/${id}`),
  uploadImage: (id, formData) =>
    api.post(`/submissions/${id}/image`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  uploadAudio: (id, formData) =>
    api.post(`/submissions/${id}/audio`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  validateImage: (formData) =>
    api.post("/submissions/validate-image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  validateAudio: (formData) =>
    api.post("/submissions/validate-audio", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
};

// Voice API
export const voiceApi = {
  clone: (submissionId) => api.post(`/voice/clone/${submissionId}`),
  delete: (submissionId) => api.delete(`/voice/${submissionId}`),
  speechToSpeech: (submissionId) =>
    api.post(`/voice/speech-to-speech/${submissionId}`),
  getStatus: (submissionId) => api.get(`/voice/status/${submissionId}`),
};

// Audio Masters API
export const audioMastersApi = {
  list: (params = {}) => api.get("/audio-masters", { params }),
  get: (id) => api.get(`/audio-masters/${id}`),
  create: (formData) =>
    api.post("/audio-masters", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  update: (id, data) => api.put(`/audio-masters/${id}`, data),
  delete: (id) => api.delete(`/audio-masters/${id}`),
  getLanguages: () => api.get("/audio-masters/languages"),
};

// Consent API
export const consentApi = {
  // Send OTP to doctor's email
  sendOtp: (submissionId, doctorEmail, doctorName) =>
    api.post(`/consent/send-otp/${submissionId}`, { doctorEmail, doctorName }),

  // Verify OTP entered by MR
  verifyOtp: (submissionId, otp) =>
    api.post(`/consent/verify-otp/${submissionId}`, { otp }),

  // Resend OTP if expired or not received
  resendOtp: (submissionId, doctorEmail, doctorName) =>
    api.post(`/consent/resend-otp/${submissionId}`, {
      doctorEmail,
      doctorName,
    }),

  // Submit consent form with all checkbox states
  submitConsent: (submissionId, consentData) =>
    api.post(`/consent/submit/${submissionId}`, consentData),

  // Get consent status for a submission
  getStatus: (submissionId) => api.get(`/consent/status/${submissionId}`),

  // Get submission details for consent verification
  getSubmissionDetails: (submissionId) =>
    api.get(`/consent/submission/${submissionId}`),
};

// QC API
export const qcApi = {
  getPending: (params = {}) => api.get("/qc/pending", { params }),
  getSubmission: (id) => api.get(`/qc/submission/${id}`),
  startReview: (id, reviewerName) =>
    api.post(`/qc/start-review/${id}`, { reviewer_name: reviewerName }),
  approve: (id, reviewerName, notes) =>
    api.post(`/qc/approve/${id}`, { reviewer_name: reviewerName, notes }),
  reject: (id, reviewerName, notes, rejectionReasons) =>
    api.post(`/qc/reject/${id}`, {
      reviewer_name: reviewerName,
      notes,
      rejection_reasons: rejectionReasons,
    }),
  requestChanges: (id, reviewerName, changesRequested, notes) =>
    api.post(`/qc/request-changes/${id}`, {
      reviewer_name: reviewerName,
      changes_requested: changesRequested,
      notes,
    }),
  getStats: () => api.get("/qc/stats"),
  getHistory: (submissionId) => api.get(`/qc/history/${submissionId}`),
};

// Admin API
export const adminApi = {
  getDashboard: () => api.get("/admin/dashboard"),
  getDoctors: (params = {}) => api.get("/admin/doctors", { params }),
  getMedicalReps: () => api.get("/admin/medical-reps"),
  createMedicalRep: (data) => api.post("/admin/medical-reps", data),
  mrLogin: (email, emp_code) =>
    api.post("/admin/mr-login", { email, emp_code }),
  importMrs: (mrs) => api.post("/admin/import-mrs", { mrs }),
  getElevenLabsStatus: () => api.get("/admin/elevenlabs-status"),
  getAuditLog: (params = {}) => api.get("/admin/audit-log", { params }),
  bulkAction: (action, submissionIds, actor, notes) =>
    api.post("/admin/bulk-action", {
      action,
      submission_ids: submissionIds,
      actor,
      notes,
    }),
  exportData: (params = {}) => api.get("/admin/export", { params }),
  getSystemHealth: () => api.get("/admin/system-health"),
  // New admin dashboard endpoints
  login: (username, password) =>
    api.post("/admin/login", { username, password }),
  getOverallData: (params = {}) => api.get("/admin/overall-data", { params }),
  getMrGroupedData: (params = {}) =>
    api.get("/admin/mr-grouped-data", { params }),
  getMetrics: (params = {}) => api.get("/admin/metrics", { params }),
  syncSheets: () => api.post("/admin/sync-sheets"),
};

// Storage API - GCS Direct Upload
export const storageApi = {
  // Get signed URLs for submission files (image + audio)
  getSubmissionUploadUrls: (doctorPhone, imageFile, audioFiles) =>
    api.post("/storage/submission-upload-urls", {
      doctorPhone,
      imageFile: imageFile ? { name: imageFile.name, type: imageFile.type } : null,
      audioFiles: audioFiles.map((f) => ({ name: f.name, type: f.type })),
    }),

  // Get a single signed upload URL
  getSignedUploadUrl: (fileName, fileType, bucketType = "UPLOADS", folder = "") =>
    api.post("/storage/signed-upload-url", {
      fileName,
      fileType,
      bucketType,
      folder,
    }),

  // Get signed download URL
  getSignedDownloadUrl: (gcsPath, expiresInMinutes = 60) =>
    api.post("/storage/signed-download-url", { gcsPath, expiresInMinutes }),

  // Upload file directly to GCS using signed URL
  uploadToGCS: async (signedUrl, file, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ success: true });
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.ontimeout = () => reject(new Error("Upload timed out"));

      xhr.open("PUT", signedUrl, true);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.timeout = 300000; // 5 minutes
      xhr.send(file);
    });
  },

  // Upload multiple files to GCS with progress tracking
  uploadFilesToGCS: async (uploadConfigs, onFileProgress, onOverallProgress) => {
    const results = [];
    let completedFiles = 0;

    for (const config of uploadConfigs) {
      try {
        await storageApi.uploadToGCS(config.uploadUrl, config.file, (percent) => {
          if (onFileProgress) {
            onFileProgress(config.index, percent, config.originalName || config.file.name);
          }
        });

        results.push({
          success: true,
          index: config.index,
          gcsPath: config.gcsPath,
          publicUrl: config.publicUrl,
          originalName: config.originalName || config.file.name,
          filename: config.originalName || config.file.name,
        });

        completedFiles++;
        if (onOverallProgress) {
          onOverallProgress(Math.round((completedFiles / uploadConfigs.length) * 100));
        }
      } catch (error) {
        results.push({
          success: false,
          index: config.index,
          error: error.message,
          originalName: config.originalName || config.file.name,
          filename: config.originalName || config.file.name,
        });
        completedFiles++;
      }
    }

    return {
      total: uploadConfigs.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  },

  // Get bucket information
  getBuckets: () => api.get("/storage/buckets"),
};

export default api;
