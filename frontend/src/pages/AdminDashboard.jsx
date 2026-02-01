import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  DocumentTextIcon,
  UsersIcon,
  CheckCircleIcon,
  ClockIcon,
  MusicalNoteIcon,
  ChartBarIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  VideoCameraIcon,
  PaperAirplaneIcon,
  CalendarIcon,
  LockClosedIcon,
  TableCellsIcon,
  UserGroupIcon,
  PresentationChartLineIcon,
  ArrowRightOnRectangleIcon,
  ExclamationCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { adminApi, submissionsApi, storageApi } from "../services/api";

const COLORS = [
  "#1a365d",
  "#2563eb",
  "#3b82f6",
  "#60a5fa",
  "#93c5fd",
  "#dbeafe",
];
const STATUS_COLORS = {
  draft: "#9ca3af",
  pending_consent: "#f59e0b",
  consent_verified: "#3b82f6",
  processing: "#8b5cf6",
  pending_qc: "#f97316",
  qc_approved: "#10b981",
  qc_rejected: "#ef4444",
  completed: "#059669",
  failed: "#dc2626",
};

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

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [userRole, setUserRole] = useState(
    sessionStorage.getItem("adminRole") || "admin",
  );

  const [activeTab, setActiveTab] = useState("overall"); // overall, mr-grouped, metrics
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Data states
  const [overallData, setOverallData] = useState({
    entries: [],
    pagination: { page: 1, totalPages: 1, total: 0 },
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [mrGroupedData, setMrGroupedData] = useState({ mrData: [] });
  const [metricsData, setMetricsData] = useState({});
  const [mrSearch, setMrSearch] = useState("");

  // Check if already logged in
  useEffect(() => {
    const adminLoggedIn = sessionStorage.getItem("adminLoggedIn");
    const storedRole = sessionStorage.getItem("adminRole");
    if (adminLoggedIn === "true") {
      setIsLoggedIn(true);
      // Redirect editors and viewers directly to submissions page
      if (storedRole === "editor" || storedRole === "viewer") {
        navigate("/admin/submissions", { replace: true });
      }
    }
  }, [navigate]);

  // Load data when logged in or filters change
  useEffect(() => {
    if (isLoggedIn) {
      loadData();
    }
  }, [isLoggedIn, activeTab, startDate, endDate, currentPage]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!isLoggedIn || !autoRefresh) return;

    const interval = setInterval(() => {
      loadData();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [isLoggedIn, autoRefresh, activeTab, startDate, endDate, mrSearch]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");

    try {
      const response = await adminApi.login(username, password);
      if (response.data.success) {
        const role = response.data.user?.role || "admin";
        setIsLoggedIn(true);
        sessionStorage.setItem("adminLoggedIn", "true");
        setUserRole(role);
        sessionStorage.setItem("adminRole", role);

        // Redirect editors and viewers directly to submissions page
        if (role === "editor") {
          navigate("/admin/submissions", { replace: true });
        }
      }
    } catch (error) {
      setLoginError(
        error.response?.data?.error || "Invalid username or password",
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    sessionStorage.removeItem("adminLoggedIn");
    sessionStorage.removeItem("adminRole");
    setUsername("");
    setPassword("");
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      if (activeTab === "overall") {
        // Use by-language endpoint for per-language entries
        const response = await submissionsApi.listByLanguage({
          ...params,
          page: currentPage,
          limit: 30,
        });
        setOverallData({
          entries: response.data.entries || [],
          pagination: response.data.pagination || {
            page: 1,
            totalPages: 1,
            total: 0,
          },
        });
      } else if (activeTab === "mr-grouped") {
        if (mrSearch) params.search = mrSearch;
        const response = await adminApi.getMrGroupedData(params);
        setMrGroupedData(response.data);
      } else if (activeTab === "metrics") {
        const response = await adminApi.getMetrics(params);
        setMetricsData(response.data);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
      setLastUpdated(new Date());
    }
  };

  const handleMrSearch = () => {
    loadData();
  };

  const handleSyncSheets = async () => {
    try {
      setLoading(true);
      await adminApi.syncSheets();
      alert("Successfully synced to Google Sheets!");
    } catch (error) {
      alert(
        "Failed to sync: " + (error.response?.data?.error || error.message),
      );
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setMrSearch("");
    setCurrentPage(1);
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  // Login Screen
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sunpharma-blue to-blue-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="bg-sunpharma-orange w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4">
              <LockClosedIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Login</h1>
            <p className="text-gray-500 mt-2">Sun Pharma Video Platform</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {loginError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                <ExclamationCircleIcon className="w-5 h-5" />
                {loginError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input w-full"
                placeholder="Enter username"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input w-full"
                placeholder="Enter password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="btn btn-primary w-full py-3 text-lg"
            >
              {isLoggingIn ? "Logging in..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Main Dashboard
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-500">Manage and monitor video submissions</p>
        </div>
        <div className="flex items-center gap-3">
          {userRole !== "viewer" && (
            <button
              onClick={handleSyncSheets}
              disabled={loading}
              className="btn btn-secondary flex items-center gap-2"
            >
              <ArrowPathIcon
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
              Sync to Sheets
            </button>
          )}
          <button
            onClick={handleLogout}
            className="btn btn-outline flex items-center gap-2 text-red-600 border-red-300 hover:bg-red-50"
          >
            <ArrowRightOnRectangleIcon className="w-4 h-4" />
            Logout
          </button>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="card">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">
                Filter by Date:
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">From:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input py-1.5"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">To:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input py-1.5"
                />
              </div>
              <button
                onClick={clearFilters}
                className="btn btn-outline py-1.5 text-sm"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Auto-refresh controls */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 text-sunpharma-blue border-gray-300 rounded focus:ring-sunpharma-blue"
              />
              <span className="text-sm text-gray-600 whitespace-nowrap">
                Auto-refresh
              </span>
            </label>
            {lastUpdated && (
              <span className="text-xs text-gray-400 hidden sm:inline">
                {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={loadData}
              disabled={loading}
              className="btn btn-outline py-1.5 text-sm flex items-center gap-1"
            >
              <ArrowPathIcon
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="flex space-x-4 sm:space-x-8 min-w-max">
          <TabButton
            active={activeTab === "overall"}
            onClick={() => setActiveTab("overall")}
            icon={TableCellsIcon}
            label="Overall"
            fullLabel="Overall Data"
          />
          <TabButton
            active={activeTab === "mr-grouped"}
            onClick={() => setActiveTab("mr-grouped")}
            icon={UserGroupIcon}
            label="MR"
            fullLabel="MR Grouped"
          />
          <TabButton
            active={activeTab === "metrics"}
            onClick={() => setActiveTab("metrics")}
            icon={PresentationChartLineIcon}
            label="Metrics"
            fullLabel="Metrics"
          />
        </nav>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <ArrowPathIcon className="w-8 h-8 animate-spin text-sunpharma-blue" />
        </div>
      ) : (
        <>
          {activeTab === "overall" && (
            <OverallDataTab
              data={overallData}
              onPageChange={handlePageChange}
            />
          )}
          {activeTab === "mr-grouped" && (
            <MrGroupedTab
              data={mrGroupedData}
              search={mrSearch}
              onSearchChange={setMrSearch}
              onSearch={handleMrSearch}
            />
          )}
          {activeTab === "metrics" && <MetricsTab data={metricsData} />}
        </>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, fullLabel }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 sm:gap-2 py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors whitespace-nowrap ${
        active
          ? "border-sunpharma-blue text-sunpharma-blue"
          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
      }`}
    >
      <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
      <span className="sm:hidden">{label}</span>
      <span className="hidden sm:inline">{fullLabel || label}</span>
    </button>
  );
}

function OverallDataTab({ data, onPageChange }) {
  const { entries = [], pagination = { page: 1, totalPages: 1, total: 0 } } =
    data;

  // Helper to get pipeline step status
  const getPipelineStep = (entry) => {
    if (entry.submission_status === "pending_consent") return 0;
    if (entry.submission_status === "consent_verified" && !entry.audio_url)
      return 1;
    if (entry.audio_url && !entry.video_url) return 2;
    if (entry.video_url && entry.qc_status === "pending") return 3;
    if (entry.qc_status === "approved") return 4;
    if (entry.qc_status === "rejected") return 3;
    return 1;
  };

  const pipelineSteps = ["Consent", "Voice Clone", "Audio", "Video", "QC"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900">
          All Entries ({pagination.total || entries.length})
        </h3>
      </div>

      {/* Mobile Card View */}
      <div className="block md:hidden space-y-3">
        {entries.map((entry) => {
          const step = getPipelineStep(entry);
          return (
            <div key={entry.entry_id} className="card p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    #{entry.submission_id}
                  </span>
                  <span className="ml-2 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                    {LANGUAGE_NAMES[entry.language_code] ||
                      entry.language_code?.toUpperCase()}
                  </span>
                </div>
                <Link
                  to={`/admin/submissions/${entry.submission_id}?lang=${entry.language_code}`}
                  className="text-sunpharma-blue hover:underline text-sm font-medium"
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
                  <p className="text-xs text-gray-500">MR</p>
                  <p className="font-medium truncate">
                    {entry.mr_name || "N/A"}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  {pipelineSteps.map((stepName, idx) => (
                    <div
                      key={idx}
                      className={`w-2 h-2 rounded-full ${
                        idx < step
                          ? "bg-green-500"
                          : idx === step
                            ? "bg-blue-500 animate-pulse"
                            : "bg-gray-300"
                      }`}
                      title={stepName}
                    />
                  ))}
                  <span className="ml-2 text-xs text-gray-500">
                    {pipelineSteps[step] || "Done"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MediaDownloadCell entry={entry} />
                  <StatusBadge
                    status={entry.language_status || entry.submission_status}
                  />
                  <QCBadge status={entry.qc_status} />
                </div>
              </div>
            </div>
          );
        })}
        {entries.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No entries found for the selected date range
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ID
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Doctor
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                MR
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Language
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Pipeline
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                QC
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Media
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                Created
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {entries.map((entry) => {
              const step = getPipelineStep(entry);
              return (
                <tr key={entry.entry_id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 text-sm font-medium text-gray-900">
                    #{entry.submission_id}
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-sm font-medium text-gray-900">
                      {entry.doctor_name || "N/A"}
                    </div>
                    <div className="text-xs text-gray-500 truncate max-w-[150px]">
                      {entry.doctor_email}
                    </div>
                  </td>
                  <td className="px-3 py-3 hidden lg:table-cell">
                    <div className="text-sm font-medium text-gray-900">
                      {entry.mr_name || "N/A"}
                    </div>
                    <div className="text-xs text-gray-500">{entry.mr_code}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      {LANGUAGE_NAMES[entry.language_code] ||
                        entry.language_code?.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      {pipelineSteps.map((stepName, idx) => (
                        <div
                          key={idx}
                          className={`w-2 h-2 rounded-full ${
                            idx < step
                              ? "bg-green-500"
                              : idx === step
                                ? "bg-blue-500 animate-pulse"
                                : "bg-gray-300"
                          }`}
                          title={stepName}
                        />
                      ))}
                      <span className="ml-2 text-xs text-gray-500 hidden xl:inline">
                        {pipelineSteps[step] || "Done"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge
                      status={entry.language_status || entry.submission_status}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <QCBadge status={entry.qc_status} />
                  </td>
                  <td className="px-3 py-3">
                    <MediaDownloadCell entry={entry} />
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-500 hidden lg:table-cell">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      to={`/admin/submissions/${entry.submission_id}?lang=${entry.language_code}`}
                      className="text-sunpharma-blue hover:underline text-sm"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {entries.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No entries found for the selected date range
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.totalPages} (
            {pagination.total} entries)
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="btn btn-secondary p-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <span className="px-3 py-1 text-sm font-medium bg-gray-100 rounded">
              {pagination.page}
            </span>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
              className="btn btn-secondary p-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MrGroupedTab({ data, search, onSearchChange, onSearch }) {
  const { mrData = [] } = data;
  const [expandedMr, setExpandedMr] = useState({});

  const toggleMr = (mrId) => {
    setExpandedMr((prev) => ({
      ...prev,
      [mrId]: !prev[mrId],
    }));
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && onSearch()}
            placeholder="Search by MR Code, Emp Code, or Name..."
            className="input pl-10 w-full"
          />
        </div>
        <button onClick={onSearch} className="btn btn-primary">
          Search
        </button>
      </div>

      {/* MR Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {mrData.map((mr) => (
          <div key={mr.mr_id} className="card">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h4 className="font-semibold text-gray-900">{mr.mr_name}</h4>
                <div className="text-sm text-gray-500">
                  MR Code: {mr.mr_code} | Emp: {mr.emp_code}
                </div>
                {mr.hq && (
                  <div className="text-xs text-gray-400">
                    {mr.hq} | {mr.region} | {mr.zone}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-sunpharma-blue">
                  {mr.total_submissions}
                </div>
                <div className="text-xs text-gray-500">Submissions</div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="text-center p-2 bg-green-50 rounded">
                <div className="font-semibold text-green-600">
                  {mr.completed_submissions}
                </div>
                <div className="text-xs text-gray-500">Completed</div>
              </div>
              <div className="text-center p-2 bg-blue-50 rounded">
                <div className="font-semibold text-blue-600">
                  {mr.approved_submissions}
                </div>
                <div className="text-xs text-gray-500">Approved</div>
              </div>
              <div className="text-center p-2 bg-red-50 rounded">
                <div className="font-semibold text-red-600">
                  {mr.rejected_submissions}
                </div>
                <div className="text-xs text-gray-500">Rejected</div>
              </div>
              <div className="text-center p-2 bg-purple-50 rounded">
                <div className="font-semibold text-purple-600">
                  {mr.videos_generated}
                </div>
                <div className="text-xs text-gray-500">Videos</div>
              </div>
            </div>

            {mr.recent_submissions?.length > 0 && (
              <div className="border-t pt-3">
                <button
                  onClick={() => toggleMr(mr.mr_id)}
                  className="flex items-center justify-between w-full text-xs font-medium text-gray-700 hover:text-gray-900 mb-2"
                >
                  <span>All Submissions ({mr.recent_submissions.length})</span>
                  {expandedMr[mr.mr_id] ? (
                    <ChevronUpIcon className="w-4 h-4" />
                  ) : (
                    <ChevronDownIcon className="w-4 h-4" />
                  )}
                </button>
                <div className="space-y-2">
                  {(expandedMr[mr.mr_id]
                    ? mr.recent_submissions
                    : mr.recent_submissions.slice(0, 3)
                  ).map((sub) => (
                    <Link
                      key={sub.id}
                      to={`/admin/submissions/${sub.id}`}
                      className="flex items-center justify-between text-sm hover:bg-gray-50 p-2 rounded border border-gray-100"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-gray-700">
                          {sub.doctor_name || `Submission #${sub.id}`}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(sub.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <StatusBadge status={sub.status} small />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {mrData.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No MR data found for the selected criteria
        </div>
      )}
    </div>
  );
}

function MetricsTab({ data }) {
  const {
    totalVideosUploaded = 0,
    totalVideosDelivered = 0,
    statusBreakdown = {},
    qcBreakdown = {},
    consentBreakdown = {},
    languageDistribution = [],
    dailyTrend = [],
    mrPerformance = [],
  } = data;

  const statusData = Object.entries(statusBreakdown)
    .filter(([key]) => key !== "total")
    .map(([name, value]) => ({
      name: formatStatusLabel(name),
      value,
      fill: STATUS_COLORS[name] || "#9ca3af",
    }));

  const qcData = [
    { name: "Pending", value: qcBreakdown.pending || 0, fill: "#f59e0b" },
    { name: "Approved", value: qcBreakdown.approved || 0, fill: "#10b981" },
    { name: "Rejected", value: qcBreakdown.rejected || 0, fill: "#ef4444" },
  ];

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Videos Uploaded"
          value={totalVideosUploaded}
          icon={VideoCameraIcon}
          color="blue"
        />
        <MetricCard
          title="Videos Delivered"
          value={totalVideosDelivered}
          icon={PaperAirplaneIcon}
          color="green"
        />
        <MetricCard
          title="Total Submissions"
          value={statusBreakdown.total || 0}
          icon={DocumentTextIcon}
          color="purple"
        />
        <MetricCard
          title="Consent Verified"
          value={consentBreakdown.verified || 0}
          icon={CheckCircleIcon}
          color="teal"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <div className="card">
          <h3 className="card-header">Status Distribution</h3>
          {statusData.some((d) => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={statusData.filter((d) => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={true}
                >
                  {statusData
                    .filter((d) => d.value > 0)
                    .map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">
              No data available
            </div>
          )}
        </div>

        {/* QC Distribution */}
        <div className="card">
          <h3 className="card-header">QC Status</h3>
          {qcData.some((d) => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={qcData.filter((d) => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={true}
                >
                  {qcData
                    .filter((d) => d.value > 0)
                    .map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">
              No data available
            </div>
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Trend */}
        <div className="card">
          <h3 className="card-header">Daily Submission Trend</h3>
          {dailyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(date) =>
                    new Date(date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  }
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(date) => new Date(date).toLocaleDateString()}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#1a365d"
                  strokeWidth={2}
                  dot={{ fill: "#1a365d" }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">
              No data available
            </div>
          )}
        </div>

        {/* Language Distribution */}
        <div className="card">
          <h3 className="card-header">Videos by Language</h3>
          {languageDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={languageDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#1a365d" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">
              No data available
            </div>
          )}
        </div>
      </div>

      {/* MR Performance */}
      <div className="card">
        <h3 className="card-header">Top MR Performance</h3>
        {mrPerformance.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={mrPerformance} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="mr_name" type="category" width={150} />
              <Tooltip />
              <Legend />
              <Bar dataKey="submissions" fill="#1a365d" name="Submissions" />
              <Bar dataKey="completed" fill="#10b981" name="Completed" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-400">
            No data available
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, color }) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    teal: "bg-teal-50 text-teal-600",
    orange: "bg-orange-50 text-orange-600",
  };

  return (
    <div className="card">
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${colors[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-900">{value}</div>
          <div className="text-sm text-gray-500">{title}</div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, small }) {
  const statusConfig = {
    draft: { label: "Draft", class: "badge-gray" },
    pending_consent: { label: "Pending Consent", class: "badge-warning" },
    consent_verified: { label: "Verified", class: "badge-info" },
    processing: { label: "Processing", class: "badge-info" },
    pending_qc: { label: "Pending QC", class: "badge-warning" },
    qc_approved: { label: "Approved", class: "badge-success" },
    qc_rejected: { label: "Rejected", class: "badge-error" },
    completed: { label: "Completed", class: "badge-success" },
    failed: { label: "Failed", class: "badge-error" },
  };

  const config = statusConfig[status] || { label: status, class: "badge-gray" };

  return (
    <span
      className={`badge ${config.class} ${
        small ? "text-xs py-0.5 px-1.5" : ""
      }`}
    >
      {config.label}
    </span>
  );
}

function QCBadge({ status }) {
  const statusConfig = {
    pending: { label: "Pending", class: "badge-warning" },
    approved: { label: "Approved", class: "badge-success" },
    rejected: { label: "Rejected", class: "badge-error" },
  };

  const config = statusConfig[status] || {
    label: status || "N/A",
    class: "badge-gray",
  };

  return <span className={`badge ${config.class}`}>{config.label}</span>;
}

function MediaDownloadCell({ entry }) {
  const handleDownloadAudio = async () => {
    if (!entry.audio_url) return;

    try {
      toast.loading("Generating download link...", { id: "download-audio" });
      const response = await storageApi.getSignedDownloadUrl(entry.audio_url);
      toast.dismiss("download-audio");
      window.open(response.data.downloadUrl, "_blank");
    } catch (error) {
      toast.dismiss("download-audio");
      console.error("Error getting download URL:", error);
      toast.error("Failed to download audio");
    }
  };

  if (entry.audio_url) {
    return (
      <button
        onClick={handleDownloadAudio}
        className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 hover:underline"
      >
        <ArrowDownTrayIcon className="w-3 h-3" />
        Audio
      </button>
    );
  }

  if (
    entry.language_status === "processing" ||
    entry.submission_status === "processing"
  ) {
    return (
      <span className="text-xs text-yellow-600 flex items-center gap-1">
        <ArrowPathIcon className="w-3 h-3 animate-spin" />
        Processing
      </span>
    );
  }

  return <span className="text-xs text-gray-400">Pending</span>;
}

function formatStatusLabel(status) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}
