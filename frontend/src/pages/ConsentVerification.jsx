import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import toast, { Toaster } from "react-hot-toast";
import { consentApi } from "../services/api";
import {
  CheckCircleIcon,
  EnvelopeIcon,
  ShieldCheckIcon,
  ArrowPathIcon,
  HomeIcon,
  DocumentTextIcon,
  PhoneIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

// Helper function to strip "Dr." prefix from name if already present
const stripDrPrefix = (name) => {
  if (!name) return name;
  return name.replace(/^Dr\.?\s*/i, '').trim();
};

export default function ConsentVerification() {
  const { submissionId } = useParams();

  // State
  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState(null);

  // Consent state
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentComplete, setConsentComplete] = useState(false);

  // OTP state
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpInputsRef = useRef([]);

  // Load submission details
  useEffect(() => {
    loadSubmission();
  }, [submissionId]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(
        () => setResendCooldown(resendCooldown - 1),
        1000
      );
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const loadSubmission = async () => {
    try {
      const response = await consentApi.getSubmissionDetails(submissionId);
      setSubmission(response.data);

      // Check if already verified
      if (response.data.consent_status === "verified") {
        setConsentComplete(true);
      }
    } catch (error) {
      console.error("Error loading submission:", error);
      toast.error("Failed to load submission details");
    } finally {
      setLoading(false);
    }
  };

  // Send OTP
  const handleSendOtp = async () => {
    if (!consentAccepted) {
      toast.error("Please accept the consent terms first");
      return;
    }

    setOtpSending(true);
    try {
      await consentApi.sendOtp(
        submissionId,
        submission?.doctor_email_full || null,
        submission?.doctor_name || null
      );
      toast.success("OTP sent to doctor's email!");
      setOtpSent(true);
      setResendCooldown(60);
    } catch (error) {
      console.error("Send OTP error:", error);
      toast.error(error.response?.data?.error || "Failed to send OTP");
    } finally {
      setOtpSending(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;

    setOtpSending(true);
    try {
      await consentApi.resendOtp(
        submissionId,
        submission?.doctor_email_full || null,
        submission?.doctor_name || null
      );
      toast.success("OTP resent successfully!");
      setResendCooldown(60);
      setOtp(["", "", "", "", "", ""]);
    } catch (error) {
      console.error("Resend OTP error:", error);
      if (error.response?.data?.wait_seconds) {
        setResendCooldown(error.response.data.wait_seconds);
      }
      toast.error(error.response?.data?.error || "Failed to resend OTP");
    } finally {
      setOtpSending(false);
    }
  };

  // OTP input handlers
  const handleOtpChange = (index, value) => {
    if (value.length > 1) return;
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").slice(0, 6);
    if (!/^\d+$/.test(pastedData)) return;

    const newOtp = [...otp];
    pastedData.split("").forEach((char, i) => {
      if (i < 6) newOtp[i] = char;
    });
    setOtp(newOtp);
  };

  // Verify OTP and submit consent
  const handleVerifyAndSubmit = async () => {
    const otpValue = otp.join("");
    if (otpValue.length !== 6) {
      toast.error("Please enter complete 6-digit OTP");
      return;
    }

    setOtpVerifying(true);
    try {
      // First verify OTP
      await consentApi.verifyOtp(submissionId, otpValue);

      // Then submit consent with all terms accepted
      const consents = {
        imageUse: true,
        voiceUse: true,
        voiceCloning: true,
        publicDistribution: true,
      };
      await consentApi.submitConsent(submissionId, consents);

      toast.success("Consent verified and submitted successfully!");
      setConsentComplete(true);
    } catch (error) {
      console.error("Verification error:", error);
      toast.error(error.response?.data?.error || "Verification failed");
      setOtp(["", "", "", "", "", ""]);
      otpInputsRef.current[0]?.focus();
    } finally {
      setOtpVerifying(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Consent completed state
  if (consentComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />

        {/* Header with Logo */}
        <header className="bg-white shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/sustencaplogo.jpg"
                alt="Susten Cap Logo"
                className="h-12 object-contain"
              />
              <div className="hidden sm:block border-l border-gray-200 pl-3">
                <p className="text-sm font-semibold text-gray-900">
                  Sun Pharma
                </p>
                <p className="text-xs text-gray-500">AI Video Platform</p>
              </div>
            </div>
            <Link
              to="/submit"
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <HomeIcon className="w-4 h-4" />
              <span className="hidden sm:inline">New Submission</span>
            </Link>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-12">
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            {/* Success Banner */}
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 px-8 py-6 text-center">
              <div className="w-20 h-20 bg-white/20 backdrop-blur rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircleIcon className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">
                Consent Verified Successfully!
              </h2>
              <p className="text-green-100">
                Thank you, Dr. {stripDrPrefix(submission?.doctor_name)}
              </p>
            </div>

            <div className="p-8">
              {/* Confirmation Details */}
              <div className="bg-gray-50 rounded-xl p-6 mb-6">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <DocumentTextIcon className="w-5 h-5 text-blue-600" />
                  Submission Details
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Reference ID</p>
                    <p className="font-medium text-gray-900">#{submissionId}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Doctor</p>
                    <p className="font-medium text-gray-900">
                      {submission?.doctor_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Email</p>
                    <p className="font-medium text-gray-900">
                      {submission?.doctor_email || submission?.masked_email}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Status</p>
                    <span className="inline-flex items-center gap-1 text-green-700 font-medium">
                      <CheckCircleIcon className="w-4 h-4" />
                      Verified
                    </span>
                  </div>
                </div>
              </div>

              {/* What Happens Next */}
              <div className="bg-blue-50 rounded-xl p-6 mb-6">
                <h4 className="font-semibold text-blue-900 mb-4">
                  What happens next?
                </h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                      1
                    </div>
                    <div>
                      <p className="font-medium text-blue-900">Voice Cloning</p>
                      <p className="text-sm text-blue-700">
                        Your voice will be cloned using AI technology
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                      2
                    </div>
                    <div>
                      <p className="font-medium text-blue-900">
                        Video Generation
                      </p>
                      <p className="text-sm text-blue-700">
                        Videos will be generated in your selected languages
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                      3
                    </div>
                    <div>
                      <p className="font-medium text-blue-900">
                        Quality Review
                      </p>
                      <p className="text-sm text-blue-700">
                        QC team will review the generated content
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
                      4
                    </div>
                    <div>
                      <p className="font-medium text-blue-900">Delivery</p>
                      <p className="text-sm text-blue-700">
                        Final videos will be delivered after approval
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg mb-6">
                <PhoneIcon className="w-5 h-5 text-gray-400" />
                <p className="text-sm text-gray-600">
                  For any queries, please contact your Medical Representative or
                  email support@sunpharma.com
                </p>
              </div>

              {/* Navigation Button */}
              <div className="flex justify-center">
                <Link
                  to="/submit"
                  className="bg-blue-600 text-white py-3 px-8 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <HomeIcon className="w-5 h-5" />
                  Submit Another Entry
                </Link>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-8 py-4 border-t">
              <p className="text-xs text-gray-500 text-center">
                © {new Date().getFullYear()} Sun Pharmaceutical Industries Ltd.
                All rights reserved.
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Main consent form - single page flow
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />

      {/* Header with Logo */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/sustencaplogo.jpg"
              alt="Susten Cap Logo"
              className="h-12 object-contain"
            />
            <div className="hidden sm:block border-l border-gray-200 pl-3">
              <p className="text-sm font-semibold text-gray-900">Sun Pharma</p>
              <p className="text-xs text-gray-500">AI Video Platform</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Consent Verification</p>
            <p className="text-sm font-medium text-gray-900">
              Ref: #{submissionId}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Title Banner */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
                <ShieldCheckIcon className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Doctor Consent Form
                </h1>
                <p className="text-blue-100">
                  AI Video Generation for Patient Education
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-8">
            {/* Doctor Info */}
            <div className="bg-blue-50 rounded-xl p-4 mb-6">
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-blue-600">Doctor:</span>{" "}
                  <span className="font-medium text-blue-900">
                    Dr. {stripDrPrefix(submission?.doctor_name)}
                  </span>
                </div>
                <div>
                  <span className="text-blue-600">Email:</span>{" "}
                  <span className="font-medium text-blue-900">
                    {submission?.doctor_email}
                  </span>
                </div>
                {submission?.doctor_specialization && (
                  <div>
                    <span className="text-blue-600">Specialization:</span>{" "}
                    <span className="font-medium text-blue-900">
                      {submission?.doctor_specialization}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Purpose Section */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <DocumentTextIcon className="w-5 h-5 text-blue-600" />
                Purpose of the Video
              </h2>
              <div className="bg-gray-50 rounded-xl p-5 text-gray-700 leading-relaxed">
                <p>
                  This video is part of a{" "}
                  <strong>patient education initiative</strong> aimed at
                  improving treatment adherence and usage of{" "}
                  <strong>Susten Capsules through Vaginal Route</strong>. The
                  video will feature you demonstrating the medically accurate
                  steps for vaginal insertion of the Susten Capsules.
                </p>
              </div>
            </div>

            {/* Consent Terms Section */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <ShieldCheckIcon className="w-5 h-5 text-blue-600" />
                Consent and Agreement
              </h2>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <p className="text-gray-800 mb-4 font-medium">
                  By providing your consent, you (Dr. {stripDrPrefix(submission?.doctor_name)})
                  hereby agree to the following:
                </p>
                <ol className="space-y-3 text-gray-700">
                  <li className="flex gap-3">
                    <span className="w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                      1
                    </span>
                    <span>
                      <strong>Participation in AI Video Recording:</strong> You
                      agree to participate in the recording of an AI Video
                      demonstrating the administration of Susten Capsules.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                      2
                    </span>
                    <span>
                      <strong>Use of Personal Information:</strong> You allow
                      the use of your name, voice, image, and professional
                      credentials in the video for educational purposes.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                      3
                    </span>
                    <span>
                      <strong>Medical Accuracy:</strong> You confirm that the
                      demonstration will be medically accurate, based on
                      standard clinical practice.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                      4
                    </span>
                    <span>
                      <strong>Educational Distribution:</strong> You acknowledge
                      that this video is intended for patient education only and
                      will be disseminated through approved channels.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                      5
                    </span>
                    <span>
                      <strong>Brand Usage:</strong> You understand that the
                      video will explicitly feature and refer to the brand
                      <strong> Susten Capsules</strong> usage through vaginal
                      route.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="w-6 h-6 bg-amber-500 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                      6
                    </span>
                    <span>
                      <strong>No Conflict of Interest:</strong> You confirm that
                      you have no conflict of interest related to the brand or
                      its manufacturer.
                    </span>
                  </li>
                </ol>
              </div>
            </div>

            {/* Consent Checkbox */}
            <div className="mb-8">
              <label
                className={`flex items-start gap-4 p-5 rounded-xl border-2 cursor-pointer transition-all ${
                  consentAccepted
                    ? "border-green-500 bg-green-50"
                    : "border-gray-200 hover:border-blue-300 bg-white"
                }`}
              >
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                  className="w-6 h-6 text-green-600 border-gray-300 rounded focus:ring-green-500 mt-0.5 flex-shrink-0"
                />
                <div>
                  <p className="font-semibold text-gray-900 mb-1">
                    I Accept All Terms and Conditions
                  </p>
                  <p className="text-sm text-gray-600">
                    By checking this box, I (Dr. {stripDrPrefix(submission?.doctor_name)})
                    confirm that I have read, understood, and agree to all the
                    consent terms mentioned above. I give my full consent to
                    participate in this AI video generation project for patient
                    education.
                  </p>
                </div>
              </label>
            </div>

            {/* OTP Verification Section */}
            <div
              className={`border-t pt-6 ${
                !consentAccepted ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <EnvelopeIcon className="w-5 h-5 text-blue-600" />
                Email Verification
              </h2>

              {!otpSent ? (
                // Send OTP Button
                <div className="text-center">
                  <p className="text-gray-600 mb-4">
                    To complete your consent, we will send a one-time
                    verification code to:
                    <br />
                    <strong className="text-gray-900">
                      {submission?.doctor_email_full ||
                        submission?.doctor_email}
                    </strong>
                  </p>
                  <button
                    onClick={handleSendOtp}
                    disabled={otpSending || !consentAccepted}
                    className="inline-flex items-center gap-2 bg-blue-600 text-white py-3 px-8 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {otpSending ? (
                      <>
                        <ArrowPathIcon className="w-5 h-5 animate-spin" />
                        Sending OTP...
                      </>
                    ) : (
                      <>
                        <EnvelopeIcon className="w-5 h-5" />
                        Send Verification Code
                      </>
                    )}
                  </button>
                </div>
              ) : (
                // OTP Input Section
                <div>
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm mb-3">
                      <CheckCircleIcon className="w-4 h-4" />
                      OTP sent to {submission?.doctor_email}
                    </div>
                    <p className="text-gray-600">
                      Please enter the 6-digit verification code sent to the
                      doctor's email
                    </p>
                  </div>

                  {/* OTP Input */}
                  <div className="flex justify-center gap-2 sm:gap-3 mb-4">
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => (otpInputsRef.current[index] = el)}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        onPaste={handleOtpPaste}
                        className="w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-bold border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors"
                      />
                    ))}
                  </div>

                  {/* Resend OTP */}
                  <div className="text-center mb-6">
                    {resendCooldown > 0 ? (
                      <p className="text-gray-500 text-sm">
                        Resend OTP in{" "}
                        <span className="font-medium">{resendCooldown}s</span>
                      </p>
                    ) : (
                      <button
                        onClick={handleResendOtp}
                        disabled={otpSending}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium inline-flex items-center gap-1"
                      >
                        <ArrowPathIcon
                          className={`w-4 h-4 ${
                            otpSending ? "animate-spin" : ""
                          }`}
                        />
                        Resend OTP
                      </button>
                    )}
                  </div>

                  {/* Verify Button */}
                  <div className="text-center">
                    <button
                      onClick={handleVerifyAndSubmit}
                      disabled={otpVerifying || otp.join("").length !== 6}
                      className="inline-flex items-center gap-2 bg-green-600 text-white py-3 px-8 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {otpVerifying ? (
                        <>
                          <ArrowPathIcon className="w-5 h-5 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        <>
                          <ShieldCheckIcon className="w-5 h-5" />
                          Verify & Submit Consent
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Warning Note */}
            <div className="mt-6 flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-600">
                <strong>Important:</strong> The OTP is valid for 10 minutes.
                Please ensure the doctor has access to their email to provide
                the verification code.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-8 py-4 border-t">
            <p className="text-xs text-gray-500 text-center">
              © {new Date().getFullYear()} Sun Pharmaceutical Industries Ltd.
              All rights reserved.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
