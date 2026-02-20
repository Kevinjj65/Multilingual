// src/App.tsx
import React, { useEffect, useState } from "react";
import PipelinePage from "./pages/Pipeline";
import TranslatorPage from "./pages/Translator";
import LLMPage from "./pages/LLM";
import RAGPage from "./pages/RAG";
import axiosInstance from "./lib/axiosInstance";

export type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
};

export default function App() {
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [loadedModel, setLoadedModel] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [language, setLanguage] = useState<string>("auto");
  const [activeTab, setActiveTab] =
    useState<"Pipeline" | "Translator" | "LLM" | "RAG">("Pipeline");

  const [pipelineMetrics, setPipelineMetrics] = useState<any | null>(null);

  useEffect(() => {
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
      setLogs((l) => [...l, `Failed to get current LLM: ${String(e)}`]);
    }
  }

  async function refreshModels() {
    try {
      const m = await axiosInstance
        .get("/list_llms")
        .then((res) => res.data.downloaded_llms);
      setModels(m);
      setLogs((l) => [...l, `Found ${m.length} model(s)`]);
    } catch (err) {
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

  async function unloadModel() {
    try {
      await axiosInstance.post("/unload_llm");
      setLoadedModel(null);
      setSelectedModel(null);
      setLogs((l) => [...l, `Unloaded model`]);
    } catch (err) {
      setLogs((l) => [...l, `unload_model error: ${String(err)}`]);
    }
  }

  async function sendUserMessage(text: string) {
    const userMsgId = String(Date.now());
    setMessages((m) => [...m, { id: userMsgId, role: "user", text }]);

    const assistantMsgId = String(Date.now() + 1);
    setMessages((m) => [...m, { id: assistantMsgId, role: "assistant", text: "" }]);

    setPipelineMetrics(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let revealTimer: number | null = null;
    let wordQueue: string[] = [];

    try {
      setRunning(true);

      const res = await fetch("http://localhost:5005/infer", {
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

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      const startReveal = () => {
        if (revealTimer !== null) return;
        revealTimer = window.setInterval(() => {
          if (wordQueue.length === 0) return;
          const nextWord = wordQueue.shift()!;
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") {
              copy[copy.length - 1] = {
                ...last,
                text: (last.text ? last.text + " " : "") + nextWord,
              };
            }
            return copy;
          });
        }, 45);
      };

      const processEvent = (eventData: string) => {
        try { 
          const payload = JSON.parse(eventData);

          if (payload.type === "meta") {
            setLogs((l) => [
              ...l,
              `English input: ${payload.english_in}`,
              `Cache hit: ${payload.cache_hit}`,
            ]);

            if (payload.metrics) {
              setPipelineMetrics({
                cache_hit: payload.cache_hit,
                cache_similarity: payload.cache_similarity,
                ...payload.metrics,
              });
            }
          }

          else if (payload.type === "sentence") {
            const words = String(payload.translated)
              .split(/\s+/)
              .filter(Boolean);
            wordQueue.push(...words);
            startReveal();
          }

          else if (payload.type === "metrics") {
            setPipelineMetrics((prev: any) => ({
              ...(prev || {}),
              ...payload,
            }));
          }

          else if (payload.type === "done") {
  const flushRemaining = () => {
    if (wordQueue.length === 0) {
      if (revealTimer !== null) {
        window.clearInterval(revealTimer);
        revealTimer = null;
      }
      setRunning(false);
      setLogs((l) => [...l, "Response complete"]);
      return;
    }

    const nextWord = wordQueue.shift()!;
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last?.role === "assistant") {
        copy[copy.length - 1] = {
          ...last,
          text: (last.text ? last.text + " " : "") + nextWord,
        };
      }
      return copy;
    });

    requestAnimationFrame(flushRemaining);
  };

  flushRemaining();
}


          else if (payload.type === "error") {
            setRunning(false);
            setLogs((l) => [...l, `Backend error: ${payload.message}`]);
          }
        } catch (e) {
          console.error("Parse error:", e);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");

        for (let i = 0; i < events.length - 1; i++) {
          const event = events[i].trim();
          if (event.startsWith("data: ")) {
            processEvent(event.slice(6));
          }
        }

        buffer = events[events.length - 1];
      }

      if (buffer.trim().startsWith("data: ")) {
        processEvent(buffer.trim().slice(6));
      }

    } catch (err: any) {
      setLogs((l) => [...l, `Stream error: ${String(err)}`]);
      setRunning(false);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6">
      <div className="max-w-6xl mx-auto">

        <div className="mb-4 flex gap-2">
          {(["Pipeline","Translator","LLM","RAG"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 rounded border ${
                activeTab === tab
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white dark:bg-slate-800"
              }`}
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
            onUnloadModel={unloadModel}
            onStartModel={() => {}}
            onStopModel={() => {}}
            onSendMessage={sendUserMessage}
            setLanguage={setLanguage}
            pipelineMetrics={pipelineMetrics}
          />
        )}

        {activeTab === "Translator" && <TranslatorPage />}
        {activeTab === "LLM" && <LLMPage language={language} />}
        {activeTab === "RAG" && <RAGPage />}

      </div>
    </div>
  );
}
