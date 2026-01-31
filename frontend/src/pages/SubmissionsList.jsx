import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { submissionsApi } from "../services/api";
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  EyeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowLeftIcon,
  ArrowRightOnRectangleIcon,
  PlayIcon,
  SpeakerWaveIcon,
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

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "pending_consent", label: "Pending Consent" },
  { value: "consent_verified", label: "Consent Verified" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

const QC_STATUS_OPTIONS = [
  { value: "", label: "All QC Status" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const LANGUAGE_OPTIONS = [
  { value: "", label: "All Languages" },
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "mr", label: "Marathi" },
  { value: "gu", label: "Gujarati" },
  { value: "ta", label: "Tamil" },
  { value: "te", label: "Telugu" },
  { value: "kn", label: "Kannada" },
  { value: "ml", label: "Malayalam" },
  { value: "bn", label: "Bengali" },
  { value: "pa", label: "Punjabi" },
];

export default function SubmissionsList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });
  const [filters, setFilters] = useState({
    status: "",
    qc_status: "",
    language: "",
    search: "",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [adminRole] = useState(sessionStorage.getItem("adminRole") || "admin");

  const handleLogout = () => {
    sessionStorage.removeItem("adminLoggedIn");
    sessionStorage.removeItem("adminRole");
    navigate("/admin");
  };

  useEffect(() => {
    loadSubmissions();
  }, [pagination.page, filters.status, filters.qc_status, filters.language]);

  const loadSubmissions = async () => {
    setLoading(true);
    try {
      const response = await submissionsApi.listByLanguage({
        page: pagination.page,
        limit: 30,
        status: filters.status || undefined,
        qc_status: filters.qc_status || undefined,
        language: filters.language || undefined,
        search: filters.search || undefined,
      });
      setEntries(response.data.entries);
      setPagination((prev) => ({
        ...prev,
        totalPages: response.data.pagination.totalPages,
        total: response.data.pagination.total,
      }));
    } catch (error) {
      console.error("Error loading submissions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handleSearch = () => {
    setPagination((prev) => ({ ...prev, page: 1 }));
    loadSubmissions();
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          {adminRole === "admin" && (
            <Link
              to="/admin"
              className="p-2 hover:bg-gray-100 rounded-lg"
              title="Back to Dashboard"
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </Link>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Submissions</h1>
            <p className="text-gray-500">
              {pagination.total} total entries (submission × language)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/submit" target="_blank" className="btn-primary">
            + New Submission
          </Link>
          {(adminRole === "editor" || adminRole === "viewer") && (
            <button
              onClick={handleLogout}
              className="btn btn-outline flex items-center gap-2 text-red-600 border-red-300 hover:bg-red-50"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
              Logout
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, MR code, or ID..."
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              onKeyPress={handleKeyPress}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-sunpharma-blue outline-none"
            />
          </div>

          {/* Filter Toggle (Mobile) */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="lg:hidden btn-secondary flex items-center gap-2"
          >
            <FunnelIcon className="w-5 h-5" />
            Filters
          </button>

          {/* Filter Dropdowns */}
          <div
            className={`flex flex-col sm:flex-row gap-4 ${
              showFilters ? "" : "hidden lg:flex"
            }`}
          >
            <select
              value={filters.language}
              onChange={(e) => handleFilterChange("language", e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-sunpharma-blue outline-none"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange("status", e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-sunpharma-blue outline-none"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={filters.qc_status}
              onChange={(e) => handleFilterChange("qc_status", e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-sunpharma-blue outline-none"
            >
              {QC_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-sunpharma-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <p className="text-lg font-medium">No submissions found</p>
            <p className="text-sm">Try adjusting your filters</p>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="block md:hidden p-4 space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry.entry_id}
                  className="border rounded-lg p-4 space-y-3 bg-white"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        #{entry.submission_id}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {LANGUAGE_NAMES[entry.language_code] ||
                          entry.language_code}
                      </span>
                    </div>
                    <Link
                      to={`/admin/submissions/${entry.submission_id}?lang=${entry.language_code}`}
                      className="text-sunpharma-blue hover:text-blue-800 text-sm font-medium"
                    >
                      View →
                    </Link>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Doctor</p>
                      <p className="font-medium truncate">
                        {entry.doctor_name || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">MR Code</p>
                      <p className="font-medium">{entry.mr_code || "-"}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={entry.language_status} />
                      <QCStatusBadge status={entry.qc_status} />
                    </div>
                    <div className="flex items-center gap-2">
                      {entry.audio_url && (
                        <a
                          href={entry.audio_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600"
                        >
                          <SpeakerWaveIcon className="w-5 h-5" />
                        </a>
                      )}
                      {entry.video_url && (
                        <a
                          href={entry.video_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600"
                        >
                          <PlayIcon className="w-5 h-5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Language
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Doctor
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                      MR Code
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      QC Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Media
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                      Created
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {entries.map((entry) => (
                    <tr key={entry.entry_id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        #{entry.submission_id}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {LANGUAGE_NAMES[entry.language_code] ||
                            entry.language_code}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {entry.doctor_name || "N/A"}
                          </div>
                          <div className="text-sm text-gray-500 truncate max-w-[150px]">
                            {entry.doctor_email}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 hidden lg:table-cell">
                        {entry.mr_code || "-"}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <StatusBadge status={entry.language_status} />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <QCStatusBadge status={entry.qc_status} />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {entry.audio_url && (
                            <a
                              href={entry.audio_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:text-indigo-800"
                              title="Audio ready"
                            >
                              <SpeakerWaveIcon className="w-5 h-5" />
                            </a>
                          )}
                          {entry.video_url && (
                            <a
                              href={entry.video_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-600 hover:text-green-800"
                              title="Video ready"
                            >
                              <PlayIcon className="w-5 h-5" />
                            </a>
                          )}
                          {!entry.audio_url && !entry.video_url && (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 hidden lg:table-cell">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right text-sm">
                        <Link
                          to={`/admin/submissions/${entry.submission_id}?lang=${entry.language_code}`}
                          className="text-sunpharma-blue hover:text-blue-800 inline-flex items-center gap-1"
                        >
                          <EyeIcon className="w-4 h-4" />
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Page {pagination.page} of {pagination.totalPages} (
              {pagination.total} entries)
            </div>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setPagination((p) => ({ ...p, page: p.page - 1 }))
                }
                disabled={pagination.page === 1}
                className="btn-secondary p-2 disabled:opacity-50"
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
              <button
                onClick={() =>
                  setPagination((p) => ({ ...p, page: p.page + 1 }))
                }
                disabled={pagination.page === pagination.totalPages}
                className="btn-secondary p-2 disabled:opacity-50"
              >
                <ChevronRightIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const config = {
    pending: { label: "Pending", class: "bg-gray-100 text-gray-700" },
    pending_consent: {
      label: "Pending Consent",
      class: "bg-yellow-100 text-yellow-800",
    },
    consent_verified: { label: "Verified", class: "bg-blue-100 text-blue-800" },
    voice_ready: {
      label: "Voice Ready",
      class: "bg-purple-100 text-purple-800",
    },
    processing: { label: "Processing", class: "bg-indigo-100 text-indigo-800" },
    audio_ready: { label: "Audio Ready", class: "bg-cyan-100 text-cyan-800" },
    video_ready: {
      label: "Video Ready",
      class: "bg-emerald-100 text-emerald-800",
    },
    completed: { label: "Completed", class: "bg-green-100 text-green-800" },
    failed: { label: "Failed", class: "bg-red-100 text-red-800" },
  };
  const c = config[status] || {
    label: status || "Unknown",
    class: "bg-gray-100 text-gray-700",
  };
  return (
    <span
      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${c.class}`}
    >
      {c.label}
    </span>
  );
}

function QCStatusBadge({ status }) {
  const config = {
    pending: { label: "Pending", class: "bg-gray-100 text-gray-700" },
    in_review: { label: "In Review", class: "bg-blue-100 text-blue-800" },
    approved: { label: "Approved", class: "bg-green-100 text-green-800" },
    rejected: { label: "Rejected", class: "bg-red-100 text-red-800" },
  };
  const c = config[status] || {
    label: status || "Pending",
    class: "bg-gray-100 text-gray-700",
  };
  return (
    <span
      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${c.class}`}
    >
      {c.label}
    </span>
  );
}
