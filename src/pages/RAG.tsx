import React, { useEffect, useState } from "react";
import axiosInstance from "../lib/axiosInstance";
import SystemMetrics from "../components/SystemMetrics";

type RagDoc = { id: string; text: string };

interface RagMetrics {
  documents_indexed: number;
  index_size: {
    index_file_mb: number;
    metadata_file_mb: number;
    total_mb: number;
  };
  indexing_time_s: number;
  memory: {
    after_indexing_rss_mb: number;
    baseline_rss_mb: number;
    indexing_increase_mb: number;
  };
  ok: boolean;
  rag_impact?: {
    skipped?: string;
    answer_length_diff?: number;
    answer_with_rag?: string;
    answer_without_rag?: string;
    contexts_used?: number;
    inference_time_with_rag_s?: number;
    inference_time_without_rag_s?: number;
    query?: string;
    rag_overhead_s?: number;
  };
  relevance: {
    avg_recall_at_3: number;
    perfect_recalls: number;
    queries_evaluated: number;
  };
  restoration: {
    original_doc_count: number;
    restored_doc_count: number;
  };
  retrieval_performance: {
    avg_query_time_ms: number;
    max_query_time_ms: number;
    min_query_time_ms: number;
    topk_avg_times_ms: {
      [key: string]: number;
    };
  };
  vram: {
    after_indexing_used_mb: number;
    baseline_used_mb: number;
  };
}

export default function RAGPage() {
  const [docs, setDocs] = useState<RagDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [newText, setNewText] = useState("");
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState<number>(3);
  const [similarity, setSimilarity] = useState<number>(0.35);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<RagMetrics | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [benchmarkLlm, setBenchmarkLlm] = useState("llama");
  const [showLlmOption, setShowLlmOption] = useState(false);

  async function loadRag() {
    try {
      setLoading(true);
      const res = await axiosInstance.get("/rag/list");
      const list: RagDoc[] = res.data?.documents ?? [];
      setDocs(list);
      setLogs((l) => [...l, `Loaded ${list.length} RAG documents`]);
    } catch (e: any) {
      setLogs((l) => [...l, `Failed to load RAG: ${String(e?.message || e)}`]);
    } finally {
      setLoading(false);
    }
  }

  async function clearRag() {
    try {
      await axiosInstance.post("/rag/clear");
      setDocs([]);
      setLogs((l) => [...l, "Cleared RAG documents"]);
    } catch (e: any) {
      setLogs((l) => [...l, `Failed to clear RAG: ${String(e?.message || e)}`]);
    }
  }

  async function addRag() {
    const text = newText.trim();
    if (!text) return;
    try {
      await axiosInstance.post("/rag/add", { text });
      setLogs((l) => [...l, "Added new RAG document"]);
      setNewText("");
      await loadRag();
    } catch (e: any) {
      setLogs((l) => [...l, `Failed to add RAG doc: ${String(e?.message || e)}`]);
    }
  }

  async function searchRag() {
    const q = query.trim();
    if (!q) return;
    try {
      setSearching(true);
      const res = await axiosInstance.post("/rag/search", {
        query: q,
        top_k: topK,
        similarity_threshold: similarity,
      });
      const results: string[] = res.data?.results ?? [];
      setSearchResults(results);
      setLogs((l) => [...l, `Search found ${results.length} results (top_k=${topK}, thr=${similarity})`]);
    } catch (e: any) {
      setLogs((l) => [...l, `Failed to search RAG: ${String(e?.message || e)}`]);
    } finally {
      setSearching(false);
    }
  }

  async function benchmarkRag(withLlm: boolean) {
    setIsBenchmarking(true);
    setMetrics(null);
    const benchmarkType = withLlm ? `RAG with LLM (${benchmarkLlm})` : "RAG without LLM";
    setLogs((l) => [...l, `Starting benchmark: ${benchmarkType}...`]);

    try {
      const body = withLlm ? { llm_name: benchmarkLlm } : {};
      const res = await axiosInstance.post<RagMetrics>(
        "/rag_metrics",
        body,
        { timeout: 120_000 }
      );
      setMetrics(res.data);
      setLogs((l) => [...l, `Benchmark completed successfully!`]);
    } catch (err: any) {
      console.error("RAG benchmark error:", err);
      setLogs((l) => [...l, `Benchmark error: ${err?.response?.data?.error || err.message}`]);
    } finally {
      setIsBenchmarking(false);
    }
  }

  useEffect(() => {
    loadRag();
  }, []);

  return (
    <div className="grid grid-cols-12 gap-6">
      <aside className="col-span-4 p-4 bg-white dark:bg-slate-800 rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-3">RAG</h1>
        <button
          onClick={loadRag}
          disabled={loading}
          className={`mb-3 w-full px-3 py-2 rounded ${loading ? "bg-gray-300" : "bg-indigo-600 text-white"}`}
        >
          {loading ? "Loading..." : "Refresh RAG"}
        </button>
        <button
          onClick={clearRag}
          className="w-full px-3 py-2 rounded bg-red-600 text-white"
        >
          Clear RAG
        </button>

        <div className="mt-4">
          <h3 className="text-md font-semibold mb-2">Search RAG</h3>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter query..."
            className="w-full px-3 py-2 rounded border bg-white dark:bg-slate-700"
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Top K</label>
              <input
                type="number"
                min={1}
                max={20}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="w-full px-2 py-1 rounded border bg-white dark:bg-slate-700"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Similarity Threshold</label>
              <input
                type="number"
                step={0.01}
                min={0}
                max={1}
                value={similarity}
                onChange={(e) => setSimilarity(Number(e.target.value))}
                className="w-full px-2 py-1 rounded border bg-white dark:bg-slate-700"
              />
            </div>
          </div>
          <button
            onClick={searchRag}
            disabled={searching || !query.trim()}
            className={`mt-3 w-full px-3 py-2 rounded ${searching ? "bg-gray-300" : "bg-green-600 text-white"}`}
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        <div className="mt-4">
          <h3 className="text-md font-semibold mb-2">Benchmark RAG</h3>
          <div className="space-y-2">
            <button
              onClick={() => benchmarkRag(false)}
              disabled={isBenchmarking}
              className={`w-full px-3 py-2 rounded ${isBenchmarking ? "bg-gray-300" : "bg-blue-600 text-white"}`}
            >
              {isBenchmarking ? "Benchmarking..." : "Benchmark (No LLM)"}
            </button>
            <button
              onClick={() => setShowLlmOption(!showLlmOption)}
              disabled={isBenchmarking}
              className={`w-full px-3 py-2 rounded ${isBenchmarking ? "bg-gray-300" : "bg-purple-600 text-white"}`}
            >
              Benchmark (With LLM)
            </button>
          </div>
          {showLlmOption && (
            <div className="mt-2 p-2 bg-slate-50 dark:bg-slate-900 rounded">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">LLM Name</label>
              <input
                type="text"
                value={benchmarkLlm}
                onChange={(e) => setBenchmarkLlm(e.target.value)}
                className="w-full px-2 py-1 text-sm rounded border bg-white dark:bg-slate-700"
                placeholder="llama"
              />
              <button
                onClick={() => {
                  benchmarkRag(true);
                  setShowLlmOption(false);
                }}
                disabled={isBenchmarking || !benchmarkLlm.trim()}
                className={`mt-2 w-full px-3 py-1 text-sm rounded ${isBenchmarking ? "bg-gray-300" : "bg-purple-600 text-white"}`}
              >
                Start Benchmark
              </button>
            </div>
          )}
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
        <h2 className="text-lg font-semibold mb-3">Documents ({docs.length})</h2>
        <div className="space-y-3">
          {docs.length === 0 && (
            <div className="text-gray-400">No RAG documents available.</div>
          )}
          {docs.map((d) => (
            <div key={d.id} className="p-3 rounded border bg-slate-50 dark:bg-slate-900">
              <div className="text-xs text-gray-500 mb-1">ID: {d.id}</div>
              <div className="whitespace-pre-wrap">{d.text}</div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <h3 className="text-md font-semibold mb-2">Add RAG Document</h3>
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Enter text to add to RAG..."
            className="w-full h-32 px-3 py-2 rounded border bg-white dark:bg-slate-700"
          />
          <button
            onClick={addRag}
            disabled={!newText.trim()}
            className="mt-3 px-3 py-2 rounded bg-green-600 text-white"
          >
            Add RAG
          </button>

          {searchResults.length > 0 && (
            <div className="mt-6">
              <h3 className="text-md font-semibold mb-2">Search Results ({searchResults.length})</h3>
              <div className="space-y-2">
                {searchResults.map((r, idx) => (
                  <div key={idx} className="p-2 rounded border bg-slate-50 dark:bg-slate-900">{r}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {metrics && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold mb-3">RAG Benchmark Metrics</h2>
            <div className="grid grid-cols-2 gap-4">
              {/* Documents & Indexing */}
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Indexing</h3>
                <div className="text-sm space-y-1">
                  <div><span className="font-medium">Indexed:</span> {metrics.documents_indexed} docs</div>
                  <div><span className="font-medium">Time:</span> {metrics.indexing_time_s.toFixed(3)}s</div>
                  <div className="mt-2 font-medium text-xs">Index Size:</div>
                  <div className="ml-2">{metrics.index_size.index_file_mb.toFixed(4)} MB (data)</div>
                  <div className="ml-2">{metrics.index_size.metadata_file_mb.toFixed(4)} MB (meta)</div>
                  <div className="ml-2">{metrics.index_size.total_mb.toFixed(4)} MB (total)</div>
                </div>
              </div>

              {/* Restoration */}
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <h3 className="font-semibold text-green-800 dark:text-green-300 mb-2">Restoration</h3>
                <div className="text-sm space-y-1">
                  <div><span className="font-medium">Original:</span> {metrics.restoration.original_doc_count} docs</div>
                  <div><span className="font-medium">Restored:</span> {metrics.restoration.restored_doc_count} docs</div>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                    <div
                      className="bg-green-600 h-2.5 rounded-full"
                      style={{ width: `${metrics.restoration.restored_doc_count > 0 ? (metrics.restoration.restored_doc_count / metrics.restoration.original_doc_count * 100) : 0}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Retrieval Performance */}
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <h3 className="font-semibold text-purple-800 dark:text-purple-300 mb-2">Retrieval Performance</h3>
                <div className="text-sm space-y-1">
                  <div><span className="font-medium">Avg Query:</span> {metrics.retrieval_performance.avg_query_time_ms.toFixed(2)} ms</div>
                  <div><span className="font-medium">Min Query:</span> {metrics.retrieval_performance.min_query_time_ms.toFixed(2)} ms</div>
                  <div><span className="font-medium">Max Query:</span> {metrics.retrieval_performance.max_query_time_ms.toFixed(2)} ms</div>
                  <div className="mt-2 font-medium text-xs">Top-K Times:</div>
                  {Object.entries(metrics.retrieval_performance.topk_avg_times_ms).map(([k, v]) => (
                    <div key={k} className="ml-2 text-xs">Top {k}: {v.toFixed(2)} ms</div>
                  ))}
                </div>
              </div>

              {/* Relevance */}
              <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                <h3 className="font-semibold text-orange-800 dark:text-orange-300 mb-2">Relevance</h3>
                <div className="text-sm space-y-1">
                  <div><span className="font-medium">Avg Recall@3:</span> {metrics.relevance.avg_recall_at_3.toFixed(3)}</div>
                  <div><span className="font-medium">Perfect Recalls:</span> {metrics.relevance.perfect_recalls}/{metrics.relevance.queries_evaluated}</div>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                    <div
                      className="bg-orange-600 h-2.5 rounded-full"
                      style={{ width: `${metrics.relevance.avg_recall_at_3 * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Memory */}
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <h3 className="font-semibold text-red-800 dark:text-red-300 mb-2">Memory (RAM)</h3>
                <div className="text-sm space-y-1">
                  <div><span className="font-medium">Baseline:</span> {metrics.memory.baseline_rss_mb.toFixed(2)} MB</div>
                  <div><span className="font-medium">After Index:</span> {metrics.memory.after_indexing_rss_mb.toFixed(2)} MB</div>
                  <div><span className="font-medium">Increase:</span> {metrics.memory.indexing_increase_mb.toFixed(2)} MB</div>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                    <div
                      className="bg-red-600 h-2.5 rounded-full"
                      style={{ width: `${Math.min((metrics.memory.indexing_increase_mb / 2000) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* VRAM */}
              <div className="p-4 bg-pink-50 dark:bg-pink-900/20 rounded-lg">
                <h3 className="font-semibold text-pink-800 dark:text-pink-300 mb-2">VRAM</h3>
                <div className="text-sm space-y-1">
                  <div><span className="font-medium">Baseline:</span> {metrics.vram.baseline_used_mb.toFixed(2)} MB</div>
                  <div><span className="font-medium">After Index:</span> {metrics.vram.after_indexing_used_mb.toFixed(2)} MB</div>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                    <div
                      className="bg-pink-600 h-2.5 rounded-full"
                      style={{ width: `${Math.min((metrics.vram.after_indexing_used_mb / 4000) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* RAG Impact (if using LLM) */}
              {metrics.rag_impact && !metrics.rag_impact.skipped && (
                <div className="col-span-2 p-4 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
                  <h3 className="font-semibold text-cyan-800 dark:text-cyan-300 mb-2">RAG Impact (with LLM)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Query:</div>
                      <div className="p-2 bg-white dark:bg-slate-800 rounded text-xs italic">
                        {metrics.rag_impact.query}
                      </div>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div><span className="font-medium">Contexts Used:</span> {metrics.rag_impact.contexts_used}</div>
                      <div><span className="font-medium">Answer Length Diff:</span> {metrics.rag_impact.answer_length_diff}</div>
                      <div><span className="font-medium">Inference w/RAG:</span> {metrics.rag_impact.inference_time_with_rag_s?.toFixed(3)}s</div>
                      <div><span className="font-medium">Inference w/o RAG:</span> {metrics.rag_impact.inference_time_without_rag_s?.toFixed(3)}s</div>
                      <div><span className="font-medium text-cyan-700 dark:text-cyan-300">RAG Overhead:</span> {metrics.rag_impact.rag_overhead_s?.toFixed(3)}s</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Answer with RAG:</div>
                      <div className="p-2 bg-white dark:bg-slate-800 rounded text-xs break-words">
                        {metrics.rag_impact.answer_with_rag?.substring(0, 150)}...
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Answer without RAG:</div>
                      <div className="p-2 bg-white dark:bg-slate-800 rounded text-xs break-words">
                        {metrics.rag_impact.answer_without_rag?.substring(0, 150)}...
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Skipped Message */}
              {metrics.rag_impact?.skipped && (
                <div className="col-span-2 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <h3 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-2">RAG Impact</h3>
                  <div className="text-sm text-yellow-700 dark:text-yellow-300">
                    {metrics.rag_impact.skipped}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
