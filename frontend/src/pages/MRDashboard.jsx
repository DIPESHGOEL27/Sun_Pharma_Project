import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { submissionsApi, adminApi, storageApi } from "../services/api";
import toast from "react-hot-toast";
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  EyeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowRightOnRectangleIcon,
  PlusIcon,
  PlayIcon,
  SpeakerWaveIcon,
  UserIcon,
  KeyIcon,
  ArrowRightIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";

const CAMPAIGN_NAME = "Sustencap VoiceReach Campaign";

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
  { value: "pa", label: "Punjabi" },
  { value: "or", label: "Odia" },
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
      sessionStorage.setItem("mrSession", JSON.stringify(mrData));
      toast.success(`Welcome, ${mrData.name}!`);
      onLoginSuccess(mrData);
    } catch (err) {
      console.error("Login error:", err);
      const status = err.response?.status;
      const message = err.response?.data?.error;
      if (status === 401) {
        setError("Invalid email or employee code.");
      } else if (status === 400) {
        setError(message || "Please enter a valid email and employee code.");
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
        <div className="text-center mb-8">
          <img
            src="/sustencaplogo.jpg"
            alt="Susten Cap Logo"
            className="h-20 mx-auto mb-4"
          />
          <h1 className="text-3xl font-bold text-gray-900">MR Dashboard</h1>
          <p className="text-gray-600 mt-2">{CAMPAIGN_NAME}</p>
        </div>

        <div
          className={`bg-white rounded-2xl shadow-xl p-8 ${error ? "animate-shake" : ""}`}
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
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600 flex items-center">
                  <ExclamationCircleIcon className="w-5 h-5 mr-2" />
                  {error}
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Employee Code
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
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
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
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
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

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              Use your official Sun Pharma email and employee code.
            </p>
          </div>
        </div>

        <div className="text-center mt-6">
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} Sun Pharma. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}

// Main MR Dashboard Component
export default function MRDashboard() {
  const navigate = useNavigate();
  const [mrData, setMrData] = useState(null);
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

  // Check for existing session on mount
  useEffect(() => {
    const stored = sessionStorage.getItem("mrSession");
    if (stored) {
      try {
        setMrData(JSON.parse(stored));
      } catch {
        sessionStorage.removeItem("mrSession");
      }
    }
  }, []);

  // Load submissions when mrData or filters change
  useEffect(() => {
    if (mrData) {
      loadSubmissions();
    }
  }, [
    mrData,
    pagination.page,
    filters.status,
    filters.qc_status,
    filters.language,
  ]);

  const loadSubmissions = async () => {
    if (!mrData?.mr_code) return;
    setLoading(true);
    try {
      const response = await submissionsApi.listByLanguage({
        page: pagination.page,
        limit: 30,
        status: filters.status || undefined,
        qc_status: filters.qc_status || undefined,
        language: filters.language || undefined,
        search: filters.search || undefined,
        mr_code: mrData.mr_code,
      });
      setEntries(response.data.entries);
      setPagination((prev) => ({
        ...prev,
        totalPages: response.data.pagination.totalPages,
        total: response.data.pagination.total,
      }));
    } catch (error) {
      console.error("Error loading submissions:", error);
      toast.error("Failed to load submissions");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("mrSession");
    setMrData(null);
    setEntries([]);
    toast.success("Logged out");
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
    if (e.key === "Enter") handleSearch();
  };

  // Show login if not authenticated
  if (!mrData) {
    return <MRLoginScreen onLoginSuccess={setMrData} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/sustencaplogo.jpg" alt="Logo" className="h-10" />
              <div>
                <h1 className="text-lg font-bold text-gray-900">
                  My Submissions
                </h1>
                <p className="text-xs text-gray-500">
                  {mrData.name} • {mrData.mr_code}
                  {mrData.hq ? ` • ${mrData.hq}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                New Submission
              </Link>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-red-600 hover:bg-red-50 border border-red-200 text-sm font-medium rounded-lg transition-colors"
              >
                <ArrowRightOnRectangleIcon className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Total Entries"
            value={pagination.total}
            color="blue"
          />
          <StatCard
            label="Audio Ready"
            value={
              entries.filter((e) => e.language_status === "audio_ready").length
            }
            color="cyan"
          />
          <StatCard
            label="Video Ready"
            value={
              entries.filter((e) => e.language_status === "video_ready").length
            }
            color="emerald"
          />
          <StatCard
            label="Pending"
            value={
              entries.filter(
                (e) =>
                  e.language_status === "pending" ||
                  e.language_status === "pending_consent",
              ).length
            }
            color="yellow"
          />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by doctor name, email, or ID..."
                value={filters.search}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, search: e.target.value }))
                }
                onKeyPress={handleKeyPress}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none"
              />
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className="lg:hidden px-4 py-2 border border-gray-300 rounded-lg flex items-center gap-2 text-sm text-gray-700"
            >
              <FunnelIcon className="w-5 h-5" />
              Filters
            </button>

            <div
              className={`flex flex-col sm:flex-row gap-4 ${showFilters ? "" : "hidden lg:flex"}`}
            >
              <select
                value={filters.language}
                onChange={(e) => handleFilterChange("language", e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none text-sm"
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
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none text-sm"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={filters.qc_status}
                onChange={(e) =>
                  handleFilterChange("qc_status", e.target.value)
                }
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none text-sm"
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

        {/* Submissions Table */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <p className="text-lg font-medium">No submissions yet</p>
              <p className="text-sm mb-4">Start by creating a new submission</p>
              <Link
                to="/submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
              >
                <PlusIcon className="w-4 h-4" />
                New Submission
              </Link>
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
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-gray-500">Doctor</p>
                        <p className="font-medium truncate">
                          {entry.doctor_name || "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Email</p>
                        <p className="font-medium truncate text-xs">
                          {entry.doctor_email || "-"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={entry.language_status} />
                        <QCStatusBadge status={entry.qc_status} />
                      </div>
                      <div className="flex items-center gap-2">
                        {entry.audio_url && (
                          <MediaButton type="audio" gcsPath={entry.audio_url} />
                        )}
                        {entry.video_url && (
                          <MediaButton type="video" gcsPath={entry.video_url} />
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
                        <td className="px-4 py-4 whitespace-nowrap">
                          <StatusBadge status={entry.language_status} />
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <QCStatusBadge status={entry.qc_status} />
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {entry.audio_url && (
                              <MediaButton
                                type="audio"
                                gcsPath={entry.audio_url}
                              />
                            )}
                            {entry.video_url && (
                              <MediaButton
                                type="video"
                                gcsPath={entry.video_url}
                              />
                            )}
                            {!entry.audio_url && !entry.video_url && (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 hidden lg:table-cell">
                          {new Date(entry.created_at).toLocaleDateString()}
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
                  className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
                >
                  <ChevronLeftIcon className="w-5 h-5" />
                </button>
                <button
                  onClick={() =>
                    setPagination((p) => ({ ...p, page: p.page + 1 }))
                  }
                  disabled={pagination.page === pagination.totalPages}
                  className="p-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
                >
                  <ChevronRightIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Helper Components ---

function StatCard({ label, value, color }) {
  const colors = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    cyan: "bg-cyan-50 text-cyan-700 border-cyan-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.blue}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium mt-1">{label}</p>
    </div>
  );
}

function MediaButton({ type, gcsPath }) {
  const handleClick = async () => {
    try {
      toast.loading("Loading...", { id: "media" });
      const res = await storageApi.getSignedDownloadUrl(gcsPath);
      toast.dismiss("media");
      window.open(res.data.downloadUrl, "_blank");
    } catch {
      toast.dismiss("media");
      toast.error(`Failed to load ${type}`);
    }
  };

  if (type === "audio") {
    return (
      <button
        onClick={handleClick}
        className="text-indigo-600 hover:text-indigo-800"
        title="Play audio"
      >
        <SpeakerWaveIcon className="w-5 h-5" />
      </button>
    );
  }
  return (
    <button
      onClick={handleClick}
      className="text-green-600 hover:text-green-800"
      title="Play video"
    >
      <PlayIcon className="w-5 h-5" />
    </button>
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
