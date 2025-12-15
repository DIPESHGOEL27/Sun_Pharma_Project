import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { submissionsApi, voiceApi, consentApi } from "../services/api";
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
} from "@heroicons/react/24/outline";

export default function SubmissionDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState(null);
  const [actionLoading, setActionLoading] = useState("");

  useEffect(() => {
    loadSubmission();
  }, [id]);

  const loadSubmission = async () => {
    try {
      const response = await submissionsApi.get(id);
      setSubmission(response.data);
    } catch (error) {
      console.error("Error loading submission:", error);
      toast.error("Failed to load submission");
      navigate("/submissions");
    } finally {
      setLoading(false);
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
        error.response?.data?.error || "Failed to send consent email"
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
        error.response?.data?.error || "Failed to start voice cloning"
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
      <div className="flex items-center gap-4">
        <Link to="/admin" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            Submission #{submission.id}
          </h1>
          <p className="text-gray-500">
            Created {new Date(submission.created_at).toLocaleString()}
          </p>
        </div>
        <StatusBadge status={submission.status} large />
      </div>

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
            status={
              submission.voice_clone_status === "completed"
                ? "completed"
                : submission.voice_clone_status === "in_progress"
                ? "in_progress"
                : submission.voice_clone_status === "failed"
                ? "failed"
                : "pending"
            }
            icon={MicrophoneIcon}
          />
          <PipelineConnector
            active={submission.voice_clone_status === "completed"}
          />
          <PipelineStep
            label="Audio Gen"
            status={
              submission.generated_audio?.some((a) => a.status === "completed")
                ? "completed"
                : submission.generated_audio?.some(
                    (a) => a.status === "processing"
                  )
                ? "in_progress"
                : "pending"
            }
            icon={MusicalNoteIcon}
          />
          <PipelineConnector
            active={submission.generated_audio?.some(
              (a) => a.status === "completed"
            )}
          />
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

          {/* Generated Audio */}
          {submission.generated_audio?.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-4">
                Generated Audio
              </h3>
              <div className="space-y-3">
                {submission.generated_audio.map((audio) => (
                  <div
                    key={audio.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <MusicalNoteIcon className="w-5 h-5 text-sunpharma-blue" />
                      <div>
                        <div className="font-medium">
                          {audio.language_code.toUpperCase()}
                        </div>
                        {audio.duration_seconds && (
                          <div className="text-sm text-gray-500">
                            {Math.floor(audio.duration_seconds / 60)}:
                            {String(
                              Math.floor(audio.duration_seconds % 60)
                            ).padStart(2, "0")}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <AudioStatusBadge status={audio.status} />
                      {audio.file_path && (
                        <button className="p-2 hover:bg-gray-200 rounded-lg">
                          <PlayIcon className="w-5 h-5 text-green-600" />
                        </button>
                      )}
                    </div>
                  </div>
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
          {/* Quick Actions */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4">Actions</h3>
            <div className="space-y-3">
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
                <>
                  <button
                    onClick={handleGenerateAudio}
                    disabled={actionLoading === "audio"}
                    className="w-full btn-success justify-center disabled:opacity-50"
                  >
                    {actionLoading === "audio" ? (
                      <span className="flex items-center gap-2">
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        Generating...
                      </span>
                    ) : (
                      "Generate Audio (Speech-to-Speech)"
                    )}
                  </button>
                  <button
                    onClick={handleDeleteVoice}
                    disabled={actionLoading === "delete"}
                    className="w-full btn-danger justify-center disabled:opacity-50"
                  >
                    {actionLoading === "delete"
                      ? "Deleting..."
                      : "Delete Cloned Voice"}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Image Preview */}
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2 justify-between">
              <span className="flex items-center gap-2">
                <PhotoIcon className="w-5 h-5" />
                Doctor Photo
              </span>
              {(submission.image_gcs_path || submission.image_path) && (
                <a
                  href={
                    submission.image_gcs_path ||
                    `/api/uploads/image/${submission.image_path
                      ?.split("/")
                      .pop()}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-sunpharma-blue hover:underline"
                >
                  Download
                </a>
              )}
            </h3>
            {submission.image_gcs_path || submission.image_path ? (
              <img
                src={
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
              {(submission.audio_gcs_path || submission.audio_path) && (
                <a
                  href={(() => {
                    if (submission.audio_gcs_path)
                      return submission.audio_gcs_path;
                    const audioPath = submission.audio_path;
                    if (!audioPath) return "#";
                    // Handle JSON array format
                    try {
                      const parsed = JSON.parse(audioPath);
                      if (Array.isArray(parsed) && parsed.length > 0) {
                        return `/api/uploads/audio/${parsed[0]
                          .split("/")
                          .pop()}`;
                      }
                    } catch (e) {}
                    return `/api/uploads/audio/${audioPath.split("/").pop()}`;
                  })()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-sunpharma-blue hover:underline"
                >
                  Download
                </a>
              )}
            </h3>
            {submission.audio_gcs_path || submission.audio_path ? (
              <div className="space-y-2">
                <audio controls className="w-full">
                  <source
                    src={(() => {
                      if (submission.audio_gcs_path)
                        return submission.audio_gcs_path;
                      const audioPath = submission.audio_path;
                      if (!audioPath) return "";
                      // Handle JSON array format
                      try {
                        const parsed = JSON.parse(audioPath);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                          return `/api/uploads/audio/${parsed[0]
                            .split("/")
                            .pop()}`;
                        }
                      } catch (e) {}
                      return `/api/uploads/audio/${audioPath.split("/").pop()}`;
                    })()}
                  />
                </audio>
                {submission.audio_duration_seconds && (
                  <p className="text-sm text-gray-500">
                    Duration:{" "}
                    {Math.floor(submission.audio_duration_seconds / 60)}:
                    {String(
                      Math.floor(submission.audio_duration_seconds % 60)
                    ).padStart(2, "0")}
                  </p>
                )}
              </div>
            ) : (
              <div className="h-24 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                No audio uploaded
              </div>
            )}
          </div>
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

function PipelineStep({ label, status, icon: Icon }) {
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
      <span className="text-xs mt-2 text-gray-600">{label}</span>
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
