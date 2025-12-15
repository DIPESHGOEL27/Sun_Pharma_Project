import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { submissionsApi } from "../services/api";
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  EyeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "draft", label: "Draft" },
  { value: "pending_consent", label: "Pending Consent" },
  { value: "consent_verified", label: "Consent Verified" },
  { value: "processing", label: "Processing" },
  { value: "pending_qc", label: "Pending QC" },
  { value: "qc_approved", label: "QC Approved" },
  { value: "qc_rejected", label: "QC Rejected" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

const QC_STATUS_OPTIONS = [
  { value: "", label: "All QC Status" },
  { value: "pending", label: "Pending" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export default function SubmissionsList() {
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });
  const [filters, setFilters] = useState({
    status: "",
    qc_status: "",
    search: "",
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadSubmissions();
  }, [pagination.page, filters.status, filters.qc_status]);

  const loadSubmissions = async () => {
    setLoading(true);
    try {
      const response = await submissionsApi.list({
        page: pagination.page,
        limit: 20,
        status: filters.status || undefined,
        qc_status: filters.qc_status || undefined,
      });
      setSubmissions(response.data.submissions);
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

  const filteredSubmissions = submissions.filter((sub) => {
    if (!filters.search) return true;
    const search = filters.search.toLowerCase();
    return (
      sub.doctor_name?.toLowerCase().includes(search) ||
      sub.doctor_email?.toLowerCase().includes(search) ||
      sub.mr_code?.toLowerCase().includes(search) ||
      sub.id.toString().includes(search)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Submissions</h1>
          <p className="text-gray-500">{pagination.total} total submissions</p>
        </div>
        <Link to="/submit" target="_blank" className="btn-primary">
          + New Submission
        </Link>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, or ID..."
              value={filters.search}
              onChange={(e) => handleFilterChange("search", e.target.value)}
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
        ) : filteredSubmissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <p className="text-lg font-medium">No submissions found</p>
            <p className="text-sm">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Doctor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    MR Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Languages
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    QC Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredSubmissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      #{sub.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {sub.doctor_name || "N/A"}
                        </div>
                        <div className="text-sm text-gray-500">
                          {sub.doctor_email}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {sub.mr_code || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {sub.selected_languages?.map((lang) => (
                          <span key={lang} className="badge badge-info text-xs">
                            {lang.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <QCStatusBadge status={sub.qc_status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(sub.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <Link
                        to={`/submissions/${sub.id}`}
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
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Page {pagination.page} of {pagination.totalPages}
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
    draft: { label: "Draft", class: "bg-gray-100 text-gray-700" },
    pending_consent: {
      label: "Pending Consent",
      class: "bg-yellow-100 text-yellow-800",
    },
    consent_verified: { label: "Verified", class: "bg-blue-100 text-blue-800" },
    processing: { label: "Processing", class: "bg-purple-100 text-purple-800" },
    voice_cloning: { label: "Cloning", class: "bg-purple-100 text-purple-800" },
    audio_generation: {
      label: "Audio Gen",
      class: "bg-indigo-100 text-indigo-800",
    },
    video_generation: {
      label: "Video Gen",
      class: "bg-cyan-100 text-cyan-800",
    },
    pending_qc: { label: "Pending QC", class: "bg-amber-100 text-amber-800" },
    qc_approved: { label: "Approved", class: "bg-green-100 text-green-800" },
    qc_rejected: { label: "Rejected", class: "bg-red-100 text-red-800" },
    completed: { label: "Completed", class: "bg-emerald-100 text-emerald-800" },
    failed: { label: "Failed", class: "bg-red-100 text-red-800" },
  };
  const c = config[status] || {
    label: status,
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
    label: status || "N/A",
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
