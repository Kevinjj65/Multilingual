// src/components/Controls.tsx

export default function Controls({
  language,
  setLanguage,
}: {
  language: string;
  setLanguage: (s: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="block text-sm text-gray-600 mb-1">Language</label>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full px-2 py-2 rounded border bg-white dark:bg-slate-700">
          <option value="auto">Auto-detect</option>
          <option value="en">English</option>
          <option value="hi">Hindi</option>
          <option value="ta">Tamil</option>
          <option value="ml">Malayalam</option>
          <option value="gu">Gujarati</option>
          <option value="te">Telugu</option>
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
