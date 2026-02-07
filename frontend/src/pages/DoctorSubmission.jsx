import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import toast from "react-hot-toast";
import { submissionsApi, adminApi, storageApi } from "../services/api";
import {
  PhotoIcon,
  MicrophoneIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowRightIcon,
  XMarkIcon,
  UserIcon,
  KeyIcon,
  ArrowLeftOnRectangleIcon,
} from "@heroicons/react/24/outline";

const LANGUAGES = [
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "en", name: "English", native: "English" },
  { code: "mr", name: "Marathi", native: "मराठी" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
  { code: "te", name: "Telugu", native: "తెలుగు" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", name: "Malayalam", native: "മലയാളം" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ" },
];

const MAX_LANGUAGES = 3;

const CAMPAIGN_NAME = "Susten Cap VoiceReach";

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

// MR Login Component
function MRLoginScreen({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [empCode, setEmpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !empCode) {
      setError("Please enter both email and employee code");
      return;
    }

    setLoading(true);

    try {
      const res = await adminApi.mrLogin(email, empCode);
      const mrData = res.data;
      // Store MR info in sessionStorage
      sessionStorage.setItem("mrSession", JSON.stringify(mrData));
      toast.success(`Welcome, ${mrData.name}!`);
      onLoginSuccess(mrData);
    } catch (err) {
      console.error("Login error:", err);
      const status = err.response?.status;
      const message = err.response?.data?.error;

      if (status === 401) {
        setError(
          "Invalid email or employee code. Please check your credentials and try again.",
        );
      } else if (status === 400) {
        setError(message || "Please enter a valid email and employee code.");
      } else if (status === 500) {
        setError("Server error. Please try again later.");
      } else if (!err.response) {
        setError("Network error. Please check your internet connection.");
      } else {
        setError(message || "Login failed. Please try again.");
      }
      toast.error("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <img
            src="/sustencaplogo.jpg"
            alt="Susten Cap Logo"
            className="h-20 mx-auto mb-4"
          />
          <h1 className="text-3xl font-bold text-gray-900">MR Login</h1>
          <p className="text-gray-600 mt-2">{CAMPAIGN_NAME}</p>
        </div>

        {/* Login Card */}
        <div
          className={`bg-white rounded-2xl shadow-xl p-8 ${
            error ? "animate-shake" : ""
          }`}
        >
          <style>{`
            @keyframes shake {
              0%, 100% { transform: translateX(0); }
              10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
              20%, 40%, 60%, 80% { transform: translateX(5px); }
            }
            .animate-shake { animation: shake 0.5s ease-in-out; }
          `}</style>
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg animate-pulse">
                <p className="text-sm text-red-600 flex items-center">
                  <ExclamationCircleIcon className="w-5 h-5 mr-2" />
                  {error}
                </p>
              </div>
            )}

            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address (Username)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.name@sunpharma.com"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Employee Code Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Employee Code (Password)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <KeyIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  value={empCode}
                  onChange={(e) => setEmpCode(e.target.value.toUpperCase())}
                  placeholder="E12345"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  autoComplete="current-password"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Enter your Sun Pharma employee code
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Logging in...
                </>
              ) : (
                <>
                  Login
                  <ArrowRightIcon className="w-5 h-5 ml-2" />
                </>
              )}
            </button>
          </form>

          {/* Help Text */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              Use your official Sun Pharma email and employee code to login.
              <br />
              Contact IT support if you're having trouble logging in.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} Sun Pharma. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DoctorSubmission() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [mrLookupLoading, setMrLookupLoading] = useState(false);

  // MR Login State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loggedInMR, setLoggedInMR] = useState(null);

  // Check for existing session on mount
  useEffect(() => {
    const storedSession = sessionStorage.getItem("mrSession");
    if (storedSession) {
      try {
        const mrData = JSON.parse(storedSession);
        setLoggedInMR(mrData);
        setIsLoggedIn(true);
        // Pre-fill MR details
        setFormData((prev) => ({
          ...prev,
          mrCode: mrData.emp_code || mrData.mr_code,
          mrName: mrData.name,
          mrPhone: mrData.phone || "",
        }));
      } catch (e) {
        sessionStorage.removeItem("mrSession");
      }
    }
  }, []);

  // Handle MR Login Success
  const handleLoginSuccess = (mrData) => {
    setLoggedInMR(mrData);
    setIsLoggedIn(true);
    setFormData((prev) => ({
      ...prev,
      mrCode: mrData.emp_code || mrData.mr_code,
      mrName: mrData.name,
      mrPhone: mrData.phone || "",
    }));
  };

  // Handle Logout
  const handleLogout = () => {
    sessionStorage.removeItem("mrSession");
    setIsLoggedIn(false);
    setLoggedInMR(null);
    setFormData({
      mrCode: "",
      mrName: "",
      mrPhone: "",
      doctorName: "",
      email: "",
      phone: "",
      specialty: "",
      clinicName: "",
      city: "",
      state: "",
    });
    toast.success("Logged out successfully");
  };

  // Form data
  const [formData, setFormData] = useState({
    // MR Details
    mrCode: "",
    mrName: "",
    mrPhone: "",
    // Doctor Details
    doctorName: "",
    email: "",
    phone: "",
    specialty: "",
    clinicName: "",
    city: "",
    state: "",
  });

  // Files
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [audioFiles, setAudioFiles] = useState([]);
  const [audioDurations, setAudioDurations] = useState([]);
  const [audioValidating, setAudioValidating] = useState(false);

  const MAX_AUDIO_FILES = 5;
  const MIN_AUDIO_DURATION = 60; // 1 minute minimum per file

  // Validation results
  const [imageValidation, setImageValidation] = useState(null);
  const [audioValidations, setAudioValidations] = useState([]);

  // Language selection
  const [selectedLanguages, setSelectedLanguages] = useState([]);

  // Errors
  const [errors, setErrors] = useState({});

  // MR details are now autofilled from login, no need for manual lookup

  // Handle input change
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear error on change
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  // Toggle language selection
  const toggleLanguage = (code) => {
    setSelectedLanguages((prev) => {
      if (prev.includes(code)) {
        return prev.filter((l) => l !== code);
      }
      if (prev.length >= MAX_LANGUAGES) {
        toast.error(`Maximum ${MAX_LANGUAGES} languages allowed`, {
          duration: 3000,
        });
        return prev;
      }
      return [...prev, code];
    });
  };

  // Image dropzone
  const onImageDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
    setImageFile(file);

    // Validate
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await submissionsApi.validateImage(formData);
      setImageValidation(res.data);
      if (!res.data.isValid) {
        toast.error("Image validation failed. Please check requirements.");
      }
    } catch (error) {
      console.error("Image validation error:", error);
      setImageValidation({ isValid: false, errors: ["Validation failed"] });
    }
  }, []);

  const {
    getRootProps: getImageRootProps,
    getInputProps: getImageInputProps,
    isDragActive: isImageDragActive,
  } = useDropzone({
    onDrop: onImageDrop,
    accept: { "image/jpeg": [], "image/png": [] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  // Audio dropzone - supports multiple files
  const onAudioDrop = useCallback(
    async (acceptedFiles) => {
      if (!acceptedFiles.length) return;

      // Use functional update to get current state
      setAudioFiles((prevFiles) => {
        const totalFiles = prevFiles.length + acceptedFiles.length;
        if (totalFiles > MAX_AUDIO_FILES) {
          toast.error(`Maximum ${MAX_AUDIO_FILES} audio files allowed`);
          return prevFiles;
        }
        return [...prevFiles, ...acceptedFiles];
      });

      // Get durations for new files (fast, client-side)
      const newDurations = await Promise.all(
        acceptedFiles.map((file) => {
          return new Promise((resolve) => {
            const audio = new Audio();
            audio.src = URL.createObjectURL(file);
            audio.onloadedmetadata = () => {
              const dur = audio.duration;
              URL.revokeObjectURL(audio.src);
              resolve(dur);
            };
            audio.onerror = () => resolve(0);
          });
        }),
      );

      setAudioDurations((prev) => [...prev, ...newDurations]);

      // Initialize validations as "pending" for new files
      const pendingValidations = acceptedFiles.map(() => ({
        isValid: null,
        pending: true,
      }));
      setAudioValidations((prev) => [...prev, ...pendingValidations]);

      // Clear audio error since files are now added
      setErrors((prev) => ({ ...prev, audio: null }));

      // Validate files in background (don't block UI)
      setAudioValidating(true);
      const startIndex = audioFiles.length; // Index where new files start

      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i];
        try {
          const formData = new FormData();
          formData.append("audio", file);
          const res = await submissionsApi.validateAudio(formData);

          // Update validation at correct index
          setAudioValidations((prev) => {
            const updated = [...prev];
            updated[startIndex + i] = res.data;
            return updated;
          });

          if (!res.data.isValid) {
            toast.error(`Audio "${file.name}" validation failed.`);
          }
        } catch (error) {
          console.error("Audio validation error:", error);
          setAudioValidations((prev) => {
            const updated = [...prev];
            updated[startIndex + i] = { isValid: true, skipped: true }; // Allow to proceed if validation fails
            return updated;
          });
        }
      }
      setAudioValidating(false);
    },
    [audioFiles.length],
  ); // Use length to avoid stale closure

  const {
    getRootProps: getAudioRootProps,
    getInputProps: getAudioInputProps,
    isDragActive: isAudioDragActive,
  } = useDropzone({
    onDrop: onAudioDrop,
    accept: {
      "audio/mpeg": [".mp3"],
      "audio/wav": [".wav"],
      "audio/x-wav": [".wav"],
      "audio/x-m4a": [".m4a"],
      "audio/mp4": [".m4a", ".mp4"],
      "audio/ogg": [".ogg"],
      "audio/webm": [".webm"],
      "video/mp4": [".mp4"],
      "video/webm": [".webm"],
    },
    maxFiles: MAX_AUDIO_FILES,
    maxSize: 100 * 1024 * 1024, // 100MB per file
    multiple: true,
  });

  // Validate form
  const validateForm = () => {
    const newErrors = {};

    if (!formData.mrCode) newErrors.mrCode = "MR Code is required";
    if (!formData.doctorName) newErrors.doctorName = "Doctor name is required";
    if (!formData.email) newErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      newErrors.email = "Invalid email format";
    if (!formData.phone) newErrors.phone = "Phone is required";
    else if (!/^\d{10}$/.test(formData.phone.replace(/\D/g, "")))
      newErrors.phone = "Enter 10-digit phone number";
    if (!formData.specialty) newErrors.specialty = "Specialty is required";
    if (!formData.clinicName) newErrors.clinicName = "Clinic name is required";
    if (!formData.city) newErrors.city = "City is required";
    if (!formData.state) newErrors.state = "State is required";
    if (!imageFile) newErrors.image = "Doctor photo is required";
    if (audioFiles.length === 0)
      newErrors.audio = "At least one voice sample is required";
    if (audioFiles.length > 0) {
      const shortAudios = audioDurations.filter((d) => d < MIN_AUDIO_DURATION);
      if (shortAudios.length > 0) {
        newErrors.audio = `Each audio file must be at least 1 minute. ${shortAudios.length} file(s) are too short.`;
      }
    }
    if (selectedLanguages.length === 0)
      newErrors.languages = "Select at least one language";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle submit
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fill all required fields correctly");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setLoading(true);

    try {
      // Step 1: Get signed URLs for GCS upload
      toast.loading("Preparing upload...", { id: "upload-prep" });

      const urlsResponse = await storageApi.getSubmissionUploadUrls(
        formData.phone,
        imageFile,
        audioFiles,
      );

      const {
        image: imageUploadConfig,
        audioFiles: audioUploadConfigs,
        submissionPrefix,
      } = urlsResponse.data;
      toast.dismiss("upload-prep");

      // Step 2: Upload image to GCS
      toast.loading("Uploading photo...", { id: "upload-image" });
      await storageApi.uploadToGCS(
        imageUploadConfig.uploadUrl,
        imageFile,
        (percent) => {
          // Optional: update progress state here
        },
      );
      toast.dismiss("upload-image");
      toast.success("Photo uploaded successfully", { duration: 2000 });

      // Step 3: Upload audio files to GCS
      let audioUploadResults = [];
      if (audioFiles.length > 0) {
        toast.loading(`Uploading audio files (0/${audioFiles.length})...`, {
          id: "upload-audio",
        });

        const uploadConfigs = audioUploadConfigs.map((config, idx) => ({
          ...config,
          file: audioFiles[idx],
        }));

        audioUploadResults = await storageApi.uploadFilesToGCS(
          uploadConfigs,
          (index, percent, name) => {
            toast.loading(
              `Uploading audio files (${index + 1}/${audioFiles.length})...`,
              { id: "upload-audio" },
            );
          },
          (overallPercent) => {
            // Overall progress
          },
        );

        toast.dismiss("upload-audio");

        if (audioUploadResults.failed > 0) {
          toast.error(
            `${audioUploadResults.failed} audio file(s) failed to upload`,
          );
        } else {
          toast.success("All audio files uploaded", { duration: 2000 });
        }
      }

      // Step 4: Create submission with GCS paths
      toast.loading("Creating submission...", { id: "create-submission" });

      const submitData = {
        doctor_name: formData.doctorName,
        doctor_email: formData.email,
        doctor_phone: formData.phone,
        specialty: formData.specialty,
        clinic_name: formData.clinicName,
        city: formData.city,
        state: formData.state,
        campaign_name: CAMPAIGN_NAME,
        mr_name: formData.mrName,
        mr_code: formData.mrCode,
        mr_phone: formData.mrPhone,
        selected_languages: selectedLanguages,
        // GCS paths
        image_gcs_path: imageUploadConfig.gcsPath,
        image_public_url: imageUploadConfig.publicUrl,
        audio_gcs_paths: audioUploadResults.results
          .filter((r) => r.success)
          .map((r) => ({
            gcs_path: r.gcsPath,
            public_url: r.publicUrl,
            filename: r.filename,
            duration_seconds: r.durationSeconds || null,
          })),
        submission_prefix: submissionPrefix,
      };

      // Use createGCS endpoint for GCS uploads
      const res = await submissionsApi.createGCS(submitData);

      toast.dismiss("create-submission");
      toast.success("Submission created successfully!", { duration: 3000 });

      // Redirect to consent verification
      navigate(`/consent/${res.data.submission_id}`);
    } catch (error) {
      console.error("Submission error:", error);
      toast.dismiss();
      toast.error(error.response?.data?.error || "Failed to create submission");
    } finally {
      setLoading(false);
    }
  };

  // Format duration
  const formatDuration = (seconds) => {
    if (!seconds) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // If not logged in, show login screen
  if (!isLoggedIn) {
    return <MRLoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Logged in MR info bar */}
      <div className="bg-blue-600 text-white py-2 px-3 sm:px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 min-w-0">
            <span className="text-xs sm:text-sm truncate">
              <span className="hidden sm:inline">Logged in as: </span>
              <strong>{loggedInMR?.name}</strong>{" "}
              <span className="text-blue-200">({loggedInMR?.mr_code})</span>
            </span>
            <div className="flex items-center gap-2">
              {loggedInMR?.designation && (
                <span className="text-xs bg-blue-500 px-2 py-0.5 rounded hidden sm:inline">
                  {loggedInMR.designation}
                </span>
              )}
              {loggedInMR?.hq && (
                <span className="text-xs text-blue-200 hidden md:inline">
                  HQ: {loggedInMR.hq}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs sm:text-sm hover:underline flex items-center gap-1 flex-shrink-0"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
        {/* Main Form - Left Side */}
        <div className="lg:col-span-2 p-4 sm:p-6 lg:p-8 max-w-4xl">
          {/* Header with Logo */}
          <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            <img
              src="/sustencaplogo.jpg"
              alt="Susten Cap Logo"
              className="h-12 sm:h-16 w-auto"
            />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                New Doctor Submission
              </h1>
              <p className="text-sm sm:text-base text-gray-500 mt-1">
                {CAMPAIGN_NAME} - Fill in the doctor details to generate
                personalized AI videos
              </p>
            </div>
          </div>

          {/* Error Summary */}
          {Object.keys(errors).length > 0 && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="font-medium text-red-800">
                Please correct the following errors:
              </p>
              <ul className="list-disc ml-5 mt-1 text-sm text-red-700">
                {Object.entries(errors).map(([key, value]) => (
                  <li key={key}>{value}</li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Medical Representative Details */}
            <div className="bg-white rounded-lg border shadow-sm">
              <div className="p-6 border-b">
                <h3 className="text-xl font-semibold text-gray-900">
                  Medical Representative Details
                </h3>
                <p className="text-sm text-gray-500">Your information</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      MR Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="mrCode"
                      value={formData.mrCode}
                      onChange={handleChange}
                      placeholder="e.g., MR001"
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.mrCode ? "border-red-500" : "border-gray-300"
                      }`}
                    />
                    {mrLookupLoading && (
                      <p className="text-xs text-gray-500 mt-1">
                        Looking up...
                      </p>
                    )}
                    {errors.mrCode && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.mrCode}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      MR Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="mrName"
                      value={formData.mrName}
                      onChange={handleChange}
                      placeholder="Your name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                      readOnly
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Autofilled from MR Code
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      MR Phone <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      name="mrPhone"
                      value={formData.mrPhone}
                      onChange={handleChange}
                      placeholder="9876543210"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                      readOnly
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Autofilled from MR Code
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Doctor Information */}
            <div className="bg-white rounded-lg border shadow-sm">
              <div className="p-6 border-b">
                <h3 className="text-xl font-semibold text-gray-900">
                  Doctor Information
                </h3>
                <p className="text-sm text-gray-500">
                  Basic details of the doctor
                </p>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Doctor Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="doctorName"
                      value={formData.doctorName}
                      onChange={handleChange}
                      placeholder="Priya Sharma (DONOT use Dr. Priya Sharma)"
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${
                        errors.doctorName ? "border-red-500" : "border-gray-300"
                      }`}
                    />
                    {errors.doctorName && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.doctorName}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Doctor's Email Address{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="doctor@hospital.com"
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${
                        errors.email ? "border-red-500" : "border-gray-300"
                      }`}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      OTP will be sent to this email for consent
                    </p>
                    {errors.email && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.email}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="9876543210"
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${
                        errors.phone ? "border-red-500" : "border-gray-300"
                      }`}
                    />
                    {errors.phone && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.phone}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Specialty <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="specialty"
                      value={formData.specialty}
                      onChange={handleChange}
                      placeholder="Cardiologist"
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${
                        errors.specialty ? "border-red-500" : "border-gray-300"
                      }`}
                    />
                    {errors.specialty && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.specialty}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Clinic/Hospital Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="clinicName"
                    value={formData.clinicName}
                    onChange={handleChange}
                    placeholder="City General Hospital"
                    className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${
                      errors.clinicName ? "border-red-500" : "border-gray-300"
                    }`}
                  />
                  {errors.clinicName && (
                    <p className="text-xs text-red-500 mt-1">
                      {errors.clinicName}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      City <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      placeholder="Mumbai"
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${
                        errors.city ? "border-red-500" : "border-gray-300"
                      }`}
                    />
                    {errors.city && (
                      <p className="text-xs text-red-500 mt-1">{errors.city}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      State <span className="text-red-500">*</span>
                    </label>
                    <select
                      name="state"
                      value={formData.state}
                      onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${
                        errors.state ? "border-red-500" : "border-gray-300"
                      }`}
                    >
                      <option value="">Select State</option>
                      {INDIAN_STATES.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                    {errors.state && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.state}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Media Files */}
            <div className="bg-white rounded-lg border shadow-sm">
              <div className="p-6 border-b">
                <h3 className="text-xl font-semibold text-gray-900">
                  Media Files
                </h3>
                <p className="text-sm text-gray-500">
                  Upload doctor's image and voice sample
                </p>
              </div>
              <div className="p-6 space-y-6">
                {/* Image Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Doctor Photo <span className="text-red-500">*</span>
                  </label>
                  <div
                    {...getImageRootProps()}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                      isImageDragActive
                        ? "border-blue-500 bg-blue-50"
                        : errors.image
                          ? "border-red-400 hover:border-red-500"
                          : "border-gray-300 hover:border-blue-400"
                    }`}
                  >
                    <input {...getImageInputProps()} />
                    {imagePreview ? (
                      <div className="relative inline-block">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="h-32 w-32 object-cover rounded-lg mx-auto"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setImageFile(null);
                            setImagePreview(null);
                            setImageValidation(null);
                          }}
                          className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                        {imageValidation && (
                          <div
                            className={`mt-2 text-sm ${
                              imageValidation.isValid
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {imageValidation.isValid ? (
                              <span className="flex items-center justify-center gap-1">
                                <CheckCircleIcon className="w-4 h-4" /> Valid
                              </span>
                            ) : (
                              <div className="text-left">
                                <span className="flex items-center gap-1 mb-1">
                                  <ExclamationCircleIcon className="w-4 h-4" />{" "}
                                  Validation Failed
                                </span>
                                {imageValidation.errors &&
                                  imageValidation.errors.length > 0 && (
                                    <ul className="text-xs ml-5 list-disc">
                                      {imageValidation.errors.map((err, i) => (
                                        <li key={i}>{err}</li>
                                      ))}
                                    </ul>
                                  )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <PhotoIcon className="w-10 h-10 mx-auto mb-3 text-gray-400" />
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          Click to upload image
                        </p>
                        <p className="text-xs text-gray-500">
                          Front-facing, clear face, JPG/PNG, min 720p
                        </p>
                      </>
                    )}
                  </div>
                  {errors.image && (
                    <p className="text-xs text-red-500 mt-1">{errors.image}</p>
                  )}
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                    <ExclamationCircleIcon className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-gray-600">
                      Ensure photo is front-facing, mid-torso or above, with
                      clear face visibility. No masks, no hands on face, no
                      shadows across face.
                    </p>
                  </div>
                </div>

                {/* Audio Upload - Multiple Files */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Voice Samples <span className="text-red-500">*</span>{" "}
                    <span className="text-gray-400 font-normal">
                      (Up to {MAX_AUDIO_FILES} files, minimum 1 minute each)
                    </span>
                  </label>

                  {/* List of uploaded audio files */}
                  {audioFiles.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {audioFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border"
                        >
                          <MicrophoneIcon className="w-6 h-6 text-blue-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {file.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              Duration: {formatDuration(audioDurations[index])}{" "}
                              | Size: {(file.size / 1024 / 1024).toFixed(2)} MB
                              {audioDurations[index] &&
                                audioDurations[index] < MIN_AUDIO_DURATION && (
                                  <span className="text-red-500 ml-2">
                                    (Too short - min 1 min)
                                  </span>
                                )}
                            </p>
                          </div>
                          {audioValidations[index]?.pending ? (
                            <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700 flex items-center gap-1">
                              <svg
                                className="animate-spin h-3 w-3"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                  fill="none"
                                />
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                              </svg>
                              Validating...
                            </span>
                          ) : audioValidations[index] ? (
                            <span
                              className={`text-xs px-2 py-1 rounded ${
                                audioValidations[index].isValid !== false
                                  ? "bg-green-100 text-green-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {audioValidations[index].isValid !== false
                                ? "Valid"
                                : "Invalid"}
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-500">
                              Ready
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAudioFiles((prev) =>
                                prev.filter((_, i) => i !== index),
                              );
                              setAudioDurations((prev) =>
                                prev.filter((_, i) => i !== index),
                              );
                              setAudioValidations((prev) =>
                                prev.filter((_, i) => i !== index),
                              );
                            }}
                            className="p-1 bg-red-500 text-white rounded-full hover:bg-red-600 flex-shrink-0"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Dropzone for adding more files */}
                  {audioFiles.length < MAX_AUDIO_FILES && (
                    <div
                      {...getAudioRootProps()}
                      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                        isAudioDragActive
                          ? "border-blue-500 bg-blue-50"
                          : errors.audio
                            ? "border-red-400 hover:border-red-500"
                            : "border-gray-300 hover:border-blue-400"
                      }`}
                    >
                      <input
                        {...getAudioInputProps()}
                        accept=".mp3,.wav,.m4a,.mp4,.ogg,.webm,audio/mpeg,audio/wav,audio/x-m4a,audio/mp4,audio/ogg,audio/webm,video/mp4,video/webm"
                      />
                      <MicrophoneIcon className="w-10 h-10 mx-auto mb-3 text-gray-400" />
                      <p className="text-sm font-medium text-gray-700 mb-1">
                        {audioFiles.length === 0
                          ? "Tap to upload audio files"
                          : `Add more audio files (${audioFiles.length}/${MAX_AUDIO_FILES})`}
                      </p>
                      <p className="text-xs text-gray-500">
                        MP3, WAV, M4A, MP4, OGG, WebM • Min 1 minute • Up to{" "}
                        {MAX_AUDIO_FILES} files
                      </p>
                    </div>
                  )}

                  {audioValidating && (
                    <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Validating audio files...
                    </p>
                  )}

                  {errors.audio && (
                    <p className="text-xs text-red-500 mt-1">{errors.audio}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Language Selection */}
            <div className="bg-white rounded-lg border shadow-sm">
              <div className="p-6 border-b">
                <h3 className="text-xl font-semibold text-gray-900">
                  Language Selection
                </h3>
                <p className="text-sm text-gray-500">
                  Select up to {MAX_LANGUAGES} languages for video generation
                </p>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => toggleLanguage(lang.code)}
                      className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        selectedLanguages.includes(lang.code)
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 hover:border-gray-300 text-gray-600"
                      }`}
                    >
                      {lang.name}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Selected: {selectedLanguages.length}/{MAX_LANGUAGES}
                </p>
                {errors.languages && (
                  <p className="text-xs text-red-500 mt-1">
                    {errors.languages}
                  </p>
                )}
              </div>
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-md font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? "Submitting..." : "Continue to Consent"}
                <ArrowRightIcon className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>

        {/* Right Sidebar - SOP */}
        <div className="lg:col-span-1 bg-gray-100 border-t lg:border-t-0 lg:border-l p-4 sm:p-6 lg:overflow-y-auto lg:max-h-screen lg:sticky lg:top-0">
          <div className="space-y-4 sm:space-y-6">
            {/* Header */}
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-4 flex items-center gap-2">
                <CheckCircleIcon className="w-5 h-5 text-blue-600" />
                Standard Operating Procedure
              </h2>
              <p className="text-xs text-gray-500 lg:hidden">
                Guidelines for image and audio uploads
              </p>
            </div>

            {/* Image Requirements */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <PhotoIcon className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">
                  Image Quality Requirements
                </h3>
              </div>
              <div className="space-y-3 pl-2">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1.5">
                    <CheckCircleIcon className="w-3.5 h-3.5 text-blue-600" />
                    Pose & Framing
                  </h4>
                  <ul className="text-xs text-gray-600 space-y-1 pl-5 list-disc">
                    <li>Front-facing</li>
                    <li>Full face clearly visible</li>
                    <li>Mid-torso or above</li>
                    <li>Neutral expression preferred</li>
                    <li>
                      No occlusion: No glasses causing glare, No masks, No hands
                      on face, No shadows across the face
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1.5">
                    <CheckCircleIcon className="w-3.5 h-3.5 text-blue-600" />
                    Clarity
                  </h4>
                  <ul className="text-xs text-gray-600 space-y-1 pl-5 list-disc">
                    <li>Well-lit environment (natural or soft indoor light)</li>
                    <li>Avoid backlighting</li>
                    <li>No motion blur</li>
                    <li>No pixelation</li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1.5">
                    <CheckCircleIcon className="w-3.5 h-3.5 text-blue-600" />
                    Background
                  </h4>
                  <ul className="text-xs text-gray-600 space-y-1 pl-5 list-disc">
                    <li>Plain, light background preferred</li>
                    <li>No clutter, text, posters, or people</li>
                    <li>No harsh shadows</li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1.5">
                    <CheckCircleIcon className="w-3.5 h-3.5 text-blue-600" />
                    Technical Requirements
                  </h4>
                  <ul className="text-xs text-gray-600 space-y-1 pl-5 list-disc">
                    <li>
                      Resolution: Minimum 720p, recommended 1080p or higher
                    </li>
                    <li>Format: JPG or PNG</li>
                    <li>File size: Up to 10 MB</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Audio Requirements */}
            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-center gap-2 mb-2">
                <MicrophoneIcon className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">
                  Audio Requirements
                </h3>
              </div>
              <div className="space-y-3 pl-2">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1.5">
                    <CheckCircleIcon className="w-3.5 h-3.5 text-blue-600" />
                    Duration & Format
                  </h4>
                  <ul className="text-xs text-gray-600 space-y-1 pl-5 list-disc">
                    <li>
                      <strong>Up to 5 audio files</strong>
                    </li>
                    <li>
                      <strong>Minimum 1 minute per file</strong>
                    </li>
                    <li>Audio Format: WAV, MP3, M4A, MP4, OGG, or WebM (WhatsApp voice notes supported)</li>
                    <li>Quality: 44.1 kHz or above</li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1.5">
                    <CheckCircleIcon className="w-3.5 h-3.5 text-blue-600" />
                    Recording Environment
                  </h4>
                  <p className="text-xs text-gray-600 mb-1">
                    Doctor must record in:
                  </p>
                  <ul className="text-xs text-gray-600 space-y-1 pl-5 list-disc">
                    <li>A quiet room</li>
                    <li>No background noise (traffic, fans, patients)</li>
                    <li>No echo</li>
                    <li>Phone kept 15–20 cm from mouth</li>
                    <li>Avoid movement while recording</li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1.5">
                    <CheckCircleIcon className="w-3.5 h-3.5 text-blue-600" />
                    Recording Script
                  </h4>
                  <p className="text-xs text-gray-600 mb-1">Doctor may read:</p>
                  <ul className="text-xs text-gray-600 space-y-1 pl-5 list-disc">
                    <li>
                      Anything in desired language for 2-minute natural
                      conversational audio
                    </li>
                  </ul>
                  <p className="text-xs text-gray-600 mt-2">Script must:</p>
                  <ul className="text-xs text-gray-600 space-y-1 pl-5 list-disc">
                    <li>Not include any patient data</li>
                    <li>Not include brand claims beyond approved script</li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-1.5">
                    <ExclamationCircleIcon className="w-3.5 h-3.5 text-red-500" />
                    Audio Rejection Reasons
                  </h4>
                  <ul className="text-xs text-gray-600 space-y-1 pl-5 list-disc">
                    <li>Background noise</li>
                    <li>Distortion</li>
                    <li>Wind or echo</li>
                    <li>Too short (&lt;2 minutes)</li>
                    <li>Wrong format</li>
                    <li>Unclear speech</li>
                    <li>Incomplete script</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Note */}
            <div className="pt-4 border-t">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-medium text-gray-800">
                  <strong>Note:</strong> Sun Pharma allows max {MAX_LANGUAGES}{" "}
                  language selections for the generated video.
                </p>
              </div>
            </div>

            {/* Consent Info */}
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-xs text-gray-700">
                <strong>Consent Process:</strong> After submission, an OTP will
                be sent to the doctor's email for consent verification. The
                doctor must verify consent for:
              </p>
              <ul className="text-xs text-gray-600 mt-1 pl-4 list-disc">
                <li>Use of image</li>
                <li>Use of voice</li>
                <li>Voice cloning</li>
                <li>Public distribution of video</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
