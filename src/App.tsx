// src/App.tsx
import React, { useEffect, useState } from "react";
import PipelinePage from "./pages/Pipeline";
import TranslatorPage from "./pages/Translator";
import LLMPage from "./pages/LLM";
import RAGPage from "./pages/RAG";
import axiosInstance from "./lib/axiosInstance";
export type Message = { id: string; role: "user" | "assistant" | "system"; text: string };

export default function App() {
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [loadedModel, setLoadedModel] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [language, setLanguage] = useState<string>("auto");
  const [activeTab, setActiveTab] = useState<"Pipeline" | "Translator" | "LLM" | "RAG">("Pipeline");

  useEffect(() => {
    // initial load
    fetchCurrentLlm();
    refreshModels();
  }, []);

  async function fetchCurrentLlm() {
    try {
      const res = await axiosInstance.get("/current_llm");
      const data = res.data || {};
      setLoadedModel(data.loaded_llm || null);
      setSelectedModel(data.loaded_llm || null);
      setLogs((l) => [...l, `Current LLM: ${data.loaded_llm || "none"}`]);
    } catch (e: any) {
      setLogs((l) => [...l, `Failed to get current LLM: ${String(e?.message || e)}`]);
    }
  }

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
      await axiosInstance.post("/load_llm", { name: modelName });
      setSelectedModel(modelName);
      setLoadedModel(modelName);
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
    setRunning(true);
    setLogs((l) => [...l, `Started ${selectedModel}`]);
  }

  async function stopModel() {
    setRunning(false);
    setLogs((l) => [...l, `Stopped model`]);
  }

  async function sendUserMessage(text: string) {
    // Add user message to chat
    const userMsgId = String(Date.now());
    setMessages((m) => [...m, { id: userMsgId, role: "user", text }]);

    // Create empty assistant message to stream into
    const assistantMsgId = String(Date.now() + 1);
    setMessages((m) => [...m, { id: assistantMsgId, role: "assistant", text: "" }]);

    // Use fetch + ReadableStream for SSE in browser/Tauri WebView
    const controller = new AbortController();
    const timeoutMs = 30_000; // 30s timeout to reduce premature aborts
    const timeoutId = setTimeout(() => controller.abort("timeout"), timeoutMs);

    let revealTimer: number | null = null;

    try {
      setRunning(true);

      const res = await fetch(`http://localhost:5005/infer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          text,
          lang: language === "auto" ? "auto" : language,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.body) {
        throw new Error("No response body (stream) from /infer");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let translatedSentences: string[] = [];
      // Word-by-word reveal queue to mimic ChatGPT streaming
      let wordQueue: string[] = [];

      const startReveal = () => {
        if (revealTimer !== null) return;
        revealTimer = window.setInterval(() => {
          if (wordQueue.length === 0) {
            // pause until more words arrive
            return;
          }
          const nextWord = wordQueue.shift()!;
          // Append next word to the last assistant message
          setMessages((prev) => {
            const copy = [...prev];
            const lastMsg = copy[copy.length - 1];
            if (lastMsg && lastMsg.role === "assistant") {
              const newText = (lastMsg.text ? lastMsg.text + " " : "") + nextWord;
              copy[copy.length - 1] = { ...lastMsg, text: newText };
            }
            return copy;
          });
        }, 45); // ~45ms per word for a natural flow
      };

      const processEvent = (eventData: string) => {
        console.log("[SSE data]", eventData);
        try {
          const payload = JSON.parse(eventData);

          if (payload.type === "meta") {
            setLogs((l) => [...l, `English input: ${payload.english_in}`, `Prompt generated`]);
          } else if (payload.type === "sentence") {
            // Push words of this sentence into the reveal queue
            const words = String(payload.translated).split(/\s+/).filter(Boolean);
            wordQueue.push(...words);
            translatedSentences.push(payload.translated);
            // Start reveal if not already running
            startReveal();
          } else if (payload.type === "done") {
            setRunning(false);
            setLogs((l) => [...l, `Response complete`]);
            // Stop reveal timer when stream finishes
            if (revealTimer !== null) {
              window.clearInterval(revealTimer);
              revealTimer = null;
            }
          } else if (payload.type === "error") {
            setRunning(false);
            setLogs((l) => [...l, `Backend error: ${payload.message}`]);
            if (revealTimer !== null) {
              window.clearInterval(revealTimer);
              revealTimer = null;
            }
          }
        } catch (e) {
          console.error("Failed to parse event:", eventData, e);
          setLogs((l) => [...l, `Parse error: ${String(e)}`]);
        }
      };

      // Read the stream loop
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunkText = decoder.decode(value, { stream: true });
        console.log("[chunk]", chunkText);
        buffer += chunkText;

        const events = buffer.split("\n\n");
        for (let i = 0; i < events.length - 1; i++) {
          const event = events[i].trim();
          if (event.startsWith("data: ")) {
            const eventData = event.slice(6);
            processEvent(eventData);
          } else {
            console.log("[SSE unknown event format]", event);
          }
        }
        buffer = events[events.length - 1];
      }

      // Flush remaining buffer
      if (buffer.trim().startsWith("data: ")) {
        processEvent(buffer.trim().slice(6));
      }
      setRunning(false);
      if (revealTimer !== null) {
        window.clearInterval(revealTimer);
        revealTimer = null;
      }
    } catch (err: any) {
      const msg = err?.name === "AbortError" ? `Request aborted: ${String(err?.message)}` : String(err);
      console.error("[stream error]", err);
      setLogs((l) => [...l, `Stream error: ${msg}`]);
      setRunning(false);
      // Ensure timer cleanup on errors
      // revealTimer may remain set if error occurs mid-stream
      // so clear it defensively
      // (no-op if already null)
      //
      if (revealTimer !== null) {
        window.clearInterval(revealTimer);
        revealTimer = null;
      }
    } finally {
      clearTimeout(timeoutId);
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
      <div className="max-w-6xl mx-auto">
        {/* Tabs */}
        <div className="mb-4 flex gap-2">
          {(["Pipeline","Translator","LLM","RAG"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 rounded border ${activeTab === tab ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-slate-800"}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "Pipeline" && (
          <PipelinePage
            models={models}
            selectedModel={selectedModel}
            loadedModel={loadedModel}
            running={running}
            messages={messages}
            logs={logs}
            language={language}
            onRefreshModels={refreshModels}
            onLoadModel={loadModel}
            onStartModel={startModel}
            onStopModel={stopModel}
            onSendMessage={sendUserMessage}
            setLanguage={setLanguage}
          />
        )}

        {activeTab === "Translator" && <TranslatorPage />}

        {activeTab === "LLM" && <LLMPage />}

        {activeTab === "RAG" && <RAGPage />}
      </div>
    </div>
  );
}
