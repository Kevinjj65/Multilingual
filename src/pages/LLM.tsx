import React, { useEffect, useState } from "react";
import axiosInstance from "../lib/axiosInstance";
import SystemMetrics from "../components/SystemMetrics";

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

  const [downloadLink, setDownloadLink] = useState("");
  const [downloadName, setDownloadName] = useState("");
  const [downloading, setDownloading] = useState(false);

  const [metricsResult, setMetricsResult] = useState<any | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  async function fetchCurrentLlm() {
    try {
      const res = await axiosInstance.get("/current_llm");
      const data = res.data || {};
      setLoaded(data.loaded_llm || null);
      setServerUrl(data.server_url || null);
      setLogs((l) => [...l, `Current LLM: ${data.loaded_llm || "none"}`]);
    } catch (e: any) {
      setLogs((l) => [...l, `Failed to get current LLM: ${String(e?.message || e)}`]);
    }
  }

  async function refreshLlms() {
    try {
      setLoading(true);
      const res = await axiosInstance.get("/list_llms");
      const data = res.data || {};
      setLlms(data.downloaded_llms || []);
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

  async function unloadLlm() {
    try {
      await axiosInstance.post("/unload_llm");
      setLoaded(null);
      setLogs((l) => [...l, `Unloaded model`]);
    } catch (e: any) {
      setLogs((l) => [...l, `Failed to unload LLM: ${String(e?.message || e)}`]);
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

  function extractFilenameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
      return filename || '';
    } catch {
      return '';
    }
  }

  function handleDownloadLinkChange(url: string) {
    setDownloadLink(url);
    const filename = extractFilenameFromUrl(url);
    if (filename) {
      setDownloadName(filename);
    }
  }

  async function downloadLlm() {
    const link = downloadLink.trim();
    const name = downloadName.trim();
    if (!link || !name) return;
    try {
      setDownloading(true);
      setLogs((l) => [...l, `Downloading ${name}...`]);
      // Use long timeout for downloads (5 minutes)
      await axiosInstance.post("/download_llm", { url: link, name }, { timeout: 300000 });
      setLogs((l) => [...l, `Download completed: ${name}`]);
      setDownloadLink("");
      setDownloadName("");
      await refreshLlms();
    } catch (e: any) {
      setLogs((l) => [...l, `Download error: ${String(e?.message || e)}`]);
    } finally {
      setDownloading(false);
    }
  }

  async function measureMetrics() {
    if (!loaded) {
      setLogs((l) => [...l, `Cannot measure: no LLM loaded`]);
      return;
    }
    try {
      setMetricsLoading(true);
      setLogs((l) => [...l, `Measuring LLM metrics...`]);
      const res = await axiosInstance.post("/llm_metrics", { llm_name: loaded }, { timeout: 60000 });
      setMetricsResult(res.data);
      setLogs((l) => [...l, `Metrics measurement completed`]);
    } catch (e: any) {
      setLogs((l) => [...l, `Metrics error: ${String(e?.message || e)}`]);
    } finally {
      setMetricsLoading(false);
    }
  }

  useEffect(() => {
    fetchCurrentLlm();
    refreshLlms();
  }, []);

  return (
    <div className="grid grid-cols-12 gap-6">
      <aside className="col-span-4 p-4 bg-white dark:bg-slate-800 rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-3">LLM</h1>
        <div className="text-xs text-gray-500 mb-2">Server: {serverUrl ?? "—"}</div>
        <div className="flex gap-2 mb-3">
          <button
            onClick={refreshLlms}
            disabled={loading}
            className={`flex-1 px-3 py-2 rounded ${loading ? "bg-gray-300" : "bg-indigo-600 text-white"}`}
          >
            {loading ? "Loading..." : "Refresh LLMs"}
          </button>
          <button
            onClick={unloadLlm}
            disabled={!loaded}
            className={`px-3 py-2 rounded ${loaded ? "bg-red-600 text-white" : "bg-gray-300"}`}
          >
            Unload
          </button>
        </div>

        <button
          onClick={measureMetrics}
          disabled={metricsLoading || !loaded}
          className={`mb-3 w-full px-3 py-2 rounded text-sm ${metricsLoading || !loaded ? "bg-gray-300" : "bg-purple-600 text-white"}`}
        >
          {metricsLoading ? "Measuring..." : "Measure Metric of LLM"}
        </button>

        <div className="space-y-2">
          {llms.length === 0 && <div className="text-gray-400">No LLMs found.</div>}
          {llms.map((m) => (
            <div key={m} className={`p-2 rounded border flex items-center justify-between ${loaded === m ? "ring-2 ring-indigo-400" : ""}`}>
              <div className="truncate">{m}</div>
              <div className="flex gap-2">
                {loaded === m ? (
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">Loaded</span>
                ) : (
                  <button className="text-xs px-2 py-1 bg-green-600 text-white rounded" onClick={() => loadLlm(m)}>
                    Load
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2">Download LLM</h3>
          <input
            value={downloadLink}
            onChange={(e) => handleDownloadLinkChange(e.target.value)}
            placeholder="Download link..."
            className="w-full px-2 py-1 mb-2 rounded border bg-white dark:bg-slate-700 text-sm"
          />
          <input
            value={downloadName}
            onChange={(e) => setDownloadName(e.target.value)}
            placeholder="Model name..."
            className="w-full px-2 py-1 mb-2 rounded border bg-white dark:bg-slate-700 text-sm"
          />
          <button
            onClick={downloadLlm}
            disabled={downloading || !downloadLink.trim() || !downloadName.trim()}
            className={`w-full text-xs px-2 py-1 rounded ${downloading ? "bg-gray-300" : "bg-blue-600 text-white"}`}
          >
            {downloading ? "Downloading..." : "Download"}
          </button>
        </div>

        <div className="mt-4">
          <SystemMetrics />
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

        {metricsResult && (
          <div className="mt-6 space-y-4">
            <h2 className="text-lg font-semibold">LLM Performance Metrics</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded border bg-slate-50 dark:bg-slate-900">
                <h3 className="text-sm font-semibold mb-2">Config</h3>
                <div className="text-xs space-y-1">
                  <div><strong>Model:</strong> {metricsResult.config?.llm_name}</div>
                  <div><strong>Max Tokens:</strong> {metricsResult.config?.max_tokens}</div>
                  <div><strong>Context Size:</strong> {metricsResult.config?.n_ctx}</div>
                  <div><strong>GPU Layers:</strong> {metricsResult.config?.n_gpu_layers}</div>
                  <div><strong>Model Size:</strong> {metricsResult.model_size_gb?.toFixed(2)} GB</div>
                </div>
              </div>

              <div className="p-3 rounded border bg-slate-50 dark:bg-slate-900">
                <h3 className="text-sm font-semibold mb-2">Performance</h3>
                <div className="text-xs space-y-1">
                  <div><strong>Load Time:</strong> {metricsResult.load_time_s?.toFixed(3)} s</div>
                  <div><strong>First Token:</strong> {metricsResult.first_token_latency_ms?.toFixed(2)} ms</div>
                  <div><strong>Total Inference:</strong> {metricsResult.total_inference_time_s?.toFixed(3)} s</div>
                  <div><strong>Tokens/sec:</strong> {metricsResult.tokens_per_second?.toFixed(2)}</div>
                  <div><strong>Output Tokens:</strong> {metricsResult.output_length_tokens}</div>
                </div>
              </div>

              <div className="p-3 rounded border bg-slate-50 dark:bg-slate-900">
                <h3 className="text-sm font-semibold mb-2">Memory (RAM)</h3>
                <div className="text-xs space-y-1">
                  <div><strong>Baseline:</strong> {metricsResult.memory?.baseline_rss_mb?.toFixed(2)} MB</div>
                  <div><strong>After Load:</strong> {metricsResult.memory?.loaded_rss_mb?.toFixed(2)} MB</div>
                  <div><strong>Peak:</strong> {metricsResult.memory?.peak_rss_mb?.toFixed(2)} MB</div>
                  <div><strong>Load Increase:</strong> {metricsResult.memory?.load_increase_mb?.toFixed(2)} MB</div>
                  <div><strong>Inference Increase:</strong> {metricsResult.memory?.inference_increase_mb?.toFixed(2)} MB</div>
                </div>
              </div>

              <div className="p-3 rounded border bg-slate-50 dark:bg-slate-900">
                <h3 className="text-sm font-semibold mb-2">VRAM</h3>
                <div className="text-xs space-y-1">
                  <div><strong>Total:</strong> {metricsResult.vram?.total_mb?.toFixed(2)} MB</div>
                  <div><strong>Baseline:</strong> {metricsResult.vram?.baseline_used_mb?.toFixed(2)} MB</div>
                  <div><strong>After Load:</strong> {metricsResult.vram?.loaded_used_mb?.toFixed(2)} MB</div>
                  <div><strong>Peak:</strong> {metricsResult.vram?.peak_used_mb?.toFixed(2)} MB</div>
                </div>
              </div>
            </div>

            <div className="p-3 rounded border bg-slate-50 dark:bg-slate-900">
              <h3 className="text-sm font-semibold mb-2">Demo Prompt</h3>
              <div className="text-xs whitespace-pre-wrap">{metricsResult.config?.demo_prompt}</div>
            </div>

            <div className="p-3 rounded border bg-slate-50 dark:bg-slate-900">
              <h3 className="text-sm font-semibold mb-2">Output Text</h3>
              <div className="text-xs whitespace-pre-wrap">{metricsResult.output_text}</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
