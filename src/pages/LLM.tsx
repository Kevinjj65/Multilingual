import { useEffect, useState } from "react";
import axiosInstance from "../lib/axiosInstance";
import SystemMetrics from "../components/SystemMetrics";
import VirtualKeyboard from "../components/VirtualKeyboard";

type RagUsedItem = {
  text: string;
  source: string;
};

type InferRawResponse = {
  final_prompt: string;
  output: string;
  prompt: string;
  rag_used?: RagUsedItem[];
  cache_hit?: boolean;   // 👈 NEW
};

export default function LLMPage({ language }: { language: string }) {
  const [llms, setLlms] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const [prompt, setPrompt] = useState("");
  const [inferResult, setInferResult] = useState<InferRawResponse | null>(null);
  const [inferLoading, setInferLoading] = useState(false);

  const [showRag, setShowRag] = useState(false);
  const [expandedRagIndex, setExpandedRagIndex] = useState<number | null>(null);

  const keyboardLang = language === "auto" ? "en" : language;

  async function fetchCurrentLlm() {
    const res = await axiosInstance.get("/current_llm");
    setLoaded(res.data?.loaded_llm || null);
    setServerUrl(res.data?.server_url || null);
  }

  async function refreshLlms() {
    setLoading(true);
    const res = await axiosInstance.get("/list_llms");
    setLlms(res.data?.downloaded_llms || []);
    setLoading(false);
  }

  async function loadLlm(name: string) {
    await axiosInstance.post("/load_llm", { name });
    setLoaded(name);
  }

  async function unloadLlm() {
    await axiosInstance.post("/unload_llm");
    setLoaded(null);
  }

  async function runInfer() {
    const p = prompt.trim();
    if (!p || !loaded) return;

    try {
      setInferLoading(true);
      setShowRag(false);
      setExpandedRagIndex(null);

      const res = await axiosInstance.post("/infer_raw", { prompt: p });

      setInferResult(res.data as InferRawResponse);

      if (res.data?.cache_hit) {
        setLogs((l) => [...l, "Query routing → Cache HIT"]);
      } else {
        setLogs((l) => [...l, "Query routing → Cache MISS (fresh retrieval)"]);
      }
    } catch (e: any) {
      setLogs((l) => [...l, `Infer error: ${e?.message}`]);
    } finally {
      setInferLoading(false);
    }
  }

  useEffect(() => {
    fetchCurrentLlm();
    refreshLlms();
  }, []);

  return (
    <div className="grid grid-cols-12 gap-6">
      <aside className="col-span-4 p-4 bg-slate-800 border border-slate-700
 rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-3">LLM</h1>
        <div className="text-xs text-gray-500 mb-2">
          Server: {serverUrl ?? "—"}
        </div>

        <div className="flex gap-2 mb-3">
          <button
            onClick={refreshLlms}
            disabled={loading}
            className={`flex-1 px-3 py-2 rounded ${
              loading ? "bg-gray-300" : "bg-indigo-600 text-white"
            }`}
          >
            Refresh
          </button>
          <button
            onClick={unloadLlm}
            disabled={!loaded}
            className={`px-3 py-2 rounded ${
              loaded ? "bg-red-600 text-white" : "bg-gray-300"
            }`}
          >
            Unload
          </button>
        </div>

        <div className="space-y-2">
          {llms.map((m) => (
            <div
              key={m}
              className={`p-2 rounded border flex justify-between ${
                loaded === m ? "ring-2 ring-indigo-400" : ""
              }`}
            >
              <div className="truncate">{m}</div>
              {loaded === m ? (
                <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
                  Loaded
                </span>
              ) : (
                <button
                  onClick={() => loadLlm(m)}
                  className="text-xs px-2 py-1 bg-green-600 text-white rounded"
                >
                  Load
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4">
          <SystemMetrics />
        </div>

        <div className="mt-4 text-xs text-gray-500">
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

      <main className="col-span-8 p-4 bg-white dark:bg-slate-800 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-3">Chat with LLM</h2>

        <div className="flex gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Type a prompt..."
            className="flex-1 px-3 py-2 rounded border bg-white dark:bg-slate-700"
          />
          <button
            onClick={runInfer}
            disabled={inferLoading || !prompt.trim() || !loaded}
            className={`px-4 py-2 rounded ${
              inferLoading || !loaded
                ? "bg-gray-300"
                : "bg-indigo-600 text-white"
            }`}
          >
            {inferLoading ? "Running..." : "Run"}
          </button>
        </div>

        <VirtualKeyboard
          language={keyboardLang}
          value={prompt}
          onChange={setPrompt}
        />

        {inferResult && (
          <div className="mt-6 space-y-6">

            {/* Answer FIRST */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold">Answer</h3>

                {inferResult.cache_hit !== undefined && (
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      inferResult.cache_hit
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {inferResult.cache_hit
                      ? "Cache HIT"
                      : "Cache MISS"}
                  </span>
                )}
              </div>

              <div className="p-4 rounded border bg-slate-50 dark:bg-slate-900 whitespace-pre-wrap">
                {inferResult.output}
              </div>
            </div>

            {/* Collapsible RAG Context */}
            {inferResult.rag_used && inferResult.rag_used.length > 0 && (
              <div>
                <button
                  onClick={() => setShowRag((s) => !s)}
                  className="px-3 py-2 rounded bg-slate-200 dark:bg-slate-700 text-sm"
                >
                  {showRag
                    ? "Hide Retrieved Context"
                    : `View Retrieved Context (${inferResult.rag_used.length})`}
                </button>

                {showRag && (
                  <div className="mt-3 space-y-2">
                    {inferResult.rag_used.map((r, idx) => (
                      <div key={idx} className="border rounded">
                        <button
                          onClick={() =>
                            setExpandedRagIndex(
                              expandedRagIndex === idx ? null : idx
                            )
                          }
                          className="w-full text-left px-3 py-2 bg-slate-200 dark:bg-slate-700 text-sm"
                        >
                          {r.source ?? "Unknown Source"} — Context {idx + 1}
                        </button>

                        {expandedRagIndex === idx && (
                          <div className="p-3 bg-white dark:bg-slate-900 text-sm whitespace-pre-wrap">
                            {r.text}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Hidden Prompt Details */}
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-gray-600">
                Show Prompt Engineering Details
              </summary>
              <div className="mt-3 space-y-3">
                <div>
                  <strong>Final Prompt</strong>
                  <div className="p-3 rounded border bg-slate-50 dark:bg-slate-900 whitespace-pre-wrap">
                    {inferResult.final_prompt}
                  </div>
                </div>
                <div>
                  <strong>Original Prompt</strong>
                  <div className="p-3 rounded border bg-slate-50 dark:bg-slate-900 whitespace-pre-wrap">
                    {inferResult.prompt}
                  </div>
                </div>
              </div>
            </details>
          </div>
        )}
      </main>
    </div>
  );
}
