import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { qcApi } from "../services/api";
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  EyeIcon,
  PlayIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";

const REJECTION_REASONS = [
  "Poor audio quality",
  "Background noise",
  "Image quality issues",
  "Face not clearly visible",
  "Incorrect information",
  "Voice clone quality poor",
  "Generated audio issues",
  "Other",
];

export default function QCDashboard() {
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [reviewerName, setReviewerName] = useState(
    localStorage.getItem("qc_reviewer") || ""
  );
  const [actionLoading, setActionLoading] = useState("");
  const [adminRole] = useState(sessionStorage.getItem("adminRole") || "admin");
  const isViewer = adminRole === "viewer";

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [pendingRes, statsRes] = await Promise.all([
        qcApi.getPending(),
        qcApi.getStats(),
      ]);
      setSubmissions(pendingRes.data.submissions);
      setStats(statsRes.data);
    } catch (error) {
      console.error("Error loading QC data:", error);
      toast.error("Failed to load QC data");
    } finally {
      setLoading(false);
    }
  };

  const handleStartReview = async (submissionId) => {
    if (!reviewerName.trim()) {
      toast.error("Please enter your name first");
      return;
    }

    localStorage.setItem("qc_reviewer", reviewerName);
    setActionLoading(`start-${submissionId}`);

    try {
      await qcApi.startReview(submissionId, reviewerName);
      const detailRes = await qcApi.getSubmission(submissionId);
      setSelectedSubmission(detailRes.data);
      toast.success("Review started");
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to start review");
    } finally {
      setActionLoading("");
    }
  };

  const handleApprove = async (notes = "") => {
    if (!selectedSubmission) return;

    setActionLoading("approve");
    try {
      await qcApi.approve(selectedSubmission.id, reviewerName, notes);
      toast.success("Submission approved!");
      setSelectedSubmission(null);
      loadData();
    } catch (error) {
      toast.error(error.response?.data?.error || "Failed to approve");
    } finally {
      setActionLoading("");
    }
  };

  const handleReject = async (notes, reasons) => {
    if (!selectedSubmission) return;
    if (!notes.trim()) {
      toast.error("Please provide rejection reason");
      return;
    }

    setActionLoading("reject");
    try {
      await qcApi.reject(selectedSubmission.id, reviewerName, notes, reasons);
      toast.success("Submission rejected");
      setSelectedSubmission(null);
      loadData();
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            QC Review Dashboard
          </h1>
          <p className="text-gray-500">Review and approve/reject submissions</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="text-sm text-gray-600">Reviewer Name:</label>
          <input
            type="text"
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
            placeholder="Enter your name"
            className="px-3 py-2 border border-gray-300 rounded-lg w-48"
          />
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Pending"
            value={stats.pending}
            icon={ClockIcon}
            color="yellow"
          />
          <StatCard
            label="In Review"
            value={stats.in_review}
            icon={EyeIcon}
            color="blue"
          />
          <StatCard
            label="Approved"
            value={stats.approved}
            icon={CheckCircleIcon}
            color="green"
          />
          <StatCard
            label="Rejected"
            value={stats.rejected}
            icon={XCircleIcon}
            color="red"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Submissions Queue */}
        <div className="lg:col-span-1">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4">
              Pending Reviews
            </h3>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {submissions.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <CheckCircleIcon className="w-12 h-12 mx-auto mb-3" />
                  <p>All caught up!</p>
                  <p className="text-sm">No pending reviews</p>
                </div>
              ) : (
                submissions.map((sub) => (
                  <div
                    key={sub.id}
                    className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                      selectedSubmission?.id === sub.id
                        ? "border-sunpharma-blue bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => !isViewer && handleStartReview(sub.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">
                        #{sub.id}
                      </span>
                      <QCStatusBadge status={sub.qc_status} />
                    </div>
                    <div className="text-sm text-gray-700">
                      {sub.doctor_name || "Unknown"}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(sub.created_at).toLocaleDateString()}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {sub.selected_languages?.map((lang) => (
                        <span
                          key={lang}
                          className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
                        >
                          {lang.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Review Panel */}
        <div className="lg:col-span-2">
          {selectedSubmission ? (
            <ReviewPanel
              submission={selectedSubmission}
              reviewerName={reviewerName}
              actionLoading={actionLoading}
              onApprove={handleApprove}
              onReject={handleReject}
              onClose={() => setSelectedSubmission(null)}
              isViewer={isViewer}
            />
          ) : (
            <div className="card h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <EyeIcon className="w-16 h-16 mx-auto mb-4" />
                <p className="text-lg font-medium">
                  Select a submission to review
                </p>
                <p className="text-sm">
                  Click on any pending item from the left panel
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Today's Stats */}
      {stats?.today && (
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Today's Activity</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-green-50 rounded-lg text-center">
              <div className="text-3xl font-bold text-green-600">
                {stats.today.approved_today || 0}
              </div>
              <div className="text-sm text-gray-600">Approved Today</div>
            </div>
            <div className="p-4 bg-red-50 rounded-lg text-center">
              <div className="text-3xl font-bold text-red-600">
                {stats.today.rejected_today || 0}
              </div>
              <div className="text-sm text-gray-600">Rejected Today</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewPanel({
  submission,
  reviewerName,
  actionLoading,
  onApprove,
  onReject,
  onClose,
  isViewer = false,
}) {
  const [notes, setNotes] = useState("");
  const [selectedReasons, setSelectedReasons] = useState([]);
  const [showRejectForm, setShowRejectForm] = useState(false);

  const toggleReason = (reason) => {
    setSelectedReasons((prev) =>
      prev.includes(reason)
        ? prev.filter((r) => r !== reason)
        : [...prev, reason]
    );
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-gray-900">
          Review Submission #{submission.id}
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          ✕
        </button>
      </div>

      {/* Doctor Info */}
      <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
        <InfoRow label="Doctor Name" value={submission.doctor_name} />
        <InfoRow label="Email" value={submission.doctor_email} />
        <InfoRow label="Phone" value={submission.doctor_phone} />
        <InfoRow label="Specialty" value={submission.specialty} />
        <InfoRow label="MR Code" value={submission.mr_code} />
        <InfoRow
          label="Languages"
          value={submission.selected_languages?.join(", ").toUpperCase()}
        />
      </div>

      {/* Files Preview */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Image */}
        <div>
          <h4 className="font-medium text-gray-700 mb-2">Photo</h4>
          {submission.image_url || submission.image_path ? (
            <img
              src={
                submission.image_url ||
                `/uploads/image/${submission.image_path.split("/").pop()}`
              }
              alt="Doctor"
              className="w-full h-48 object-cover rounded-lg bg-gray-100"
              onError={(e) => {
                e.target.src = "/placeholder.png";
              }}
            />
          ) : (
            <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
              No image
            </div>
          )}
          {submission.validations?.image && (
            <div
              className={`mt-2 text-sm ${
                submission.validations.image.is_valid
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {submission.validations.image.is_valid
                ? "✓ Valid"
                : "✗ Issues found"}
            </div>
          )}
        </div>

        {/* Audio */}
        <div>
          <h4 className="font-medium text-gray-700 mb-2">Voice Sample</h4>
          {submission.audio_files?.length > 0 ? (
            <div className="space-y-3">
              {submission.audio_files.map((audio, idx) => (
                <div key={audio.gcsPath || audio.publicUrl || idx}>
                  <div className="text-sm text-gray-700 mb-1">
                    {audio.filename || `Audio ${idx + 1}`}
                  </div>
                  <audio controls className="w-full">
                    <source src={audio.publicUrl || audio.gcsPath} />
                  </audio>
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full h-24 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
              No audio
            </div>
          )}
          {submission.validations?.audio && (
            <div
              className={`mt-2 text-sm ${
                submission.validations.audio.is_valid
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {submission.validations.audio.is_valid
                ? "✓ Valid"
                : "✗ Issues found"}
            </div>
          )}
        </div>
      </div>

      {/* Generated Audio (if any) */}
      {submission.generated_audio?.length > 0 && (
        <div className="mb-6">
          <h4 className="font-medium text-gray-700 mb-2">Generated Audio</h4>
          <div className="space-y-2">
            {submission.generated_audio.map((audio) => (
              <div
                key={audio.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">
                    {audio.language_code.toUpperCase()}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      audio.status === "completed"
                        ? "bg-green-100 text-green-800"
                        : audio.status === "failed"
                        ? "bg-red-100 text-red-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {audio.status}
                  </span>
                </div>
                {audio.file_path && (
                  <button className="p-2 text-green-600 hover:bg-green-50 rounded">
                    <PlayIcon className="w-5 h-5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {submission.final_video_url && (
        <div className="mb-6">
          <h4 className="font-medium text-gray-700 mb-2">Final Video</h4>
          <a
            href={submission.final_video_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sunpharma-blue hover:underline text-sm"
          >
            View final video
          </a>
        </div>
      )}

      {/* Action Buttons - Hidden for viewers */}
      {!isViewer && !showRejectForm ? (
        <div className="flex gap-4">
          <button
            onClick={() => onApprove(notes)}
            disabled={actionLoading === "approve"}
            className="flex-1 btn-success py-3 text-lg disabled:opacity-50"
          >
            {actionLoading === "approve" ? "Approving..." : "✓ Approve"}
          </button>
          <button
            onClick={() => setShowRejectForm(true)}
            className="flex-1 btn-danger py-3 text-lg"
          >
            ✗ Reject
          </button>
        </div>
      ) : !isViewer ? (
        <div className="space-y-4 border-t pt-4">
          <h4 className="font-medium text-gray-900">Rejection Details</h4>

          {/* Rejection Reasons */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Reasons:
            </label>
            <div className="flex flex-wrap gap-2">
              {REJECTION_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => toggleReason(reason)}
                  className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                    selectedReasons.includes(reason)
                      ? "bg-red-100 border-red-300 text-red-800"
                      : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Additional Notes <span className="text-red-500">*</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Provide detailed rejection reason..."
              className="w-full p-3 border border-gray-300 rounded-lg resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={() => {
                setShowRejectForm(false);
                setNotes("");
                setSelectedReasons([]);
              }}
              className="flex-1 btn-secondary py-3"
            >
              Cancel
            </button>
            <button
              onClick={() => onReject(notes, selectedReasons)}
              disabled={actionLoading === "reject" || !notes.trim()}
              className="flex-1 btn-danger py-3 disabled:opacity-50"
            >
              {actionLoading === "reject"
                ? "Rejecting..."
                : "Confirm Rejection"}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-4 text-gray-500 bg-gray-50 rounded-lg">
          <p className="text-sm">View-only mode. No actions available.</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  const colors = {
    yellow: "bg-yellow-50 text-yellow-600",
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    red: "bg-red-50 text-red-600",
  };

  return (
    <div className="card flex items-center gap-4">
      <div className={`p-3 rounded-lg ${colors[color]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-sm text-gray-500">{label}</div>
      </div>
    </div>
  );
}

function QCStatusBadge({ status }) {
  const config = {
    pending: { label: "Pending", class: "bg-yellow-100 text-yellow-800" },
    in_review: { label: "In Review", class: "bg-blue-100 text-blue-800" },
    approved: { label: "Approved", class: "bg-green-100 text-green-800" },
    rejected: { label: "Rejected", class: "bg-red-100 text-red-800" },
  };
  const c = config[status] || {
    label: status,
    class: "bg-gray-100 text-gray-800",
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${c.class}`}>
      {c.label}
    </span>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900 text-sm">{value || "-"}</dd>
    </div>
  );
}
