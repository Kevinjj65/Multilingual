import React, { useEffect, useState } from "react";
import axiosInstance from "../lib/axiosInstance";
import SystemMetrics from "../components/SystemMetrics";

type RagDoc = { id: string; text: string };

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
      </main>
    </div>
  );
}
