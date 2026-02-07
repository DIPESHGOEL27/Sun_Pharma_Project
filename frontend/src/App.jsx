import { Routes, Route, Navigate, useParams } from "react-router-dom";
import Layout from "./components/Layout";
import DoctorSubmission from "./pages/DoctorSubmission";
import SubmissionsList from "./pages/SubmissionsList";
import SubmissionDetails from "./pages/SubmissionDetails";
import AudioMasters from "./pages/AudioMasters";
import QCDashboard from "./pages/QCDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import ConsentVerification from "./pages/ConsentVerification";
import MRDashboard from "./pages/MRDashboard";

function App() {
  return (
    <Routes>
      {/* Primary Route - Doctor Submission Form (MR facing) */}
      <Route path="/" element={<DoctorSubmission />} />
      <Route path="/submit" element={<DoctorSubmission />} />
      <Route path="/consent/:submissionId" element={<ConsentVerification />} />

      {/* MR Dashboard - View-only submission tracker */}
      <Route path="/mr" element={<MRDashboard />} />

      {/* Legacy direct submission routes -> redirect to admin namespace */}
      <Route
        path="/submissions"
        element={<Navigate to="/admin/submissions" replace />}
      />
      <Route path="/submissions/:id" element={<SubmissionRedirect />} />

      {/* Admin Routes with Layout (Internal use) */}
      <Route path="/admin" element={<Layout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="submissions" element={<SubmissionsList />} />
        <Route path="submissions/:id" element={<SubmissionDetails />} />
        <Route path="audio-masters" element={<AudioMasters />} />
        <Route path="qc" element={<QCDashboard />} />
      </Route>

      {/* 404 */}
      <Route
        path="*"
        element={
          <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-gray-800 mb-4">404</h1>
              <p className="text-gray-600 mb-4">Page not found</p>
              <a href="/" className="btn-primary">
                Go Home
              </a>
            </div>
          </div>
        }
      />
    </Routes>
  );
}

function SubmissionRedirect() {
  const { id } = useParams();
  return (
    <Navigate
      to={id ? `/admin/submissions/${id}` : "/admin/submissions"}
      replace
    />
  );
}

export default App;
