// src/components/Controls.tsx
import React from "react";

export default function Controls({
  loadedModel,
  onUnload,
  language,
  setLanguage,
}: {
  loadedModel: string | null;
  onUnload: () => void;
  language: string;
  setLanguage: (s: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          onClick={onUnload}
          disabled={!loadedModel}
          className={`w-full px-3 py-2 rounded ${loadedModel ? "bg-red-600 text-white" : "bg-gray-300"}`}
        >
          Unload
        </button>
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">Language</label>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full px-2 py-2 rounded border bg-white dark:bg-slate-700">
          <option value="auto">Auto-detect</option>
          <option value="en">English</option>
          <option value="hi">Hindi</option>
          <option value="es">Spanish</option>
          <option value="zh">Chinese</option>
        </select>
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">Input</label>
        <div className="flex gap-2">
          <button className="px-2 py-1 rounded bg-gray-100">Mic</button>
          <button className="px-2 py-1 rounded bg-gray-100">Upload</button>
        </div>
      </div>
    </div>
  );
}
