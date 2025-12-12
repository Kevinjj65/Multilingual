// src/App.tsx
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import ModelList from "./components/ModelList";
import ChatView from "./components/ChatView";
import Controls from "./components/Controls";
import axiosInstance from "./lib/axiosInstance";
export type Message = { id: string; role: "user" | "assistant" | "system"; text: string };

export default function App() {
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [language, setLanguage] = useState<string>("auto");

  useEffect(() => {
    // initial load
    refreshModels();

    // listen to streaming tokens from backend
    const unlistenStream = listen<string>("model-output", (e) => {
      // append token to last assistant message (streaming)
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") {
          // start a new assistant message
          return [...prev, { id: String(Date.now()), role: "assistant", text: e.payload }];
        }
        // append to last
        const copy = prev.slice(0, -1);
        copy.push({ ...last, text: last.text + e.payload });
        return copy;
      });
    });

    const unlistenStatus = listen<{ running: boolean }>("model-status", (e) => {
      setRunning(e.payload.running);
      setLogs((l) => [...l, `Status: running=${e.payload.running}`]);
    });

    return () => {
      unlistenStream.then((f) => f());
      unlistenStatus.then((f) => f());
    };
  }, []);

  async function refreshModels() {
    try {
      // calls Rust `list_models` - returns string[]
      const m = await axiosInstance.get("/list_llms").then((res) => res.data.downloaded_llms);
      setModels(m);
      setLogs((l) => [...l, `Found ${m.length} model(s)`]);
    } catch (err) {
      console.error("list_models error", err);
      setLogs((l) => [...l, `list_models error: ${String(err)}`]);
    }
  }

  async function loadModel(modelName: string) {
    try {
      await invoke("load_model", { id: modelName });
      setSelectedModel(modelName);
      setLogs((l) => [...l, `Loaded ${modelName}`]);
    } catch (err) {
      setLogs((l) => [...l, `load_model error: ${String(err)}`]);
    }
  }

  async function startModel() {
    if (!selectedModel) {
      setLogs((l) => [...l, `No model selected`]);
      return;
    }
    setMessages((m) => [...m, { id: String(Date.now()), role: "user", text: "Running model..." }]);
    try {
      await invoke("start_model", { id: selectedModel });
      setRunning(true);
      setLogs((l) => [...l, `Started ${selectedModel}`]);
    } catch (err) {
      setLogs((l) => [...l, `start_model error: ${String(err)}`]);
    }
  }

  async function stopModel() {
    try {
      await invoke("stop_model");
      setRunning(false);
      setLogs((l) => [...l, `Stopped model`]);
    } catch (err) {
      setLogs((l) => [...l, `stop_model error: ${String(err)}`]);
    }
  }

  async function sendUserMessage(text: string) {
    // push user message and create an empty assistant message to stream into
    setMessages((m) => [...m, { id: String(Date.now()), role: "user", text }]);
    setMessages((m) => [...m, { id: String(Date.now() + 1), role: "assistant", text: "" }]);
    // tell Rust to run the model on prompt (Rust should read latest messages or accept prompt)
    try {
      await invoke("run_prompt", { prompt: text, model: selectedModel ?? "", language });
    } catch (err) {
      setLogs((l) => [...l, `run_prompt error: ${String(err)}`]);
    }
  }

  // quick mock helpers (if backend not ready)
  const mockPopulateMessages = () => {
    setMessages([
      { id: "1", role: "system", text: "Assistant ready. This is a demo UI." },
      { id: "2", role: "user", text: "Hi, can you summarize the latest status?" },
      { id: "3", role: "assistant", text: "Sure — I can summarize once models are hooked up." },
    ]);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-6">
      <div className="max-w-6xl mx-auto grid grid-cols-12 gap-6">
        {/* Left panel: Models + Controls */}
        <aside className="col-span-3 p-4 bg-white dark:bg-slate-800 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-3">Models</h2>
          <ModelList
            models={models}
            selected={selectedModel}
            onRefresh={refreshModels}
            onLoad={loadModel}
          />
          <div className="mt-4">
            <Controls
              running={running}
              onStart={startModel}
              onStop={stopModel}
              language={language}
              setLanguage={setLanguage}
            />
          </div>

          <div className="mt-4">
            <button
              className="text-sm px-3 py-2 bg-gray-200 dark:bg-slate-700 rounded"
              onClick={mockPopulateMessages}
            >
              Seed demo conversation
            </button>
          </div>

          <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            <div>Logs:</div>
            <div className="h-40 overflow-y-auto bg-slate-50 dark:bg-slate-900 p-2 rounded border">
              {logs.map((l, i) => (
                <div key={i} className="font-mono text-[12px]">
                  {l}
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Main chat area */}
        <main className="col-span-9 p-4 bg-white dark:bg-slate-800 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold"> Edge Multilingual Assistant</h1>
            <div className="text-sm text-gray-500 dark:text-gray-400">Model: {selectedModel ?? "—"}</div>
          </div>

          <ChatView messages={messages} onSend={sendUserMessage} />
        </main>
      </div>
    </div>
  );
}
