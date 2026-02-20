import { useState } from "react";
import { keyboards, KeyboardLayout } from "../lib/keyboardLayouts";

export default function VirtualKeyboard({
  language,
  value,
  onChange,
}: {
  language: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [mode, setMode] = useState<"main" | "matra" | "conjuncts">("main");

  if (!keyboards[language]) return null;

  const layout: KeyboardLayout = keyboards[language];

  const handleKeyClick = (key: string) => {
    if (mode === "main") {
      onChange(value + key);
    } else {
      if (!value) return;
      const lastChar = value.slice(-1);
      if (lastChar.trim() === "") return;
      onChange(value.slice(0, -1) + lastChar + key);
    }
  };

  const handleBackspace = () => {
    if (!value) return;
    onChange(value.slice(0, -1));
  };

  const getModeButtonStyle = (current: string) =>
    `px-2 py-1 text-xs rounded transition ${
      mode === current
        ? "bg-indigo-600 text-white"
        : "bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-white hover:bg-slate-400 dark:hover:bg-slate-600"
    }`;

  return (
    <div className="mt-3 p-2 border rounded bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 max-h-56 overflow-y-auto">
      
      {/* Mode Buttons */}
      <div className="flex gap-2 mb-2">
        <button onClick={() => setMode("main")} className={getModeButtonStyle("main")}>
          Letters
        </button>

        <button onClick={() => setMode("matra")} className={getModeButtonStyle("matra")}>
          Matras
        </button>

        <button onClick={() => setMode("conjuncts")} className={getModeButtonStyle("conjuncts")}>
          Conjuncts
        </button>

        <button
          onClick={handleBackspace}
          className="ml-auto px-2 py-1 text-xs rounded bg-red-500 hover:bg-red-600 text-white transition"
        >
          ⌫
        </button>
      </div>

      {/* Keys */}
      <div className="grid grid-cols-10 gap-1">
        {(mode === "main"
          ? layout.main
          : mode === "matra"
          ? layout.matra
          : layout.conjuncts || []
        ).map((k) => (
          <button
            key={k}
            onClick={() => handleKeyClick(k)}
            className="p-1 text-sm rounded 
            bg-white dark:bg-slate-700 
            text-black dark:text-white 
            hover:bg-indigo-300 dark:hover:bg-indigo-500 
            transition"
          >
            {k === " " ? "␣" : k}
          </button>
        ))}
      </div>
    </div>
  );
}
