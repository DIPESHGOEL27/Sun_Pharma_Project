import { useState, useEffect } from "react";
import {
  useParams,
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import toast from "react-hot-toast";
import {
  submissionsApi,
  voiceApi,
  consentApi,
  storageApi,
  qcApi,
} from "../services/api";
import {
  ArrowLeftIcon,
  PhotoIcon,
  MicrophoneIcon,
  MusicalNoteIcon,
  VideoCameraIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  PlayIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  GlobeAltIcon,
  TrashIcon,
  LanguageIcon,
} from "@heroicons/react/24/outline";

const LANGUAGE_NAMES = {
  en: "English",
  hi: "Hindi",
  mr: "Marathi",
  gu: "Gujarati",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  pa: "Punjabi",
  or: "Odia",
};

export default function SubmissionDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedLang = searchParams.get("lang");

  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState(null);
  const [actionLoading, setActionLoading] = useState("");
  const [adminRole] = useState(sessionStorage.getItem("adminRole") || "admin");
  const [finalVideoFile, setFinalVideoFile] = useState(null);
  const [finalUploadProgress, setFinalUploadProgress] = useState(0);
  const [editorAction, setEditorAction] = useState("");
  const [editorNotes, setEditorNotes] = useState("");
  const [languageStatus, setLanguageStatus] = useState(null);
  const [perLanguageVideoFiles, setPerLanguageVideoFiles] = useState({});
  const [perLanguageUploadProgress, setPerLanguageUploadProgress] = useState(
    {},
  );

  // Get the current language data
  const currentLanguageData = languageStatus?.languages?.find(
    (l) => l.language_code === selectedLang,
  );

  const handleLanguageChange = (langCode) => {
    setSearchParams({ lang: langCode });
  };

  // Download file using signed URL (for GCS files that aren't public)
  const handleDownload = async (gcsPath, fileName) => {
    if (!gcsPath) {
      toast.error("No file path available");
      return;
    }
    
    try {
      toast.loading("Generating download link...", { id: "download" });
      const response = await storageApi.getSignedDownloadUrl(gcsPath);
      toast.dismiss("download");
      
      // Open the signed URL in a new tab
      window.open(response.data.downloadUrl, "_blank");
    } catch (error) {
      toast.dismiss("download");
      console.error("Error getting download URL:", error);
      toast.error("Failed to generate download link");
    }
  };

  // Component to render audio preview with signed URL
  const AudioPreviewWithSignedUrl = ({ audio, idx }) => {
    const [audioUrl, setAudioUrl] = useState(null);
    const [loadingUrl, setLoadingUrl] = useState(true);

    useEffect(() => {
      const fetchSignedUrl = async () => {
        if (audio.gcsPath) {
          try {
            const response = await storageApi.getSignedDownloadUrl(audio.gcsPath);
            setAudioUrl(response.data.downloadUrl);
          } catch (error) {
            console.error("Error fetching signed URL for audio:", error);
            // Fallback to publicUrl if signed URL fails
            setAudioUrl(audio.publicUrl);
          }
        } else if (audio.publicUrl) {
          setAudioUrl(audio.publicUrl);
        }
        setLoadingUrl(false);
      };
      fetchSignedUrl();
    }, [audio.gcsPath, audio.publicUrl]);

    if (loadingUrl) {
      return (
        <div className="space-y-1">
          <div className="text-sm font-medium text-gray-700">
            {audio.filename || `Audio ${idx + 1}`}
          </div>
          <div className="h-12 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-sm">
            Loading audio...
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <div className="text-sm font-medium text-gray-700">
          {audio.filename || `Audio ${idx + 1}`}
        </div>
        {audioUrl ? (
          <audio controls className="w-full">
            <source src={audioUrl} />
          </audio>
        ) : (
          <div className="h-12 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-sm">
            Audio unavailable
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    loadSubmission();
  }, [id]);

  useEffect(() => {
    if (submission?.id) {
      loadLanguageStatus();
    }
  }, [submission?.id]);

  const loadSubmission = async () => {
    try {
      const response = await submissionsApi.get(id);
      setSubmission(response.data);
    } catch (error) {
      console.error("Error loading submission:", error);
      toast.error("Failed to load submission");
      navigate("/admin/submissions");
    } finally {
      setLoading(false);
    }
  };

  const loadLanguageStatus = async () => {
    try {
      const response = await submissionsApi.getLanguages(id);
      setLanguageStatus(response.data);
    } catch (error) {
      console.error("Error loading language status:", error);
    }
  };

  const handleSendConsent = async () => {
    setActionLoading("consent");
    try {
      await consentApi.sendOtp(id);
      toast.success("Consent email sent!");
      loadSubmission();
    } catch (error) {
      toast.error(
        error.response?.data?.error || "Failed to send consent email",
      );
    } finally {
      setActionLoading("");
    }
  };

  const handleCloneVoice = async () => {
    setActionLoading("clone");
    try {
      await voiceApi.clone(id);
      toast.success("Voice cloning started!");
      loadSubmission();
    } catch (error) {
      toast.error(
        error.response?.data?.error || "Failed to start voice cloning",
      );
    } finally {
      setActionLoading("");
    }
  };

  const handleProcessVoice = async () => {
    setActionLoading("process");
    try {
      await voiceApi.process(id);
      toast.success("Voice processed and audio generation started/completed");
      loadSubmission();
    } catch (error) {
      toast.error(
        error.response?.data?.error || "Failed to process voice pipeline",
      );
    } finally {
      setActionLoading("");
    }
  };

  const handleGenerateAudio = async () => {
    setActionLoading("audio");
    try {
      await voiceApi.speechToSpeech(id);
      toast.success("Audio generation started!");
      loadSubmission();
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to generate audio");
    } finally {
      setActionLoading("");
    }
  };

  const handleDeleteVoice = async () => {
    if (!window.confirm("Are you sure you want to delete the cloned voice?"))
      return;

    setActionLoading("delete");
    try {
      await voiceApi.delete(id);
      toast.success("Voice deleted from ElevenLabs");
      loadSubmission();
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to delete voice");
    } finally {
      setActionLoading("");
    }
  };

  const handleFinalVideoUpload = async () => {
    if (!submission?.id) return;
    if (!finalVideoFile) {
      toast.error("Please select a final video file");
      return;
    }

    setActionLoading("final-upload");
    try {
      const { data } = await storageApi.getFinalVideoUploadUrl(
        submission.id,
        finalVideoFile,
      );

      await storageApi.uploadToGCS(
        data.uploadUrl,
        finalVideoFile,
        (percent) => {
          setFinalUploadProgress(percent);
        },
      );

      await submissionsApi.saveFinalVideo(submission.id, {
        gcsPath: data.gcsPath,
        publicUrl: data.publicUrl,
        uploadedBy: adminRole,
        filename: finalVideoFile.name,
      });

      toast.success("Final video uploaded");
      setFinalUploadProgress(0);
      setFinalVideoFile(null);
      loadSubmission();
    } catch (error) {
      toast.error(
        error.response?.data?.error || "Failed to upload final video",
      );
    } finally {
      setActionLoading("");
    }
  };

  const handleEditorAction = async () => {
    if (!submission?.id) return;
    if (!editorAction) {
      toast.error("Select an editor action");
      return;
    }

    setActionLoading("editor-action");
    try {
      if (editorAction === "approve") {
        await qcApi.approve(submission.id, adminRole, editorNotes);
        toast.success("Submission approved");
      } else if (editorAction === "reupload") {
        await qcApi.requestChanges(
          submission.id,
          adminRole,
          ["Re-upload final video"],
          editorNotes || "Re-upload final video",
        );
        toast.success("Re-upload requested");
      } else if (editorAction === "regenerate") {
        await qcApi.requestChanges(
          submission.id,
          adminRole,
          ["Regenerate final video"],
          editorNotes || "Regenerate final video",
        );
        toast.success("Regeneration requested");
      }

      setEditorAction("");
      setEditorNotes("");
      loadSubmission();
    } catch (error) {
      toast.error(
        error.response?.data?.error || "Failed to update submission status",
      );
    } finally {
      setActionLoading("");
    }
  };

  // Per-language video upload handler
  const handleLanguageVideoUpload = async (languageCode) => {
    const file = perLanguageVideoFiles[languageCode];
    if (!file) {
      toast.error(
        `Please select a video file for ${languageCode.toUpperCase()}`,
      );
      return;
    }

    setActionLoading(`upload-${languageCode}`);
    setPerLanguageUploadProgress((prev) => ({ ...prev, [languageCode]: 0 }));

    try {
      // Get signed URL for upload
      const { data } = await storageApi.getSignedUploadUrl(
        file.name,
        file.type,
        "GENERATED_VIDEOS",
        `${submission.id}/${languageCode}`,
      );

      // Upload to GCS
      await storageApi.uploadToGCS(data.uploadUrl, file, (percent) => {
        setPerLanguageUploadProgress((prev) => ({
          ...prev,
          [languageCode]: percent,
        }));
      });

      // Register the video in the backend
      await submissionsApi.saveLanguageVideo(submission.id, languageCode, {
        gcsPath: data.gcsPath,
        publicUrl: data.publicUrl,
        uploadedBy: adminRole,
        duration_seconds: null, // Could extract from video if needed
      });

      toast.success(`Video uploaded for ${languageCode.toUpperCase()}`);
      setPerLanguageVideoFiles((prev) => ({ ...prev, [languageCode]: null }));
      setPerLanguageUploadProgress((prev) => ({ ...prev, [languageCode]: 0 }));
      loadSubmission();
      loadLanguageStatus();
    } catch (error) {
      toast.error(
        error.response?.data?.error ||
          `Failed to upload video for ${languageCode}`,
      );
    } finally {
      setActionLoading("");
    }
  };

  // Per-language QC approve handler
  const handleApproveLanguage = async (
    languageCode,
    approveAudio,
    approveVideo,
  ) => {
    setActionLoading(`approve-${languageCode}`);
    try {
      await qcApi.approveLanguage(submission.id, languageCode, {
        approve_audio: approveAudio,
        approve_video: approveVideo,
        reviewer_name: adminRole,
        notes: `Approved by ${adminRole}`,
      });
      toast.success(`${languageCode.toUpperCase()} approved`);
      loadSubmission();
      loadLanguageStatus();
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to approve");
    } finally {
      setActionLoading("");
    }
  };

  // Per-language QC reject handler
  const handleRejectLanguage = async (
    languageCode,
    rejectAudio,
    rejectVideo,
    reason,
  ) => {
    if (!reason) {
      toast.error("Please provide a rejection reason");
      return;
    }
    setActionLoading(`reject-${languageCode}`);
    try {
      await qcApi.rejectLanguage(submission.id, languageCode, {
        reject_audio: rejectAudio,
        reject_video: rejectVideo,
        reviewer_name: adminRole,
        rejection_reason: reason,
      });
      toast.success(`${languageCode.toUpperCase()} rejected`);
      loadSubmission();
      loadLanguageStatus();
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to reject");
    } finally {
      setActionLoading("");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-sunpharma-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!submission) {
    return <div className="text-center py-12">Submission not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-4 flex-1">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Go back"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                Submission #{submission.id}
              </h1>
              {selectedLang && (
                <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-sm font-medium">
                  {LANGUAGE_NAMES[selectedLang] || selectedLang.toUpperCase()}
                </span>
              )}
            </div>
            <p className="text-gray-500">
              Created {new Date(submission.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge
            status={
              selectedLang && currentLanguageData
                ? currentLanguageData.status
                : submission.status
            }
            large
          />
        </div>
      </div>

      {/* Language Selector */}
      {submission.selected_languages?.length > 0 && (
        <div className="card bg-blue-50 border border-blue-200">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <LanguageIcon className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-blue-900">
                Select Language:
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {submission.selected_languages.map((lang) => {
                const langData = languageStatus?.languages?.find(
                  (l) => l.language_code === lang,
                );
                const isActive = selectedLang === lang;
                return (
                  <button
                    key={lang}
                    onClick={() => handleLanguageChange(lang)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                      isActive
                        ? "bg-blue-600 text-white shadow-md"
                        : "bg-white text-blue-800 border border-blue-300 hover:bg-blue-100"
                    }`}
                  >
                    {LANGUAGE_NAMES[lang] || lang.toUpperCase()}
                    {langData && (
                      <span
                        className={`w-2 h-2 rounded-full ${
                          langData.status === "completed" ||
                          langData.qc_status === "approved"
                            ? "bg-green-400"
                            : langData.status === "processing"
                              ? "bg-yellow-400 animate-pulse"
                              : langData.status === "failed" ||
                                  langData.qc_status === "rejected"
                                ? "bg-red-400"
                                : "bg-gray-300"
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          {!selectedLang && (
            <p className="mt-3 text-sm text-blue-700">
              ⚠️ Please select a language to view and manage its specific
              pipeline status.
            </p>
          )}
        </div>
      )}

      {/* Language-Specific Status Card */}
      {selectedLang && currentLanguageData && (
        <div className="card border-2 border-blue-300">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <GlobeAltIcon className="w-5 h-5 text-blue-600" />
            {LANGUAGE_NAMES[selectedLang]} Pipeline Status
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-500">Status</div>
              <div className="mt-1">
                <StatusBadge status={currentLanguageData.status} />
              </div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-500">Audio</div>
              <div
                className={`mt-1 font-medium ${currentLanguageData.audio_complete ? "text-green-600" : currentLanguageData.audio?.status === "processing" ? "text-yellow-600" : "text-gray-400"}`}
              >
                {currentLanguageData.audio_complete 
                  ? "✓ Completed" 
                  : currentLanguageData.audio?.status === "processing" 
                    ? "⟳ Processing" 
                    : currentLanguageData.audio?.status === "failed"
                      ? "✗ Failed"
                      : "Pending"}
              </div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-500">Video</div>
              <div
                className={`mt-1 font-medium ${currentLanguageData.video_complete ? "text-green-600" : currentLanguageData.video?.status === "processing" ? "text-yellow-600" : "text-gray-400"}`}
              >
                {currentLanguageData.video_complete 
                  ? "✓ Completed" 
                  : currentLanguageData.video?.status === "processing" 
                    ? "⟳ Processing" 
                    : currentLanguageData.video?.status === "failed"
                      ? "✗ Failed"
                      : "Pending"}
              </div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-500">QC Status</div>
              <div className="mt-1">
                <QCStatusBadge status={currentLanguageData.qc_status} />
              </div>
            </div>
          </div>

          {/* Quick media links for selected language */}
          <div className="flex flex-wrap gap-3">
            {currentLanguageData.audio_complete && (currentLanguageData.audio?.gcs_path || currentLanguageData.audio?.public_url) && (
              <button
                onClick={() => handleDownload(
                  currentLanguageData.audio.gcs_path || currentLanguageData.audio.public_url,
                  `audio_${selectedLang}.wav`
                )}
                className="btn btn-outline text-indigo-600 border-indigo-300 hover:bg-indigo-50 flex items-center gap-2"
              >
                <MusicalNoteIcon className="w-4 h-4" />
                Download Audio
              </button>
            )}
            {currentLanguageData.video_complete && (currentLanguageData.video?.gcs_path || currentLanguageData.video?.public_url) && (
              <button
                onClick={() => handleDownload(
                  currentLanguageData.video.gcs_path || currentLanguageData.video.public_url,
                  `video_${selectedLang}.mp4`
                )}
                className="btn btn-outline text-green-600 border-green-300 hover:bg-green-50 flex items-center gap-2"
              >
                <VideoCameraIcon className="w-4 h-4" />
                Download Video
              </button>
            )}
          </div>
        </div>
      )}

      {/* Final Video Download - Admin Only (Top Section) */}
      {adminRole === "admin" && submission.final_video_url && (
        <div className="card bg-green-50 border border-green-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <VideoCameraIcon className="w-8 h-8 text-green-600" />
              <div>
                <h3 className="font-semibold text-green-900">
                  Final Video Available
                </h3>
                <p className="text-sm text-green-700">
                  Ready for download and distribution
                </p>
              </div>
            </div>
            <button
              onClick={() => handleDownload(
                submission.final_video_gcs_path || submission.final_video_url,
                `final_video_${submission.id}.mp4`
              )}
              className="btn-primary bg-green-600 hover:bg-green-700"
            >
              Download Final Video
            </button>
          </div>
        </div>
      )}

      {/* Progress Pipeline */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">
          Processing Pipeline
        </h3>
        <div className="flex items-center justify-between">
          <PipelineStep
            label="Consent"
            status={
              submission.consent_status === "verified"
                ? "completed"
                : submission.consent_status === "otp_sent"
                  ? "in_progress"
                  : "pending"
            }
            icon={CheckCircleIcon}
          />
          <PipelineConnector
            active={submission.consent_status === "verified"}
          />
          <PipelineStep
            label="Voice Clone"
            subtitle="+ Audio Gen"
            status={
              submission.generated_audio?.some((a) => a.status === "completed")
                ? "completed"
                : submission.voice_clone_status === "completed"
                  ? "completed"
                  : submission.voice_clone_status === "in_progress" ||
                      submission.generated_audio?.some(
                        (a) => a.status === "processing",
                      )
                    ? "in_progress"
                    : submission.voice_clone_status === "failed"
                      ? "failed"
                      : "pending"
            }
            icon={MicrophoneIcon}
          />
          <PipelineConnector
            active={submission.generated_audio?.some(
              (a) => a.status === "completed",
            )}
          />
          <PipelineStep
            label="Video Gen"
            status={
              submission.final_video_url
                ? "completed"
                : submission.generated_audio?.some(
                      (a) => a.status === "completed",
                    )
                  ? "in_progress"
                  : "pending"
            }
            icon={VideoCameraIcon}
          />
          <PipelineConnector active={!!submission.final_video_url} />
          <PipelineStep
            label="QC Review"
            status={
              submission.qc_status === "approved"
                ? "completed"
                : submission.qc_status === "in_review"
                  ? "in_progress"
                  : submission.qc_status === "rejected"
                    ? "failed"
                    : "pending"
            }
            icon={ClockIcon}
          />
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Doctor Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Doctor Details */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4">
              Doctor Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Full Name" value={submission.doctor_name} />
              <InfoRow label="Email" value={submission.doctor_email} />
              <InfoRow label="Phone" value={submission.doctor_phone} />
              <InfoRow label="Specialty" value={submission.specialty} />
              <InfoRow
                label="Years of Practice"
                value={submission.years_of_practice}
              />
              <InfoRow label="Clinic" value={submission.clinic_name} />
              <InfoRow label="MR Name" value={submission.mr_name} />
              <InfoRow label="MR Code" value={submission.mr_code} />
            </div>
          </div>

          {/* Languages */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4">
              Selected Languages
            </h3>
            <div className="flex flex-wrap gap-2">
              {submission.selected_languages?.map((lang) => (
                <span
                  key={lang}
                  className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                >
                  {lang.toUpperCase()}
                </span>
              ))}
            </div>
          </div>

          {/* Per-Language Status and Actions */}
          {languageStatus && languageStatus.languages?.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <GlobeAltIcon className="w-5 h-5" />
                Per-Language Status
              </h3>

              {/* Summary */}
              <div className="grid grid-cols-4 gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {languageStatus.summary?.total_languages || 0}
                  </div>
                  <div className="text-xs text-gray-500">Total Languages</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {languageStatus.summary?.audio_completed || 0}
                  </div>
                  <div className="text-xs text-gray-500">Audio Ready</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {languageStatus.summary?.videos_completed || 0}
                  </div>
                  <div className="text-xs text-gray-500">Videos Ready</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-600">
                    {languageStatus.summary?.ready_for_qc || 0}
                  </div>
                  <div className="text-xs text-gray-500">Ready for QC</div>
                </div>
              </div>

              {/* Per-language details */}
              <div className="space-y-4">
                {languageStatus.languages.map((lang) => (
                  <LanguageStatusCard
                    key={lang.language_code}
                    lang={lang}
                    adminRole={adminRole}
                    submissionId={submission.id}
                    actionLoading={actionLoading}
                    perLanguageVideoFiles={perLanguageVideoFiles}
                    perLanguageUploadProgress={perLanguageUploadProgress}
                    setPerLanguageVideoFiles={setPerLanguageVideoFiles}
                    onUpload={handleLanguageVideoUpload}
                    onApprove={handleApproveLanguage}
                    onReject={handleRejectLanguage}
                    onDownload={handleDownload}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Validations */}
          {(submission.validations?.image || submission.validations?.audio) && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-4">
                Validation Results
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {submission.validations?.image && (
                  <ValidationCard
                    title="Image Validation"
                    isValid={submission.validations.image.is_valid}
                    checks={submission.validations.image}
                  />
                )}
                {submission.validations?.audio && (
                  <ValidationCard
                    title="Audio Validation"
                    isValid={submission.validations.audio.is_valid}
                    checks={submission.validations.audio}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Actions & Files */}
        <div className="space-y-6">
          {/* Quick Actions - Hidden for viewers */}
          {adminRole !== "viewer" && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-4">Actions</h3>
              <div className="space-y-3">
                <button
                  onClick={handleProcessVoice}
                  disabled={actionLoading === "process"}
                  className="w-full btn-primary justify-center disabled:opacity-50"
                >
                  {actionLoading === "process" ? (
                    <span className="flex items-center gap-2">
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      Processing Voice...
                    </span>
                  ) : submission.elevenlabs_voice_id ? (
                    "Regenerate Audio (All Languages)"
                  ) : (
                    "Process Voice (Clone + Generate Audio)"
                  )}
                </button>

                {submission.consent_status !== "verified" && (
                  <button
                    onClick={handleSendConsent}
                    disabled={actionLoading === "consent"}
                    className="w-full btn-primary justify-center disabled:opacity-50"
                  >
                    {actionLoading === "consent" ? (
                      <span className="flex items-center gap-2">
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        Sending...
                      </span>
                    ) : (
                      "Send Consent Email"
                    )}
                  </button>
                )}

                {submission.elevenlabs_voice_id && (
                  <button
                    onClick={handleDeleteVoice}
                    disabled={actionLoading === "delete"}
                    className="w-full btn-danger justify-center disabled:opacity-50"
                  >
                    {actionLoading === "delete"
                      ? "Deleting..."
                      : "Delete Cloned Voice"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Image Preview */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2 justify-between">
              <span className="flex items-center gap-2">
                <PhotoIcon className="w-5 h-5" />
                Doctor Photo
              </span>
              {(submission.image_gcs_path ||
                submission.image_url ||
                submission.image_path) && (
                <button
                  onClick={() => handleDownload(
                    submission.image_gcs_path || submission.image_url,
                    `doctor_photo_${submission.id}.jpg`
                  )}
                  className="text-xs text-sunpharma-blue hover:underline"
                >
                  Download
                </button>
              )}
            </h3>
            {submission.image_url ||
            submission.image_gcs_path ||
            submission.image_path ? (
              <img
                src={
                  submission.image_url ||
                  submission.image_gcs_path ||
                  `/api/uploads/image/${submission.image_path
                    ?.split("/")
                    .pop()}`
                }
                alt="Doctor"
                className="w-full rounded-lg"
                onError={(e) => {
                  e.target.style.display = "none";
                  e.target.nextSibling.style.display = "flex";
                }}
              />
            ) : (
              <div className="h-48 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                No image uploaded
              </div>
            )}
            <div className="hidden h-48 bg-gray-100 rounded-lg items-center justify-center text-gray-400">
              Image not accessible
            </div>
          </div>

          {/* Audio Sample */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2 justify-between">
              <span className="flex items-center gap-2">
                <MicrophoneIcon className="w-5 h-5" />
                Voice Sample
              </span>
              {submission.audio_files?.length > 0 &&
                (submission.audio_files[0].gcsPath || submission.audio_files[0].publicUrl) && (
                  <button
                    onClick={() => handleDownload(
                      submission.audio_files[0].gcsPath || submission.audio_files[0].publicUrl,
                      `voice_sample_${submission.id}.wav`
                    )}
                    className="text-xs text-sunpharma-blue hover:underline"
                  >
                    Download
                  </button>
                )}
            </h3>
            {submission.audio_files?.length > 0 ? (
              <div className="space-y-3">
                {submission.audio_files.map((audio, idx) => (
                  <AudioPreviewWithSignedUrl
                    key={audio.gcsPath || audio.publicUrl || idx}
                    audio={audio}
                    idx={idx}
                  />
                ))}
              </div>
            ) : (
              <div className="h-24 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                No audio uploaded
              </div>
            )}
          </div>

          {/* Final Video & Editor Actions - Editor Only */}
          {adminRole === "editor" && (
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <VideoCameraIcon className="w-5 h-5" />
                  Upload Final Video
                </h3>
                {submission.final_video_url && (
                  <button
                    onClick={() => handleDownload(
                      submission.final_video_gcs_path || submission.final_video_url,
                      `final_video_${submission.id}.mp4`
                    )}
                    className="text-xs text-sunpharma-blue hover:underline"
                  >
                    View Current
                  </button>
                )}
              </div>

              {submission.final_video_url ? (
                <p className="text-sm text-gray-600">
                  Final video uploaded. You can replace it by uploading a new
                  file below.
                </p>
              ) : (
                <p className="text-sm text-gray-600">
                  No final video uploaded yet. Upload the edited video here.
                </p>
              )}

              <div className="space-y-2">
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) =>
                    setFinalVideoFile(e.target.files?.[0] || null)
                  }
                  className="block w-full text-sm text-gray-600"
                />
                {finalUploadProgress > 0 && (
                  <div className="text-xs text-gray-500">
                    Uploading... {finalUploadProgress}%
                  </div>
                )}
                <button
                  onClick={handleFinalVideoUpload}
                  disabled={!finalVideoFile || actionLoading === "final-upload"}
                  className="btn-primary w-full justify-center disabled:opacity-50"
                >
                  {actionLoading === "final-upload"
                    ? "Uploading..."
                    : "Upload Final Video"}
                </button>
              </div>
            </div>
          )}

          {/* QC Actions - Admin Only */}
          {adminRole === "admin" && (
            <div className="card space-y-4">
              <h3 className="font-semibold text-gray-900">QC Actions</h3>
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">Action</div>
                <select
                  value={editorAction}
                  onChange={(e) => setEditorAction(e.target.value)}
                  className="input w-full"
                >
                  <option value="">Select action</option>
                  <option value="approve">Approve</option>
                  <option value="reupload">Request Re-upload</option>
                  <option value="regenerate">Request Regeneration</option>
                </select>
                <textarea
                  value={editorNotes}
                  onChange={(e) => setEditorNotes(e.target.value)}
                  rows={3}
                  className="w-full p-3 border border-gray-200 rounded-lg text-sm"
                  placeholder="Notes (optional)"
                />
                <button
                  onClick={handleEditorAction}
                  disabled={!editorAction || actionLoading === "editor-action"}
                  className="btn-secondary w-full justify-center disabled:opacity-50"
                >
                  {actionLoading === "editor-action"
                    ? "Applying..."
                    : "Apply QC Action"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value || "-"}</dd>
    </div>
  );
}

function StatusBadge({ status, large }) {
  const config = {
    draft: { label: "Draft", class: "bg-gray-100 text-gray-700" },
    pending_consent: {
      label: "Pending Consent",
      class: "bg-yellow-100 text-yellow-800",
    },
    consent_verified: {
      label: "Consent Verified",
      class: "bg-blue-100 text-blue-800",
    },
    processing: { label: "Processing", class: "bg-purple-100 text-purple-800" },
    pending_qc: { label: "Pending QC", class: "bg-amber-100 text-amber-800" },
    qc_approved: { label: "QC Approved", class: "bg-green-100 text-green-800" },
    qc_rejected: { label: "QC Rejected", class: "bg-red-100 text-red-800" },
    completed: { label: "Completed", class: "bg-emerald-100 text-emerald-800" },
    failed: { label: "Failed", class: "bg-red-100 text-red-800" },
  };
  const c = config[status] || {
    label: status,
    class: "bg-gray-100 text-gray-700",
  };
  return (
    <span
      className={`inline-flex px-3 py-1 ${
        large ? "text-sm" : "text-xs"
      } font-medium rounded-full ${c.class}`}
    >
      {c.label}
    </span>
  );
}

function VoiceStatusBadge({ status }) {
  const config = {
    pending: { label: "Pending", class: "text-gray-600" },
    in_progress: { label: "In Progress", class: "text-blue-600" },
    completed: { label: "Completed", class: "text-green-600" },
    failed: { label: "Failed", class: "text-red-600" },
    deleted: { label: "Deleted", class: "text-gray-400" },
  };
  const c = config[status] || {
    label: status || "Unknown",
    class: "text-gray-600",
  };
  return <span className={`font-medium ${c.class}`}>{c.label}</span>;
}

function AudioStatusBadge({ status }) {
  const config = {
    pending: { label: "Pending", class: "bg-gray-100 text-gray-700" },
    processing: { label: "Processing", class: "bg-blue-100 text-blue-800" },
    completed: { label: "Completed", class: "bg-green-100 text-green-800" },
    failed: { label: "Failed", class: "bg-red-100 text-red-800" },
  };
  const c = config[status] || {
    label: status,
    class: "bg-gray-100 text-gray-700",
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${c.class}`}>
      {c.label}
    </span>
  );
}

function PipelineStep({ label, subtitle, status, icon: Icon }) {
  const colors = {
    pending: "bg-gray-100 text-gray-400",
    in_progress: "bg-blue-100 text-blue-600 animate-pulse",
    completed: "bg-green-100 text-green-600",
    failed: "bg-red-100 text-red-600",
  };
  return (
    <div className="flex flex-col items-center">
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center ${colors[status]}`}
      >
        <Icon className="w-6 h-6" />
      </div>
      <span className="text-xs mt-2 text-gray-600 text-center">{label}</span>
      {subtitle && (
        <span className="text-[10px] text-gray-400">{subtitle}</span>
      )}
    </div>
  );
}

function PipelineConnector({ active }) {
  return (
    <div
      className={`flex-1 h-1 mx-2 rounded ${
        active ? "bg-green-400" : "bg-gray-200"
      }`}
    />
  );
}

function ValidationCard({ title, isValid, checks }) {
  return (
    <div className={`p-4 rounded-lg ${isValid ? "bg-green-50" : "bg-red-50"}`}>
      <div className="flex items-center gap-2 mb-2">
        {isValid ? (
          <CheckCircleIcon className="w-5 h-5 text-green-600" />
        ) : (
          <XCircleIcon className="w-5 h-5 text-red-600" />
        )}
        <span
          className={`font-medium ${
            isValid ? "text-green-800" : "text-red-800"
          }`}
        >
          {title}
        </span>
      </div>
      <p className={`text-sm ${isValid ? "text-green-700" : "text-red-700"}`}>
        {isValid ? "All checks passed" : "Validation issues found"}
      </p>
    </div>
  );
}

// Processing status badge (for audio/video generation status)
function ProcessingStatusBadge({ status }) {
  const config = {
    pending: { label: "Pending", class: "bg-gray-100 text-gray-700", icon: ClockIcon },
    processing: { label: "Processing", class: "bg-yellow-100 text-yellow-800 animate-pulse", icon: ArrowPathIcon },
    completed: { label: "Completed", class: "bg-green-100 text-green-800", icon: CheckCircleIcon },
    failed: { label: "Failed", class: "bg-red-100 text-red-800", icon: XCircleIcon },
  };
  const c = config[status] || config.pending;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${c.class}`}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}

function LanguageStatusCard({
  lang,
  adminRole,
  submissionId,
  actionLoading,
  perLanguageVideoFiles,
  perLanguageUploadProgress,
  setPerLanguageVideoFiles,
  onUpload,
  onApprove,
  onReject,
  onDownload,
}) {
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  const langCode = lang.language_code;
  const audioComplete = lang.audio_complete;
  const videoComplete = lang.video_complete;
  const readyForQC = lang.ready_for_qc;

  // Get overall status for the language
  const getOverallStatus = () => {
    if (!lang.audio) return { label: "Pending", class: "bg-gray-100 text-gray-600" };
    if (lang.audio?.status === "processing") return { label: "Processing Audio", class: "bg-yellow-100 text-yellow-700" };
    if (lang.audio?.status === "failed") return { label: "Audio Failed", class: "bg-red-100 text-red-700" };
    if (audioComplete && !lang.video) return { label: "Audio Ready", class: "bg-blue-100 text-blue-700" };
    if (lang.video?.status === "processing") return { label: "Processing Video", class: "bg-yellow-100 text-yellow-700" };
    if (lang.video?.status === "failed") return { label: "Video Failed", class: "bg-red-100 text-red-700" };
    if (readyForQC) return { label: "Ready for QC", class: "bg-green-100 text-green-700" };
    return { label: "In Progress", class: "bg-blue-100 text-blue-600" };
  };

  const overallStatus = getOverallStatus();

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-lg">
            {langCode.toUpperCase()}
          </span>
          <span className={`px-2 py-0.5 text-xs rounded-full ${overallStatus.class}`}>
            {overallStatus.label}
          </span>
        </div>
      </div>

      {/* Audio & Video Status */}
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div className="p-3 bg-gray-50 rounded">
          <div className="flex items-center gap-2 mb-2">
            <MusicalNoteIcon className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium">Audio</span>
          </div>
          {lang.audio ? (
            <div className="space-y-2">
              <ProcessingStatusBadge status={lang.audio.status} />
              {lang.audio.audio_master_name && (
                <div className="text-xs text-gray-500">
                  Master: {lang.audio.audio_master_name}
                </div>
              )}
              {(lang.audio.gcs_path || lang.audio.public_url) && lang.audio.status === "completed" && (
                <button
                  onClick={() => onDownload(
                    lang.audio.gcs_path || lang.audio.public_url,
                    `audio_${lang.language_code}.wav`
                  )}
                  className="text-xs text-blue-600 hover:underline block"
                >
                  Download Audio
                </button>
              )}
              {lang.audio.error_message && (
                <div className="text-xs text-red-500">
                  Error: {lang.audio.error_message}
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-400">Not generated</span>
          )}
        </div>

        {/* Video Status */}
        <div className="p-3 bg-gray-50 rounded">
          <div className="flex items-center gap-2 mb-2">
            <VideoCameraIcon className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium">Video</span>
          </div>
          {lang.video ? (
            <div className="space-y-2">
              <ProcessingStatusBadge status={lang.video.status} />
              {(lang.video.gcs_path || lang.video.public_url) && lang.video.status === "completed" && (
                <button
                  onClick={() => onDownload(
                    lang.video.gcs_path || lang.video.public_url,
                    `video_${lang.language_code}.mp4`
                  )}
                  className="text-xs text-purple-600 hover:underline block"
                >
                  Download Video
                </button>
              )}
              {lang.video.error_message && (
                <div className="text-xs text-red-500">
                  Error: {lang.video.error_message}
                </div>
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-400">Not uploaded</span>
          )}
        </div>
      </div>

      {/* Editor: Video Upload */}
      {adminRole === "editor" && audioComplete && (
        <div className="border-t pt-3 mt-3">
          <div className="text-sm font-medium mb-2">
            Upload Video for {langCode.toUpperCase()}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="video/*"
              onChange={(e) =>
                setPerLanguageVideoFiles((prev) => ({
                  ...prev,
                  [langCode]: e.target.files?.[0] || null,
                }))
              }
              className="text-xs flex-1"
            />
            <button
              onClick={() => onUpload(langCode)}
              disabled={
                !perLanguageVideoFiles[langCode] ||
                actionLoading === `upload-${langCode}`
              }
              className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {actionLoading === `upload-${langCode}`
                ? `${perLanguageUploadProgress[langCode] || 0}%`
                : "Upload"}
            </button>
          </div>
        </div>
      )}

      {/* Admin: QC Actions */}
      {adminRole === "admin" && readyForQC && (
        <div className="border-t pt-3 mt-3">
          <div className="text-sm font-medium mb-2">QC Actions</div>

          {!showRejectForm ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onApprove(langCode, true, true)}
                disabled={actionLoading === `approve-${langCode}`}
                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
              >
                <CheckCircleIcon className="w-4 h-4" />
                {actionLoading === `approve-${langCode}`
                  ? "Approving..."
                  : "Approve Both"}
              </button>
              <button
                onClick={() => setShowRejectForm(true)}
                className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                Reject
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Rejection reason (required)"
                className="w-full p-2 text-sm border rounded"
                rows={2}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onReject(langCode, true, true, rejectReason);
                    setShowRejectForm(false);
                    setRejectReason("");
                  }}
                  disabled={
                    !rejectReason || actionLoading === `reject-${langCode}`
                  }
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  {actionLoading === `reject-${langCode}`
                    ? "Rejecting..."
                    : "Confirm Reject"}
                </button>
                <button
                  onClick={() => {
                    setShowRejectForm(false);
                    setRejectReason("");
                  }}
                  className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QcStatusBadge({ status, label }) {
  const config = {
    pending: { bg: "bg-gray-100", text: "text-gray-600", display: "Pending" },
    approved: {
      bg: "bg-green-100",
      text: "text-green-700",
      display: "Approved",
    },
    rejected: { bg: "bg-red-100", text: "text-red-700", display: "Rejected" },
    in_review: {
      bg: "bg-blue-100",
      text: "text-blue-700",
      display: "In Review",
    },
  };
  const c = config[status] || config.pending;
  return (
    <span
      className={`px-2 py-0.5 text-xs font-medium rounded ${c.bg} ${c.text}`}
    >
      {label ? `${label}: ${c.display}` : c.display}
    </span>
  );
}

// Alias for QC status badge without label
function QCStatusBadge({ status }) {
  return <QcStatusBadge status={status} />;
}
