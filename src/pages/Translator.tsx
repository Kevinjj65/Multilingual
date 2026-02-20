import React, { useRef, useState, useEffect } from "react";
import SystemMetrics from "../components/SystemMetrics";
import axiosInstance from "../lib/axiosInstance";

interface TranslatorMetrics {
  end_to_end_time_s: number;
  input: {
    char_length: number;
    src_lang: string;
    text: string;
    tgt_lang: string;
    token_length_estimate: number;
    backend: string;
  };
  memory: {
    after_forward_rss_mb: number;
    baseline_rss_mb: number;
    peak_increase_mb: number;
    peak_rss_mb: number;
    translation_increase_mb: number;
  };
  ok: boolean;
  outputs: {
    forward_translation: string;
    roundtrip_translation: string;
  };
  quality: {
    bleu_score: number;
    char_length_similarity_pct: number;
    chrf_score: number;
    forward_output_chars: number;
    forward_output_tokens: number;
    roundtrip_output_chars: number;
    roundtrip_output_tokens: number;
  };
  throughput: {
    forward: {
      chars_per_sec: number;
      time_s: number;
      tokens_per_sec: number;
    };
    roundtrip: {
      chars_per_sec: number;
      time_s: number;
      tokens_per_sec: number;
    };
  };
  vram: {
    after_forward_used_mb: number;
    baseline_used_mb: number;
    peak_used_mb: number;
    total_mb: number;
  };
}

interface TranslatorStatus {
  active_translator: "onnx" | "nllb";
  onnx: {
    available: boolean;
    models_dir: string;
    models: {
      encoder: boolean;
      decoder: boolean;
      lm_head: boolean;
    };
    active_models?: {
      encoder: string;
      decoder: string;
      lm_head: string;
    };
    tokenizer_available: boolean;
  };
  nllb: {
    available: boolean;
    model: string;
  };
}

export default function TranslatorPage() {
  const [input, setInput] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [output, setOutput] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [srcLang, setSrcLang] = useState("hi");
  const [metrics, setMetrics] = useState<TranslatorMetrics | null>(null);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [translatorStatus, setTranslatorStatus] = useState<TranslatorStatus | null>(null);
  const [selectedBackend, setSelectedBackend] = useState<"onnx" | "nllb">("onnx");  // Default to ONNX
  const [isTogglingBackend, setIsTogglingBackend] = useState(false);
  const [isPreloading, setIsPreloading] = useState(false);
  const [lastBackendUsed, setLastBackendUsed] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchTranslatorStatus();
  }, []);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output, logs]);

  async function fetchTranslatorStatus() {
    try {
      const res = await axiosInstance.get<TranslatorStatus>("/translator_status");
      setTranslatorStatus(res.data);
      setSelectedBackend(res.data.active_translator);
      setLogs((l) => [...l, `Translator status: ${res.data.active_translator.toUpperCase()}`]);
    } catch (err: any) {
      console.error("Translator status error:", err);
      setLogs((l) => [...l, `Status error: ${err?.message}`]);
    }
  }

  async function toggleBackend(newBackend: "onnx" | "nllb") {
    if (!translatorStatus) return;
    
    if (newBackend === "onnx" && !translatorStatus.onnx.available) {
      setLogs((l) => [...l, `ONNX models not available`]);
      return;
    }

    setIsTogglingBackend(true);
    try {
      await axiosInstance.post("/toggle_translator", { use_onnx: newBackend === "onnx" });
      setSelectedBackend(newBackend);
      setLogs((l) => [...l, `Switched to ${newBackend.toUpperCase()} translator`]);
    } catch (err: any) {
      console.error("Toggle backend error:", err);
      setLogs((l) => [...l, `Toggle error: ${err?.response?.data?.error || err.message}`]);
    } finally {
      setIsTogglingBackend(false);
    }
  }

  async function preloadTranslator() {
    if (isPreloading) return;

    if (selectedBackend === "onnx" && translatorStatus && !translatorStatus.onnx.available) {
      setLogs((l) => [...l, "ONNX models not available"]);
      return;
    }

    setIsPreloading(true);
    setLogs((l) => [...l, `Preloading ${selectedBackend.toUpperCase()} translator...`]);

    try {
      await axiosInstance.post("/translator_preload", { use_onnx: selectedBackend === "onnx" });
      setLogs((l) => [...l, `${selectedBackend.toUpperCase()} preload complete`]);
      await fetchTranslatorStatus();
    } catch (err: any) {
      console.error("Preload translator error:", err);
      setLogs((l) => [...l, `Preload error: ${err?.response?.data?.error || err.message}`]);
    } finally {
      setIsPreloading(false);
    }
  }

  async function handleTranslate() {
    if (!input.trim() || isTranslating) return;
    setOutput("");
    setIsTranslating(true);
    setLastBackendUsed(null);

    // Word-by-word reveal queue
    let wordQueue: string[] = [];
    let revealTimer: number | null = null;
    const startReveal = () => {
      if (revealTimer !== null) return;
      revealTimer = window.setInterval(() => {
        if (wordQueue.length === 0) return;
        const nextWord = wordQueue.shift()!;
        setOutput((prev) => (prev ? prev + " " : "") + nextWord);
      }, 45);
    };

    const controller = new AbortController();
    const timeoutMs = 30_000;
    const timeoutId = setTimeout(() => controller.abort("timeout"), timeoutMs);

    try {
      const res = await fetch(`http://localhost:5005/translate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ 
          text: input.trim(),
          use_onnx: selectedBackend === "onnx"
        }),
        signal: controller.signal,
      });

      // Handle non-streaming error responses (400, 503, etc.)
      if (!res.ok) {
        try {
          const errorData = await res.json();
          const errorMsg = errorData.error || "Translation request failed";
          setOutput(`❌ Error: ${errorMsg}`);
          setLogs((l) => [...l, `Error: ${errorMsg}`]);
          if (errorData.details) {
            setLogs((l) => [...l, `Details: ${errorData.details}`]);
          }
          if (errorData.suggestion) {
            setLogs((l) => [...l, `💡 ${errorData.suggestion}`]);
          }
          return;
        } catch {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
      }

      if (!res.body) throw new Error("No response body from /translate");

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      const processEvent = (eventData: string) => {
        try {
          const payload = JSON.parse(eventData);
          if (payload.type === "meta") {
            setLastBackendUsed(payload.backend || selectedBackend);
            setLogs((l) => [...l, `Backend: ${(payload.backend || selectedBackend).toUpperCase()}`]);
          } else if (payload.type === "sentence") {
            const translated: string = String(payload.translated || "");
            const words = translated.split(/\s+/).filter(Boolean);
            wordQueue.push(...words);
            startReveal();
          } else if (payload.type === "error") {
            // Handle error events from backend
            const errorMsg = payload.message || "Translation failed";
            setOutput(`❌ Error: ${errorMsg}`);
            setLogs((l) => [...l, `Error: ${errorMsg}`]);
            if (payload.details) {
              setLogs((l) => [...l, `Details: ${payload.details}`]);
            }
            if (payload.suggestion) {
              setLogs((l) => [...l, `💡 ${payload.suggestion}`]);
            }
          }
        } catch (e) {
          console.error("Translator parse error:", eventData, e);
          setLogs((l) => [...l, `Parse error: ${String(e)}`]);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunkText = decoder.decode(value, { stream: true });
        setLogs((l) => [...l, `[chunk] ${chunkText.substring(0, 120)}...`]);
        buffer += chunkText;

        const events = buffer.split("\n\n");
        for (let i = 0; i < events.length - 1; i++) {
          const event = events[i].trim();
          if (event.startsWith("data: ")) {
            const eventData = event.slice(6);
            processEvent(eventData);
          }
        }
        buffer = events[events.length - 1];
      }
    } catch (err: any) {
      const msg = err?.name === "AbortError" ? `Request aborted: ${String(err?.message)}` : String(err);
      console.error("Translator stream error:", err);
      setLogs((l) => [...l, `Stream error: ${msg}`]);
    } finally {
      clearTimeout(timeoutId);
      setIsTranslating(false);
    }
  }

  async function measureMetrics() {
    setIsMeasuring(true);
    setMetrics(null);
    const backend = selectedBackend === "onnx" ? "ONNX" : "NLLB";
    const tgtLang = "en"; // Always translate to English for metrics
    
    // Show model info for ONNX
    let modelInfo = "";
    if (selectedBackend === "onnx" && translatorStatus?.onnx.active_models) {
      const models = translatorStatus.onnx.active_models;
      modelInfo = ` (Encoder: ${models.encoder}, Decoder: ${models.decoder})`;
    }
    
    setLogs((l) => [...l, `Measuring ${backend}${modelInfo} metrics for ${srcLang} → en...`]);

    try {
      const res = await axiosInstance.post<TranslatorMetrics>(
        "/translator_metrics",
        { 
          src_lang: srcLang, 
          tgt_lang: tgtLang,
          use_onnx: selectedBackend === "onnx"
        },
        { timeout: 60_000 }
      );
      setMetrics(res.data);
      setLogs((l) => [...l, `${backend} metrics measured successfully!`]);
    } catch (err: any) {
      console.error("Translator metrics error:", err);
      setLogs((l) => [...l, `Metrics error: ${err?.response?.data?.error || err.message}`]);
    } finally {
      setIsMeasuring(false);
    }
  }

  return (
<div className="grid grid-cols-12 gap-4 p-4 bg-slate-900 min-h-screen text-white">
      <aside className="col-span-4 p-4 bg-white dark:bg-slate-800 rounded-lg shadow overflow-y-auto max-h-screen">
        <h1 className="text-xl font-semibold mb-3">Translator</h1>

        <button
          onClick={preloadTranslator}
          disabled={!!(isPreloading || (selectedBackend === "onnx" && translatorStatus && !translatorStatus.onnx.available))}
          className={`mb-3 w-full px-3 py-2 rounded text-sm font-medium transition ${
            isPreloading
              ? "bg-gray-300"
              : "bg-amber-600 text-white"
          }`}
        >
          {isPreloading ? "Loading Model..." : "Load Model"}
        </button>

        {/* Backend Selector */}
        {translatorStatus && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-700">
            <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">Translation Backend</h3>
            
            {/* Status Info */}
            <div className="text-xs mb-3 space-y-1">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${translatorStatus.active_translator === "onnx" ? "bg-green-500" : "bg-gray-400"}`}></div>
                <span>ONNX: {translatorStatus.onnx.available ? "✓ Available" : "✗ Unavailable"}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${translatorStatus.active_translator === "nllb" ? "bg-green-500" : "bg-gray-400"}`}></div>
                <span>NLLB: {translatorStatus.nllb.available ? "✓ Available" : "✗ Unavailable"}</span>
              </div>
            </div>

            {/* Active Models */}
            {translatorStatus.onnx.active_models && (
              <div className="mb-2 p-2 bg-white dark:bg-slate-800 rounded text-xs">
                <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">Active ONNX Models:</div>
                <div className="text-gray-600 dark:text-gray-400 space-y-0.5">
                  <div>• Enc: {translatorStatus.onnx.active_models.encoder}</div>
                  <div>• Dec: {translatorStatus.onnx.active_models.decoder}</div>
                  <div>• Head: {translatorStatus.onnx.active_models.lm_head}</div>
                </div>
              </div>
            )}

            {/* Backend Toggle Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => toggleBackend("onnx")}
                disabled={isTogglingBackend || !translatorStatus.onnx.available}
                className={`flex-1 px-2 py-1.5 rounded text-sm font-medium transition ${
                  selectedBackend === "onnx" && translatorStatus.onnx.available
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                }`}
              >
                ONNX
              </button>
              <button
                onClick={() => toggleBackend("nllb")}
                disabled={isTogglingBackend}
                className={`flex-1 px-2 py-1.5 rounded text-sm font-medium transition ${
                  selectedBackend === "nllb"
                    ? "bg-green-600 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                NLLB
              </button>
            </div>

            {lastBackendUsed && (
              <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                Last used: <span className="font-semibold">{lastBackendUsed.toUpperCase()}</span>
              </div>
            )}
          </div>
        )}

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter text to translate..."
          className="w-full h-40 px-3 py-2 rounded border bg-white dark:bg-slate-700"
        />
        <button
          onClick={handleTranslate}
          disabled={isTranslating || !input.trim()}
          className={`mt-3 w-full px-3 py-2 rounded ${isTranslating ? "bg-gray-300" : "bg-indigo-600 text-white"}`}
        >
          {isTranslating ? "Translating..." : "Translate"}
        </button>

        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-semibold">Metrics Configuration</h3>
          <div>
            <label className="text-xs text-gray-600 dark:text-gray-400">Language Pair (→ English)</label>
            <select
              value={srcLang}
              onChange={(e) => setSrcLang(e.target.value)}
              className="w-full px-2 py-1.5 text-sm rounded border bg-white dark:bg-slate-700"
            >
              <option value="hi">Hindi → English</option>
              <option value="ta">Tamil → English</option>
              <option value="te">Telugu → English</option>
              <option value="kn">Kannada → English</option>
              <option value="ml">Malayalam → English</option>
              <option value="mr">Marathi → English</option>
              <option value="gu">Gujarati → English</option>
              <option value="bn">Bengali → English</option>
              <option value="pa">Punjabi → English</option>
              <option value="ur">Urdu → English</option>
              <option value="ja">Japanese → English</option>
              <option value="zh">Chinese → English</option>
              <option value="fr">French → English</option>
              <option value="de">German → English</option>
              <option value="es">Spanish → English</option>
              <option value="ru">Russian → English</option>
            </select>
          </div>
          
          {/* Show ONNX models being measured */}
          {selectedBackend === "onnx" && translatorStatus?.onnx.active_models && (
            <div className="text-xs text-gray-600 dark:text-gray-400 p-2 bg-gray-100 dark:bg-gray-800 rounded">
              <div className="font-semibold mb-1">Models to benchmark:</div>
              <div>Encoder: {translatorStatus.onnx.active_models.encoder}</div>
              <div>Decoder: {translatorStatus.onnx.active_models.decoder}</div>
              <div>LM Head: {translatorStatus.onnx.active_models.lm_head}</div>
            </div>
          )}
          
          <button
            onClick={measureMetrics}
            disabled={isMeasuring}
            className={`w-full px-3 py-2 rounded ${isMeasuring ? "bg-gray-300" : "bg-green-600 text-white"}`}
          >
            {isMeasuring ? "Measuring..." : "Measure Metrics"}
          </button>
        </div>

        <div className="mt-4">
          <SystemMetrics />
        </div>

        <div className="mt-4 text-xs text-gray-500 dark:text-gray-400" ref={scrollRef}>
          <div>Logs:</div>
          <div className="h-40 overflow-y-auto bg-slate-50 dark:bg-slate-900 p-2 rounded border">
            {logs.map((l, i) => (
              <div key={i} className="font-mono text-[12px]">{l}</div>
            ))}
          </div>
        </div>
      </aside>

      <main className="col-span-8 p-4 bg-white dark:bg-slate-800 rounded-lg shadow overflow-y-auto max-h-screen">
        <h2 className="text-lg font-semibold mb-3">Translated Output</h2>
        <div className="min-h-40 p-3 rounded bg-slate-50 dark:bg-slate-900 mb-6">
          {output || <span className="text-gray-400">Translation will appear here…</span>}
        </div>

        {metrics && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold mb-3">Translation Metrics</h2>
            <div className="grid grid-cols-2 gap-4">
              {/* Input Section */}
            <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg text-white">
                <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Input</h3>
                <div className="text-sm space-y-1">
                  <div><span className="font-medium">Backend:</span> {metrics.input.backend?.toUpperCase() || "N/A"}</div>
                  
                  {/* Show ONNX models used if backend is ONNX */}
                  {metrics.input.backend === "onnx" && translatorStatus?.onnx.active_models && (
                    <div className="mt-2 p-2 bg-blue-100 dark:bg-blue-800/30 rounded text-xs">
                      <div className="font-semibold mb-1">Models Used:</div>
                      <div className="ml-2 space-y-0.5">
                        <div>• Encoder: {translatorStatus.onnx.active_models.encoder}</div>
                        <div>• Decoder: {translatorStatus.onnx.active_models.decoder}</div>
                        <div>• LM Head: {translatorStatus.onnx.active_models.lm_head}</div>
                      </div>
                    </div>
                  )}
                  
                  <div><span className="font-medium">Language:</span> {metrics.input.src_lang} → {metrics.input.tgt_lang}</div>
                  <div><span className="font-medium">Chars:</span> {metrics.input.char_length}</div>
                  <div><span className="font-medium">Tokens (est):</span> {metrics.input.token_length_estimate}</div>
                  <div className="mt-2 p-2 bg-white dark:bg-slate-800 rounded text-xs italic wrap-break-word">
                    {metrics.input.text.substring(0, 150)}...
                  </div>
                </div>
              </div>

              {/* Performance Section */}
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <h3 className="font-semibold text-green-800 dark:text-green-300 mb-2">Translation Latency</h3>
                <div className="text-sm space-y-2">
                  {/* Forward Translation */}
                  <div className="p-2 bg-green-100 dark:bg-green-800/30 rounded">
                    <div className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1">
                      {metrics.input.src_lang} → {metrics.input.tgt_lang}
                    </div>
                    <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                      {metrics.throughput.forward.time_s.toFixed(3)}s
                    </div>
                    <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                      {metrics.throughput.forward.tokens_per_sec.toFixed(1)} tok/s • {metrics.throughput.forward.chars_per_sec.toFixed(1)} char/s
                    </div>
                  </div>
                  
                  {/* Reverse Translation */}
                  <div className="p-2 bg-green-100 dark:bg-green-800/30 rounded">
                    <div className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1">
                      {metrics.input.tgt_lang} → {metrics.input.src_lang}
                    </div>
                    <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                      {metrics.throughput.roundtrip.time_s.toFixed(3)}s
                    </div>
                    <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                      {metrics.throughput.roundtrip.tokens_per_sec.toFixed(1)} tok/s • {metrics.throughput.roundtrip.chars_per_sec.toFixed(1)} char/s
                    </div>
                  </div>
                  
                  <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-700 text-xs">
                    <div><span className="font-medium">Total Benchmark Time:</span> {metrics.end_to_end_time_s.toFixed(2)}s</div>
                    <div className="text-[10px] text-green-600 dark:text-green-400">Includes quality metrics (BLEU/CHRF) calculation</div>
                  </div>
                </div>
              </div>

              {/* Memory Section */}
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <h3 className="font-semibold text-purple-800 dark:text-purple-300 mb-2">Memory (RAM)</h3>
                <div className="text-sm space-y-1">
                  <div><span className="font-medium">Baseline:</span> {metrics.memory.baseline_rss_mb.toFixed(2)} MB</div>
                  <div><span className="font-medium">Peak:</span> {metrics.memory.peak_rss_mb.toFixed(2)} MB</div>
                  <div><span className="font-medium">Peak Increase:</span> {metrics.memory.peak_increase_mb.toFixed(2)} MB</div>
                  <div><span className="font-medium">After Forward:</span> {metrics.memory.after_forward_rss_mb.toFixed(2)} MB</div>
                  <div><span className="font-medium">Translation Δ:</span> {metrics.memory.translation_increase_mb.toFixed(2)} MB</div>
                </div>
              </div>

              {/* VRAM Section - Only show if VRAM data is available */}
              {metrics.vram && (
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <h3 className="font-semibold text-orange-800 dark:text-orange-300 mb-2">VRAM</h3>
                  <div className="text-sm space-y-1">
                    <div><span className="font-medium">Total:</span> {metrics.vram.total_mb.toFixed(2)} MB</div>
                    <div><span className="font-medium">Baseline:</span> {metrics.vram.baseline_used_mb.toFixed(2)} MB</div>
                    <div><span className="font-medium">Peak Used:</span> {metrics.vram.peak_used_mb.toFixed(2)} MB</div>
                    <div><span className="font-medium">After Forward:</span> {metrics.vram.after_forward_used_mb.toFixed(2)} MB</div>
                    <div className="mt-2 w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                      <div
                        className="bg-orange-600 h-2.5 rounded-full"
                        style={{ width: `${(metrics.vram.peak_used_mb / metrics.vram.total_mb * 100).toFixed(1)}%` }}
                      ></div>
                    </div>
                    <div className="text-xs text-center">{(metrics.vram.peak_used_mb / metrics.vram.total_mb * 100).toFixed(1)}% utilized</div>
                  </div>
                </div>
              )}

              {/* Quality Section */}
              <div className="col-span-2 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <h3 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-2">Quality Metrics</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="font-medium">BLEU Score</div>
                    <div className="text-2xl font-bold text-yellow-700">{metrics.quality.bleu_score.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="font-medium">chrF Score</div>
                    <div className="text-2xl font-bold text-yellow-700">{metrics.quality.chrf_score.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="font-medium">Length Similarity</div>
                    <div className="text-2xl font-bold text-yellow-700">{metrics.quality.char_length_similarity_pct.toFixed(1)}%</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="font-medium">Forward Output:</div>
                    <div>{metrics.quality.forward_output_tokens} tokens, {metrics.quality.forward_output_chars} chars</div>
                  </div>
                  <div>
                    <div className="font-medium">Roundtrip Output:</div>
                    <div>{metrics.quality.roundtrip_output_tokens} tokens, {metrics.quality.roundtrip_output_chars} chars</div>
                  </div>
                </div>
              </div>

              {/* Outputs Section */}
              <div className="col-span-2 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                <h3 className="font-semibold mb-2">Translation Outputs</h3>
                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Forward ({metrics.input.src_lang} → {metrics.input.tgt_lang}):</div>
                    <div className="p-2 bg-white dark:bg-slate-800 rounded text-sm">
                      {metrics.outputs.forward_translation}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Roundtrip ({metrics.input.tgt_lang} → {metrics.input.src_lang}):</div>
                    <div className="p-2 bg-white dark:bg-slate-800 rounded text-sm">
                      {metrics.outputs.roundtrip_translation}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
