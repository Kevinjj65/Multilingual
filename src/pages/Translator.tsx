import React, { useRef, useState } from "react";
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

export default function TranslatorPage() {
  const [input, setInput] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [output, setOutput] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [srcLang, setSrcLang] = useState("hi");
  const [tgtLang, setTgtLang] = useState("en");
  const [metrics, setMetrics] = useState<TranslatorMetrics | null>(null);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output, logs]);

  async function handleTranslate() {
    if (!input.trim() || isTranslating) return;
    setOutput("");
    setIsTranslating(true);

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
        body: JSON.stringify({ text: input.trim() }),
        signal: controller.signal,
      });

      if (!res.body) throw new Error("No response body from /translate");

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      const processEvent = (eventData: string) => {
        try {
          const payload = JSON.parse(eventData);
          if (payload.type === "sentence") {
            const translated: string = String(payload.translated || "");
            const words = translated.split(/\s+/).filter(Boolean);
            wordQueue.push(...words);
            startReveal();
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
    setLogs((l) => [...l, `Measuring metrics for ${srcLang} → ${tgtLang}...`]);

    try {
      const res = await axiosInstance.post<TranslatorMetrics>(
        "/translator_metrics",
        { src_lang: srcLang, tgt_lang: tgtLang },
        { timeout: 60_000 }
      );
      setMetrics(res.data);
      setLogs((l) => [...l, `Metrics measured successfully!`]);
    } catch (err: any) {
      console.error("Translator metrics error:", err);
      setLogs((l) => [...l, `Metrics error: ${err?.response?.data?.error || err.message}`]);
    } finally {
      setIsMeasuring(false);
    }
  }

  return (
    <div className="grid grid-cols-12 gap-4 p-4 bg-gray-100 dark:bg-slate-900 min-h-screen">
      <aside className="col-span-4 p-4 bg-white dark:bg-slate-800 rounded-lg shadow overflow-y-auto max-h-screen">
        <h1 className="text-xl font-semibold mb-3">Translator</h1>
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400">Source Lang</label>
              <input
                type="text"
                value={srcLang}
                onChange={(e) => setSrcLang(e.target.value)}
                className="w-full px-2 py-1 text-sm rounded border bg-white dark:bg-slate-700"
                placeholder="hi"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400">Target Lang</label>
              <input
                type="text"
                value={tgtLang}
                onChange={(e) => setTgtLang(e.target.value)}
                className="w-full px-2 py-1 text-sm rounded border bg-white dark:bg-slate-700"
                placeholder="en"
              />
            </div>
          </div>
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
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Input</h3>
                <div className="text-sm space-y-1">
                  <div><span className="font-medium">Language:</span> {metrics.input.src_lang} → {metrics.input.tgt_lang}</div>
                  <div><span className="font-medium">Chars:</span> {metrics.input.char_length}</div>
                  <div><span className="font-medium">Tokens (est):</span> {metrics.input.token_length_estimate}</div>
                  <div className="mt-2 p-2 bg-white dark:bg-slate-800 rounded text-xs italic break-words">
                    {metrics.input.text.substring(0, 150)}...
                  </div>
                </div>
              </div>

              {/* Performance Section */}
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <h3 className="font-semibold text-green-800 dark:text-green-300 mb-2">Performance</h3>
                <div className="text-sm space-y-1">
                  <div><span className="font-medium">End-to-End:</span> {metrics.end_to_end_time_s.toFixed(2)}s</div>
                  <div className="mt-2 font-medium text-xs">Forward:</div>
                  <div className="ml-3">Time: {metrics.throughput.forward.time_s.toFixed(2)}s</div>
                  <div className="ml-3">Speed: {metrics.throughput.forward.tokens_per_sec.toFixed(1)} tok/s</div>
                  <div className="mt-2 font-medium text-xs">Roundtrip:</div>
                  <div className="ml-3">Time: {metrics.throughput.roundtrip.time_s.toFixed(2)}s</div>
                  <div className="ml-3">Speed: {metrics.throughput.roundtrip.tokens_per_sec.toFixed(1)} tok/s</div>
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

              {/* VRAM Section */}
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
