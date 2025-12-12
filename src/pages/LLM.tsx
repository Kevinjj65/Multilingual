import React, { useEffect, useState } from "react";
import axiosInstance from "../lib/axiosInstance";

type InferRawResponse = {
  final_prompt: string;
  output: string;
  prompt: string;
  rag_used?: string[];
};

export default function LLMPage() {
  const [llms, setLlms] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const [prompt, setPrompt] = useState("");
  const [inferResult, setInferResult] = useState<InferRawResponse | null>(null);
  const [inferLoading, setInferLoading] = useState(false);

  async function refreshLlms() {
    try {
      setLoading(true);
      const res = await axiosInstance.get("/list_llms");
      const data = res.data || {};
      setLlms(data.downloaded_llms || []);
      setLoaded(data.loaded_llm || null);
      setServerUrl(data.server_url || null);
      setLogs((l) => [...l, `Found ${data.downloaded_llms?.length || 0} LLM(s)`]);
    } catch (e: any) {
      setLogs((l) => [...l, `Failed to list LLMs: ${String(e?.message || e)}`]);
    } finally {
      setLoading(false);
    }
  }

  async function loadLlm(name: string) {
    try {
      await axiosInstance.post("/load_llm", { name });
      setLoaded(name);
      setLogs((l) => [...l, `Loaded LLM: ${name}`]);
    } catch (e: any) {
      setLogs((l) => [...l, `Failed to load LLM: ${String(e?.message || e)}`]);
    }
  }

  async function runInfer() {
    const p = prompt.trim();
    if (!p) return;
    if (!loaded) {
      setLogs((l) => [...l, `Cannot infer: no LLM loaded`]);
      return;
    }
    try {
      setInferLoading(true);
      const res = await axiosInstance.post("/infer_raw", { prompt: p });
      setInferResult(res.data as InferRawResponse);
      setLogs((l) => [...l, `Inference completed`]);
    } catch (e: any) {
      setLogs((l) => [...l, `Infer error: ${String(e?.message || e)}`]);
    } finally {
      setInferLoading(false);
    }
  }

  useEffect(() => {
    refreshLlms();
  }, []);

  return (
    <div className="grid grid-cols-12 gap-6">
      <aside className="col-span-4 p-4 bg-white dark:bg-slate-800 rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-3">LLM</h1>
        <div className="text-xs text-gray-500 mb-2">Server: {serverUrl ?? "—"}</div>
        <button
          onClick={refreshLlms}
          disabled={loading}
          className={`mb-3 w-full px-3 py-2 rounded ${loading ? "bg-gray-300" : "bg-indigo-600 text-white"}`}
        >
          {loading ? "Loading..." : "Refresh LLMs"}
        </button>

        <div className="space-y-2">
          {llms.length === 0 && <div className="text-gray-400">No LLMs found.</div>}
          {llms.map((m) => (
            <div key={m} className={`p-2 rounded border flex items-center justify-between ${loaded === m ? "ring-2 ring-indigo-400" : ""}`}>
              <div className="truncate">{m}</div>
              <div className="flex gap-2">
                <button className="text-xs px-2 py-1 bg-green-600 text-white rounded" onClick={() => loadLlm(m)}>
                  Load
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          <div>Logs:</div>
          <div className="h-40 overflow-y-auto bg-slate-50 dark:bg-slate-900 p-2 rounded border">
            {logs.map((l, i) => (
              <div key={i} className="font-mono text-[12px]">{l}</div>
            ))}
          </div>
        </div>
      </aside>

      <main className="col-span-8 p-4 bg-white dark:bg-slate-800 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-3">Chat with LLM</h2>
        <div className="mb-2 text-sm text-gray-600">Loaded: {loaded ?? "—"}</div>
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
            className={`px-4 py-2 rounded ${inferLoading || !loaded ? "bg-gray-300" : "bg-indigo-600 text-white"}`}
          >
            {inferLoading ? "Running..." : "Run"}
          </button>
        </div>

        {inferResult && (
          <div className="mt-6 space-y-4">
            <div>
              <h3 className="text-md font-semibold mb-1">Final Prompt</h3>
              <div className="p-3 rounded border bg-slate-50 dark:bg-slate-900 whitespace-pre-wrap">{inferResult.final_prompt}</div>
            </div>
            <div>
              <h3 className="text-md font-semibold mb-1">Output</h3>
              <div className="p-3 rounded border bg-slate-50 dark:bg-slate-900 whitespace-pre-wrap">{inferResult.output}</div>
            </div>
            <div>
              <h3 className="text-md font-semibold mb-1">Prompt</h3>
              <div className="p-3 rounded border bg-slate-50 dark:bg-slate-900 whitespace-pre-wrap">{inferResult.prompt}</div>
            </div>
            {inferResult.rag_used && inferResult.rag_used.length > 0 && (
              <div>
                <h3 className="text-md font-semibold mb-1">RAG Used ({inferResult.rag_used.length})</h3>
                <ul className="list-disc pl-5 space-y-1">
                  {inferResult.rag_used.map((r, idx) => (
                    <li key={idx} className="whitespace-pre-wrap">{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
