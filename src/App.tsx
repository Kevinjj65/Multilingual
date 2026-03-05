// src/App.tsx
import { useEffect, useRef, useState } from "react";
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

type TranslatorModel = {
  id: "m2m_onnx" | "nllb_onnx" | "nllb_pytorch";
  label: string;
  available: boolean;
  loaded: boolean;
};

type RagModel = {
  id: string;
  label: string;
  available: boolean;
  loaded: boolean;
};

type TranslatorStatusResponse = {
  active_translator: string;
  active_translator_key?: "onnx" | "nllb" | "none";
  loaded_translator_key?: "onnx" | "nllb" | "none";
  active_onnx_family?: "m2m" | "nllb";
  onnx_families?: {
    m2m?: { available?: boolean };
    nllb?: { available?: boolean };
  };
  nllb?: {
    available?: boolean;
  };
};

export default function App() {
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [loadedModel, setLoadedModel] = useState<string | null>(null);
  const [, setRunning] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [language, setLanguage] = useState<string>("auto");
  const [activeTab, setActiveTab] =
    useState<"Pipeline" | "Translator" | "LLM" | "RAG">("Pipeline");

  const [pipelineMetrics, setPipelineMetrics] = useState<any | null>(null);
  const [activeOnnxFamily, setActiveOnnxFamily] = useState<"m2m" | "nllb">("m2m");
  const [translatorModels, setTranslatorModels] = useState<TranslatorModel[]>([
    { id: "m2m_onnx", label: "M2M ONNX", available: false, loaded: false },
    { id: "nllb_onnx", label: "NLLB ONNX", available: false, loaded: false },
    { id: "nllb_pytorch", label: "NLLB PyTorch", available: true, loaded: false },
  ]);
  const [ragModels, setRagModels] = useState<RagModel[]>([]);
  const logSeenRef = useRef<Map<string, number>>(new Map());

  const appendLog = (message: string) => {
    const text = String(message || "").trim();
    if (!text) return;
    const now = Date.now();
    const lastSeen = logSeenRef.current.get(text) || 0;
    if (now - lastSeen < 2500) return;
    logSeenRef.current.set(text, now);
    setLogs((prev) => [...prev, text]);
  };

  const prettyBackendName = (value: string | null | undefined) => {
    const raw = String(value || "none").trim();
    if (!raw || raw.toLowerCase() === "none") return "None";
    if (raw === "m2m_onnx") return "M2M ONNX";
    if (raw === "nllb_onnx") return "NLLB ONNX";
    if (raw === "nllb") return "NLLB PyTorch";
    return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  useEffect(() => {
    fetchCurrentLlm();
    refreshModels();
    refreshTranslatorModels();
    refreshRagModels();
  }, []);

  async function fetchCurrentLlm() {
    try {
      const res = await axiosInstance.get("/current_llm");
      const data = res.data || {};
      setLoadedModel(data.loaded_llm || null);
      setSelectedModel(data.loaded_llm || null);
      const current = data.loaded_llm || "none";
      appendLog(`LLM: Selected ${prettyBackendName(current)} | Loaded ${prettyBackendName(current)}`);
    } catch (e: any) {
      appendLog(`LLM status error: ${String(e)}`);
    }
  }

  async function refreshModels() {
    try {
      const m = await axiosInstance
        .get("/list_llms")
        .then((res) => res.data.downloaded_llms);
      setModels(m);
      appendLog(`LLM Models: ${m.length} available`);
    } catch (err) {
      appendLog(`LLM list error: ${String(err)}`);
    }
  }

  async function loadModel(modelName: string) {
    try {
      await axiosInstance.post("/load_llm", { name: modelName });
      setSelectedModel(modelName);
      setLoadedModel(modelName);
      appendLog(`LLM: Selected ${prettyBackendName(modelName)} | Loaded ${prettyBackendName(modelName)}`);
    } catch (err) {
      appendLog(`LLM load error: ${String(err)}`);
    }
  }

  async function unloadModel() {
    try {
      await axiosInstance.post("/unload_llm");
      setLoadedModel(null);
      setSelectedModel(null);
      appendLog("LLM: Selected None | Loaded None");
    } catch (err) {
      appendLog(`LLM unload error: ${String(err)}`);
    }
  }

  async function refreshTranslatorModels() {
    try {
      const res = await axiosInstance.get<TranslatorStatusResponse>("/translator_status");
      const status = res.data;
      const loadedKey = status.loaded_translator_key ?? "none";
      const family = status.active_onnx_family === "nllb" ? "nllb" : "m2m";
      const selectedTranslator = prettyBackendName(status.active_translator);
      const loadedTranslator = loadedKey === "onnx"
        ? prettyBackendName(family === "nllb" ? "nllb_onnx" : "m2m_onnx")
        : loadedKey === "nllb"
          ? prettyBackendName("nllb")
          : "None";
      setActiveOnnxFamily(family);

      const nextModels: TranslatorModel[] = [
        {
          id: "m2m_onnx",
          label: "M2M ONNX",
          available: Boolean(status.onnx_families?.m2m?.available),
          loaded: loadedKey === "onnx" && family === "m2m",
        },
        {
          id: "nllb_onnx",
          label: "NLLB ONNX",
          available: Boolean(status.onnx_families?.nllb?.available),
          loaded: loadedKey === "onnx" && family === "nllb",
        },
        {
          id: "nllb_pytorch",
          label: "NLLB PyTorch",
          available: Boolean(status.nllb?.available ?? true),
          loaded: loadedKey === "nllb",
        },
      ];
      setTranslatorModels(nextModels);
      appendLog(`Translator: Selected ${selectedTranslator} | Loaded ${loadedTranslator}`);
    } catch (err: any) {
      appendLog(`Translator status error: ${String(err?.message || err)}`);
    }
  }

  async function loadTranslatorModel(id: "m2m_onnx" | "nllb_onnx" | "nllb_pytorch") {
    try {
      if (id === "nllb_pytorch") {
        await axiosInstance.post(
          "/toggle_translator",
          { use_onnx: false },
          { timeout: 120000 }
        );
      } else {
        const family = id === "nllb_onnx" ? "nllb" : "m2m";
        await axiosInstance.post(
          "/toggle_translator",
          { use_onnx: true, onnx_family: family },
          { timeout: 120000 }
        );
      }
      await refreshTranslatorModels();
    } catch (err: any) {
      appendLog(`Translator load error: ${String(err?.response?.data?.error || err?.message || err)}`);
    }
  }

  async function unloadTranslatorModel() {
    try {
      await axiosInstance.post("/unload_translator");
      await refreshTranslatorModels();
    } catch (err: any) {
      appendLog(`Translator unload error: ${String(err?.response?.data?.error || err?.message || err)}`);
    }
  }

  async function refreshRagModels() {
    try {
      const res = await axiosInstance.get("/rag/backends");
      const available: string[] = Array.isArray(res.data?.available) ? res.data.available : [];
      const active = String(res.data?.active || "");
      const loaded = String(res.data?.loaded || "");
      const nextModels: RagModel[] = available.map((name) => ({
        id: name,
        label: name.toUpperCase(),
        available: true,
        loaded: name === loaded,
      }));
      setRagModels(nextModels);
      appendLog(`RAG: Selected ${prettyBackendName(active)} | Loaded ${prettyBackendName(loaded || "none")}`);
    } catch (err: any) {
      appendLog(`RAG status error: ${String(err?.response?.data?.error || err?.message || err)}`);
    }
  }

  async function loadRagModel(id: string) {
    try {
      await axiosInstance.post(
        "/rag/backend/load",
        { backend: id },
        { timeout: 120000 }
      );
      await refreshRagModels();
    } catch (err: any) {
      appendLog(`RAG load error: ${String(err?.response?.data?.error || err?.message || err)}`);
    }
  }

  async function unloadRagModel() {
    try {
      try {
        await axiosInstance.post("/rag/unload_backend");
      } catch (primaryErr: any) {
        const status = Number(primaryErr?.response?.status || 0);
        if (status !== 404) {
          throw primaryErr;
        }
        await axiosInstance.post("/api/rag/unload_backend");
      }
      await refreshRagModels();
    } catch (err: any) {
      appendLog(`RAG unload error: ${String(err?.response?.data?.error || err?.message || err)}`);
    }
  }

  async function sendUserMessage(text: string) {
    const userMsgId = String(Date.now());
    setMessages((m) => [...m, { id: userMsgId, role: "user", text }]);

    const assistantMsgId = String(Date.now() + 1);
    setMessages((m) => [...m, { id: assistantMsgId, role: "assistant", text: "" }]);

    setPipelineMetrics(null);

    const controller = new AbortController();
    const INFER_INACTIVITY_TIMEOUT_MS = 120000;
    let timeoutId: number | null = null;
    const resetAbortTimer = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => controller.abort(), INFER_INACTIVITY_TIMEOUT_MS);
    };
    resetAbortTimer();

    let revealTimer: number | null = null;
    let wordQueue: string[] = [];
    let hasBackendError = false;

    try {
      setRunning(true);

      try {
        const llmState = await axiosInstance.get("/current_llm");
        const activeLlm = llmState.data?.loaded_llm;
        if (!activeLlm) {
          setLoadedModel(null);
          setSelectedModel(null);
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") {
              copy[copy.length - 1] = {
                ...last,
                text: "LLM is not loaded. Please load an LLM model and try again.",
              };
            }
            return copy;
          });
          setLogs((l) => [...l, "Backend error: LLM not loaded"]);
          setRunning(false);
          return;
        }
      } catch {
      }

      const res = await fetch("http://localhost:5005/infer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          text,
          lang: language === "auto" ? "auto" : language,
          onnx_family: activeOnnxFamily,
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
          resetAbortTimer();
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
      if (!hasBackendError) {
        setLogs((l) => [...l, "Response complete"]);
      }
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
            hasBackendError = true;
            setRunning(false);
            setLogs((l) => [...l, `Backend error: ${payload.message}`]);
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant" && !last.text) {
                copy[copy.length - 1] = {
                  ...last,
                  text: String(payload.message || "Request failed"),
                };
              }
              return copy;
            });
            if (String(payload.message || "").toLowerCase().includes("llm not loaded")) {
              setLoadedModel(null);
              setSelectedModel(null);
            }
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
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
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
            translatorModels={translatorModels}
            ragModels={ragModels}
            selectedModel={selectedModel}
            loadedModel={loadedModel}
            messages={messages}
            logs={logs}
            language={language}
            onRefreshModels={refreshModels}
            onRefreshTranslatorModels={refreshTranslatorModels}
            onRefreshRagModels={refreshRagModels}
            onLoadTranslatorModel={loadTranslatorModel}
            onUnloadTranslatorModel={unloadTranslatorModel}
            onLoadRagModel={loadRagModel}
            onUnloadRagModel={unloadRagModel}
            onLoadModel={loadModel}
            onUnloadModel={unloadModel}
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
