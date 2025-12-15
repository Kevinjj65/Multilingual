// src/components/ModelList.tsx
import React from "react";

type Props = {
  models: string[];
  selected?: string | null;
  loadedModel?: string | null;
  onRefresh: () => void;
  onLoad: (id: string) => void;
};

export default function ModelList({ models, selected, loadedModel, onRefresh, onLoad }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">Available</div>
        <button onClick={onRefresh} className="text-xs px-2 py-1 bg-indigo-100 rounded">Refresh</button>
      </div>

      <div className="space-y-2">
        {models.length === 0 && <div className="text-sm text-gray-500">No models found — drop .gguf files in <code>./models</code></div>}
        {models.map((m) => (
          <div key={m} className={`p-2 border rounded flex items-center justify-between ${selected === m ? "ring-2 ring-indigo-400" : ""}`}>
            <div className="truncate">{m}</div>
            <div className="flex gap-2">
              {loadedModel === m ? (
                <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">Loaded</span>
              ) : (
                <button
                  className="text-xs px-2 py-1 bg-green-100 rounded"
                  onClick={() => onLoad(m)}
                >
                  Load
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
