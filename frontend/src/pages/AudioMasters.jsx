import { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import toast from "react-hot-toast";
import { audioMastersApi } from "../services/api";
import {
  MusicalNoteIcon,
  PlusIcon,
  TrashIcon,
  PlayIcon,
  PauseIcon,
  XMarkIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

export default function AudioMasters() {
  const [loading, setLoading] = useState(true);
  const [languages, setLanguages] = useState([]);
  const [masters, setMasters] = useState({});
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(null);
  const [playingId, setPlayingId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [langRes, mastersRes] = await Promise.all([
        audioMastersApi.getLanguages(),
        audioMastersApi.list(),
      ]);
      setLanguages(langRes.data);

      // Group masters by language
      const grouped = {};
      mastersRes.data.languages?.forEach((lang) => {
        grouped[lang.language_code] = lang.masters || [];
      });
      setMasters(grouped);
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Failed to load audio masters");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (masterId, languageCode) => {
    if (!window.confirm("Are you sure you want to delete this audio master?"))
      return;

    try {
      await audioMastersApi.delete(masterId);
      toast.success("Audio master deleted");

      // Update local state
      setMasters((prev) => ({
        ...prev,
        [languageCode]: prev[languageCode].filter((m) => m.id !== masterId),
      }));
    } catch (error) {
      toast.error("Failed to delete audio master");
    }
  };

  const handleToggleActive = async (masterId, languageCode, currentState) => {
    try {
      await audioMastersApi.update(masterId, {
        is_active: currentState ? 0 : 1,
      });
      toast.success(
        currentState ? "Audio master deactivated" : "Audio master activated"
      );
      loadData();
    } catch (error) {
      toast.error("Failed to update audio master");
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audio Masters</h1>
          <p className="text-gray-500">
            Language-wise master audio for speech-to-speech conversion
          </p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          Upload Audio Master
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">About Audio Masters</h4>
        <p className="text-sm text-blue-800">
          Audio masters are the base recordings used for speech-to-speech
          conversion. When a doctor's voice is cloned, it will be used to speak
          the content from these master recordings in each selected language.
          Upload high-quality, clear audio recordings for best results.
        </p>
      </div>

      {/* Languages Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {languages.map((lang) => (
          <div key={lang.code} className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">{lang.name}</h3>
                <p className="text-sm text-gray-500">{lang.native_name}</p>
              </div>
              <button
                onClick={() => {
                  setSelectedLanguage(lang.code);
                  setShowUploadModal(true);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg text-sunpharma-blue"
                title="Add audio master"
              >
                <PlusIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Masters List */}
            <div className="space-y-2">
              {masters[lang.code]?.length > 0 ? (
                masters[lang.code].map((master) => (
                  <AudioMasterItem
                    key={master.id}
                    master={master}
                    languageCode={lang.code}
                    isPlaying={playingId === master.id}
                    onPlay={() =>
                      setPlayingId(playingId === master.id ? null : master.id)
                    }
                    onDelete={() => handleDelete(master.id, lang.code)}
                    onToggleActive={() =>
                      handleToggleActive(master.id, lang.code, master.is_active)
                    }
                  />
                ))
              ) : (
                <div className="text-center py-6 text-gray-400">
                  <MusicalNoteIcon className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">No audio masters</p>
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between text-sm">
              <span className="text-gray-500">
                {masters[lang.code]?.length || 0} total
              </span>
              <span className="text-green-600">
                {masters[lang.code]?.filter((m) => m.is_active).length || 0}{" "}
                active
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadModal
          languages={languages}
          selectedLanguage={selectedLanguage}
          onClose={() => {
            setShowUploadModal(false);
            setSelectedLanguage(null);
          }}
          onSuccess={() => {
            setShowUploadModal(false);
            setSelectedLanguage(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}

function AudioMasterItem({
  master,
  languageCode,
  isPlaying,
  onPlay,
  onDelete,
  onToggleActive,
}) {
  return (
    <div
      className={`p-3 rounded-lg border ${
        master.is_active
          ? "border-green-200 bg-green-50"
          : "border-gray-200 bg-gray-50"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={onPlay}
            className={`p-2 rounded-full ${
              isPlaying
                ? "bg-green-500 text-white"
                : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            {isPlaying ? (
              <PauseIcon className="w-4 h-4" />
            ) : (
              <PlayIcon className="w-4 h-4" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 truncate">
              {master.name}
            </div>
            {master.duration_seconds && (
              <div className="text-xs text-gray-500">
                {Math.floor(master.duration_seconds / 60)}:
                {String(Math.floor(master.duration_seconds % 60)).padStart(
                  2,
                  "0"
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleActive}
            className={`p-1.5 rounded ${
              master.is_active
                ? "text-green-600 hover:bg-green-100"
                : "text-gray-400 hover:bg-gray-100"
            }`}
            title={master.is_active ? "Deactivate" : "Activate"}
          >
            <CheckCircleIcon className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded text-red-500 hover:bg-red-50"
            title="Delete"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
      {master.description && (
        <p className="mt-2 text-xs text-gray-500 truncate">
          {master.description}
        </p>
      )}
    </div>
  );
}

function UploadModal({ languages, selectedLanguage, onClose, onSuccess }) {
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    language_code: selectedLanguage || "",
    name: "",
    description: "",
  });
  const [audioFile, setAudioFile] = useState(null);

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles[0]) {
      setAudioFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "audio/mpeg": [],
      "audio/wav": [],
      "audio/x-m4a": [],
      "audio/mp4": [],
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.language_code || !formData.name || !audioFile) {
      toast.error("Please fill all required fields");
      return;
    }

    setUploading(true);
    try {
      const data = new FormData();
      data.append("language_code", formData.language_code);
      data.append("name", formData.name);
      data.append("description", formData.description);
      data.append("audio", audioFile);

      await audioMastersApi.create(data);
      toast.success("Audio master uploaded successfully!");
      onSuccess();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(
        error.response?.data?.error || "Failed to upload audio master"
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Upload Audio Master</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Language Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Language <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.language_code}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  language_code: e.target.value,
                }))
              }
              className="w-full p-3 border border-gray-300 rounded-lg"
              required
            >
              <option value="">Select language</option>
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name} ({lang.native_name})
                </option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="e.g., Main Script v1"
              className="w-full p-3 border border-gray-300 rounded-lg"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Optional description..."
              rows={2}
              className="w-full p-3 border border-gray-300 rounded-lg resize-none"
            />
          </div>

          {/* Audio Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Audio File <span className="text-red-500">*</span>
            </label>
            <div
              {...getRootProps()}
              className={`dropzone ${isDragActive ? "active" : ""}`}
            >
              <input {...getInputProps()} />
              {audioFile ? (
                <div className="text-center">
                  <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg inline-flex items-center gap-2">
                    <MusicalNoteIcon className="w-5 h-5" />
                    {audioFile.name}
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    {(audioFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div className="text-gray-500">
                  <MusicalNoteIcon className="w-10 h-10 mx-auto mb-2 text-gray-400" />
                  <p>Drop audio file here or click to upload</p>
                  <p className="text-sm text-gray-400 mt-1">
                    MP3, WAV, or M4A (max 50MB)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary py-3"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="flex-1 btn-primary py-3 disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
