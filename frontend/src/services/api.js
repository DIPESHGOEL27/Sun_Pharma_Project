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

export default api;
