import React, { useRef, useState, useEffect } from "react";
import SystemMetrics from "../components/SystemMetrics";
import axiosInstance from "../lib/axiosInstance";

interface TranslatorMetrics {
  dataset?: {
    name?: string;
    split?: string;
    samples_evaluated?: number;
    src_lang?: string;
    tgt_lang?: string;
    backend?: string;
    source?: string;
  };
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
    corpus_bleu?: number;
    char_length_similarity_pct: number;
    chrf_score: number;
    corpus_chrf?: number;
    forward_output_chars: number;
    forward_output_tokens: number;
    roundtrip_output_chars: number;
    roundtrip_output_tokens: number;
  };
  examples?: Array<{
    source: string;
    reference: string;
    hypothesis: string;
  }>;
  throughput: {
    avg_time_per_sentence_s?: number;
    total_time_s?: number;
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
  active_translator: string;
  active_translator_key?: "onnx" | "nllb";
  active_onnx_family?: "m2m" | "nllb";
  onnx_backend_name?: string;
  onnx_families?: {
    m2m?: { available?: boolean };
    nllb?: { available?: boolean };
  };
  onnx: {
    available: boolean;
    family?: "m2m" | "nllb";
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

interface OnnxCatalogStatus {
  family: "m2m" | "nllb";
  default_files: string[];
  downloaded_files: string[];
  all_default_downloaded: boolean;
  tokenizer_ready: boolean;
  tokenizer_error?: string | null;
  family_files_status: Array<{
    name: string;
    downloaded: boolean;
  }>;
  total_family_files: number;
  downloaded_family_files: number;
  all_family_downloaded: boolean;
}

export default function TranslatorPage() {
  const [input, setInput] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [output, setOutput] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [srcLang, setSrcLang] = useState("hi");
  const [metrics, setMetrics] = useState<TranslatorMetrics | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [metricsDataset, setMetricsDataset] = useState<"demo" | "flores200">("demo");
  const [floresSplit, setFloresSplit] = useState<"dev" | "devtest">("devtest");
  const [floresSamples, setFloresSamples] = useState<number>(100);
  const [translatorStatus, setTranslatorStatus] = useState<TranslatorStatus | null>(null);
  const [selectedBackend, setSelectedBackend] = useState<"onnx" | "nllb">("onnx");
  const [backendLoading, setBackendLoading] = useState<"m2m_onnx" | "nllb_onnx" | "nllb_pytorch" | null>(null);
  const [downloadingFamily, setDownloadingFamily] = useState<"m2m" | "nllb" | null>(null);
  const [downloadingFileKey, setDownloadingFileKey] = useState<string | null>(null);
  const [downloadingTokenizerFamily, setDownloadingTokenizerFamily] = useState<"m2m" | "nllb" | null>(null);
  const [onnxCatalogStatus, setOnnxCatalogStatus] = useState<Record<"m2m" | "nllb", OnnxCatalogStatus | null>>({
    m2m: null,
    nllb: null,
  });
  const [lastBackendUsed, setLastBackendUsed] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeOnnxFamily = translatorStatus?.onnx?.family === "nllb" ? "nllb" : "m2m";

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
      const activeKey = res.data.active_translator_key ?? (res.data.active_translator === "nllb" ? "nllb" : "onnx");
      setSelectedBackend(activeKey);
      setLogs((l) => [...l, `Translator status: ${String(res.data.active_translator).toUpperCase()}`]);
      await fetchOnnxDownloadStatus();
    } catch (err: any) {
      console.error("Translator status error:", err);
      setLogs((l) => [...l, `Status error: ${err?.message}`]);
    }
  }

  async function fetchOnnxDownloadStatus() {
    try {
      const [m2mRes, nllbRes] = await Promise.all([
        axiosInstance.get<OnnxCatalogStatus>("/onnx_models/catalog?family=m2m"),
        axiosInstance.get<OnnxCatalogStatus>("/onnx_models/catalog?family=nllb"),
      ]);
      setOnnxCatalogStatus({
        m2m: m2mRes.data,
        nllb: nllbRes.data,
      });
    } catch (err: any) {
      setLogs((l) => [...l, `Catalog status error: ${err?.response?.data?.error || err?.message || err}`]);
    }
  }

  async function loadTranslationBackend(target: "m2m_onnx" | "nllb_onnx" | "nllb_pytorch") {
    if (!translatorStatus || backendLoading) return;

    if (target === "m2m_onnx" && !translatorStatus.onnx_families?.m2m?.available) {
      setLogs((l) => [...l, "M2M ONNX models/tokenizer not available"]);
      return;
    }
    if (target === "nllb_onnx" && !translatorStatus.onnx_families?.nllb?.available) {
      setLogs((l) => [...l, "NLLB ONNX models/tokenizer not available"]);
      return;
    }

    setBackendLoading(target);
    try {
      const useOnnx = target !== "nllb_pytorch";
      const onnxFamily = target === "nllb_onnx" ? "nllb" : "m2m";
      await axiosInstance.post("/toggle_translator", {
        use_onnx: useOnnx,
        onnx_family: onnxFamily,
      }, { timeout: 120000 });
      await fetchTranslatorStatus();
      const displayName = target === "m2m_onnx" ? "M2M ONNX" : target === "nllb_onnx" ? "NLLB ONNX" : "NLLB PyTorch";
      setLogs((l) => [...l, `Loaded translation backend: ${displayName}`]);
    } catch (err: any) {
      console.error("Load backend error:", err);
      setLogs((l) => [...l, `Load error: ${err?.response?.data?.error || err.message}`]);
    } finally {
      setBackendLoading(null);
    }
  }

  async function downloadOnnxModels(family: "m2m" | "nllb") {
    if (downloadingFamily) return;
    setDownloadingFamily(family);
    setLogs((l) => [...l, `Downloading ${family.toUpperCase()} ONNX models...`]);

    try {
      const res = await axiosInstance.post("/onnx_models/download", {
        family,
        include_tokenizer: true,
      }, { timeout: 0 });

      const requested = Array.isArray(res.data?.requested_files) ? res.data.requested_files.length : 0;
      const downloaded = Array.isArray(res.data?.downloaded) ? res.data.downloaded.length : 0;
      const downloadedItems: Array<{ name?: string }> = Array.isArray(res.data?.downloaded) ? res.data.downloaded : [];

      if (downloadedItems.length > 0) {
        setLogs((l) => [
          ...l,
          ...downloadedItems
            .map((item) => String(item?.name || "").trim())
            .filter(Boolean)
            .map((name) => `Downloaded model: ${name}`),
        ]);
      } else {
        const progressItems: string[] = Array.isArray(res.data?.progress) ? res.data.progress : [];
        const completionLines = progressItems
          .filter((line) => typeof line === "string" && line.toLowerCase().startsWith("downloaded "))
          .map((line) => `Downloaded model: ${line.replace(/^downloaded\s+/i, "").trim()}`);
        if (completionLines.length > 0) {
          setLogs((l) => [...l, ...completionLines]);
        }
      }

      setLogs((l) => [...l, `Default ${family.toUpperCase()} ONNX models download complete (${downloaded}/${requested} files)`]);
      await fetchOnnxDownloadStatus();
      await fetchTranslatorStatus();
    } catch (err: any) {
      console.error("ONNX download error:", err);
      setLogs((l) => [...l, `Download error: ${err?.response?.data?.error || err.message}`]);
    } finally {
      setDownloadingFamily(null);
    }
  }

  async function downloadSingleOnnxModel(family: "m2m" | "nllb", fileName: string) {
    if (downloadingFileKey || downloadingFamily) return;
    const fileKey = `${family}:${fileName}`;
    setDownloadingFileKey(fileKey);
    setLogs((l) => [...l, `Downloading ${fileName} (${family.toUpperCase()} family)...`]);

    try {
      await axiosInstance.post("/onnx_models/download", {
        family,
        files: [fileName],
        include_tokenizer: false,
      }, { timeout: 0 });
      setLogs((l) => [...l, `Downloaded ${fileName}`]);
      await fetchOnnxDownloadStatus();
      await fetchTranslatorStatus();
    } catch (err: any) {
      console.error("Single ONNX file download error:", err);
      setLogs((l) => [...l, `File download error (${fileName}): ${err?.response?.data?.error || err.message}`]);
    } finally {
      setDownloadingFileKey(null);
    }
  }

  async function downloadOnnxTokenizer(family: "m2m" | "nllb") {
    if (downloadingTokenizerFamily || downloadingFamily || downloadingFileKey) return;
    setDownloadingTokenizerFamily(family);
    setLogs((l) => [...l, `Downloading tokenizer for ${family.toUpperCase()} ONNX...`]);

    try {
      const res = await axiosInstance.post("/onnx_tokenizer/ensure", {
        family,
        force_download: false,
      }, { timeout: 0 });
      const modelName = String(res.data?.model || "tokenizer");
      setLogs((l) => [...l, `Tokenizer downloaded: ${modelName}`]);
      await fetchOnnxDownloadStatus();
      await fetchTranslatorStatus();
    } catch (err: any) {
      console.error("Tokenizer download error:", err);
      setLogs((l) => [...l, `Tokenizer download error (${family}): ${err?.response?.data?.error || err.message}`]);
    } finally {
      setDownloadingTokenizerFamily(null);
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
          use_onnx: selectedBackend === "onnx",
          onnx_family: translatorStatus?.active_onnx_family || activeOnnxFamily,
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
    setMetricsError(null);
    const backend = selectedBackend === "onnx"
      ? (translatorStatus?.onnx_backend_name || "m2m_onnx").toUpperCase()
      : "NLLB";
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
          use_onnx: selectedBackend === "onnx",
          dataset: metricsDataset,
          flores_split: floresSplit,
          flores_samples: floresSamples,
        },
        { timeout: metricsDataset === "flores200" ? 0 : 60_000 }
      );
      const payload: any = (res.data as any)?.results ?? res.data;
      if (payload?.error) {
        const errMsg = String(payload.error);
        setMetrics(null);
        setMetricsError(errMsg);
        setLogs((l) => [...l, `Metrics error: ${errMsg}`]);
        return;
      }
      setMetrics(payload);
      setLogs((l) => [...l, `${backend} metrics measured successfully!`]);
    } catch (err: any) {
      console.error("Translator metrics error:", err);
      const errMsg = String(err?.response?.data?.error || err.message || err);
      setMetricsError(errMsg);
      setLogs((l) => [...l, `Metrics error: ${errMsg}`]);
    } finally {
      setIsMeasuring(false);
    }
  }

  return (
<div className="grid grid-cols-12 gap-4 p-4 bg-slate-900 min-h-screen text-white">
      <aside className="col-span-4 p-4 bg-white dark:bg-slate-800 rounded-lg shadow overflow-y-auto max-h-screen">
        <h1 className="text-xl font-semibold mb-3">Translator</h1>

        {/* Backend Selector */}
        {translatorStatus && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-700">
            <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">Translation Backend</h3>
            
            {/* Status Info */}
            <div className="text-xs mb-3 space-y-1">
              <div className="flex items-center gap-2">
                <span>M2M ONNX: {translatorStatus.onnx_families?.m2m?.available ? "✓ Available" : "✗ Unavailable"}</span>
                {selectedBackend === "onnx" && activeOnnxFamily === "m2m" ? (
                  <span className="ml-auto px-2 py-0.5 rounded bg-green-600 text-white">Loaded</span>
                ) : (
                  <button
                    onClick={() => loadTranslationBackend("m2m_onnx")}
                    disabled={backendLoading !== null || !translatorStatus.onnx_families?.m2m?.available}
                    className="ml-auto px-2 py-0.5 rounded bg-indigo-600 text-white disabled:opacity-50"
                  >
                    {backendLoading === "m2m_onnx" ? "Loading..." : "Load"}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span>NLLB ONNX: {translatorStatus.onnx_families?.nllb?.available ? "✓ Available" : "✗ Unavailable"}</span>
                {selectedBackend === "onnx" && activeOnnxFamily === "nllb" ? (
                  <span className="ml-auto px-2 py-0.5 rounded bg-green-600 text-white">Loaded</span>
                ) : (
                  <button
                    onClick={() => loadTranslationBackend("nllb_onnx")}
                    disabled={backendLoading !== null || !translatorStatus.onnx_families?.nllb?.available}
                    className="ml-auto px-2 py-0.5 rounded bg-indigo-600 text-white disabled:opacity-50"
                  >
                    {backendLoading === "nllb_onnx" ? "Loading..." : "Load"}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span>NLLB PyTorch: {translatorStatus.nllb.available ? "✓ Available" : "✗ Unavailable"}</span>
                {selectedBackend === "nllb" ? (
                  <span className="ml-auto px-2 py-0.5 rounded bg-green-600 text-white">Loaded</span>
                ) : (
                  <button
                    onClick={() => loadTranslationBackend("nllb_pytorch")}
                    disabled={backendLoading !== null || !translatorStatus.nllb.available}
                    className="ml-auto px-2 py-0.5 rounded bg-indigo-600 text-white disabled:opacity-50"
                  >
                    {backendLoading === "nllb_pytorch" ? "Loading..." : "Load"}
                  </button>
                )}
              </div>
            </div>

            {lastBackendUsed && (
              <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                Last used: <span className="font-semibold">{lastBackendUsed.toUpperCase()}</span>
              </div>
            )}

            <div className="mt-3 p-2 bg-white dark:bg-slate-800 rounded text-xs">
              <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">Active Translation Model</div>
              {selectedBackend === "onnx" ? (
                <div className="text-gray-600 dark:text-gray-400 space-y-0.5">
                  <div>Type: {activeOnnxFamily === "m2m" ? "M2M ONNX" : "NLLB ONNX"}</div>
                  <div>Encoder file: {translatorStatus.onnx.active_models?.encoder || "-"}</div>
                  <div>Decoder file: {translatorStatus.onnx.active_models?.decoder || "-"}</div>
                  <div>LM head file: {translatorStatus.onnx.active_models?.lm_head || "-"}</div>
                </div>
              ) : (
                <div className="text-gray-600 dark:text-gray-400 space-y-0.5">
                  <div>Type: NLLB PyTorch</div>
                  <div>Model: {translatorStatus.nllb.model}</div>
                </div>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
              <div className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-2">Model Download Status</div>
              {(["m2m", "nllb"] as const).map((family) => {
                const status = onnxCatalogStatus[family];
                const totalFamilyCount = status?.total_family_files ?? 0;
                const downloadedFamilyCount = status?.downloaded_family_files ?? 0;
                const isFamilyComplete = Boolean(status?.all_family_downloaded);
                const isDefaultComplete = Boolean(status?.all_default_downloaded);
                const isBusy = downloadingFamily === family;
                const isTokenizerBusy = downloadingTokenizerFamily === family;
                const isTokenizerKnown = typeof status?.tokenizer_ready === "boolean";
                const isTokenizerReady = Boolean(status?.tokenizer_ready);
                const label = family === "m2m" ? "M2M ONNX" : "NLLB ONNX";

                return (
                  <div key={family} className="mb-2 p-2 rounded border bg-white dark:bg-slate-800">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs font-medium">{label}</div>
                      <span className={`text-[10px] px-2 py-0.5 rounded ${isDefaultComplete ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {isDefaultComplete ? "Defaults downloaded" : "Defaults missing"}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-600 dark:text-gray-400 mb-2">
                      {status
                        ? `${downloadedFamilyCount}/${totalFamilyCount} family files downloaded • ${isFamilyComplete ? "family complete" : "family incomplete"}`
                        : "Checking status..."}
                    </div>

                    <div className="text-[10px] text-slate-700 dark:text-slate-200 mb-2 p-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold">Tokenizer Status</span>
                        <span className={!isTokenizerKnown ? "text-slate-500" : isTokenizerReady ? "text-green-600" : "text-amber-600"}>
                          {!isTokenizerKnown ? "loading..." : isTokenizerReady ? "downloaded" : "not downloaded"}
                        </span>
                      </div>
                      <button
                        onClick={() => downloadOnnxTokenizer(family)}
                        disabled={Boolean(downloadingFamily) || Boolean(downloadingFileKey) || Boolean(downloadingTokenizerFamily) || isTokenizerReady || !isTokenizerKnown}
                        className="mt-1 w-full px-2 py-1 rounded bg-purple-600 text-white disabled:opacity-50"
                      >
                        {isTokenizerBusy
                          ? "Downloading tokenizer..."
                          : isTokenizerReady
                            ? `${label} tokenizer already downloaded`
                            : !isTokenizerKnown
                              ? "Checking tokenizer status..."
                              : `Download ${label} tokenizer`}
                      </button>
                    </div>

                    {status && status.family_files_status.length > 0 && (
                      <div className="max-h-24 overflow-y-auto mb-2 p-1 rounded border bg-slate-50 dark:bg-slate-900">
                        {status.family_files_status.map((file) => (
                          <div key={file.name} className="flex items-center justify-between text-[10px] py-0.5">
                            <span className="truncate pr-2">{file.name}</span>
                            {file.downloaded ? (
                              <span className="text-green-600">downloaded</span>
                            ) : (
                              <button
                                onClick={() => downloadSingleOnnxModel(family, file.name)}
                                disabled={Boolean(downloadingFamily) || Boolean(downloadingFileKey)}
                                className="px-2 py-0.5 rounded bg-amber-600 text-white disabled:opacity-50"
                              >
                                {downloadingFileKey === `${family}:${file.name}` ? "downloading..." : "download"}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => downloadOnnxModels(family)}
                      disabled={Boolean(downloadingFamily) || Boolean(downloadingFileKey) || Boolean(downloadingTokenizerFamily) || isDefaultComplete}
                      className="w-full px-2 py-1 rounded text-xs font-medium bg-indigo-600 text-white disabled:opacity-50"
                    >
                      {isBusy
                        ? "Downloading defaults..."
                        : isDefaultComplete
                          ? `Default ${label} models already downloaded`
                          : `Download default ${label} models`}
                    </button>
                  </div>
                );
              })}
            </div>
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

          <div>
            <label className="text-xs text-gray-600 dark:text-gray-400">Benchmark Dataset</label>
            <select
              value={metricsDataset}
              onChange={(e) => setMetricsDataset(e.target.value as "demo" | "flores200")}
              className="w-full px-2 py-1.5 text-sm rounded border bg-white dark:bg-slate-700"
            >
              <option value="demo">Demo text (quick)</option>
              <option value="flores200">FLORES-200 (corpus)</option>
            </select>
          </div>

          {metricsDataset === "flores200" && (
            <>
              <div>
                <label className="text-xs text-gray-600 dark:text-gray-400">FLORES Split</label>
                <select
                  value={floresSplit}
                  onChange={(e) => setFloresSplit(e.target.value as "dev" | "devtest")}
                  className="w-full px-2 py-1.5 text-sm rounded border bg-white dark:bg-slate-700"
                >
                  <option value="devtest">devtest</option>
                  <option value="dev">dev</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 dark:text-gray-400">FLORES Samples</label>
                <input
                  type="number"
                  min={1}
                  max={2000}
                  value={floresSamples}
                  onChange={(e) => setFloresSamples(Math.max(1, Number(e.target.value || 1)))}
                  className="w-full px-2 py-1.5 text-sm rounded border bg-white dark:bg-slate-700"
                />
              </div>
            </>
          )}
          
          {/* Show ONNX models being measured */}
          {selectedBackend === "onnx" && translatorStatus?.onnx.active_models && (
            <div className="text-xs text-gray-600 dark:text-gray-400 p-2 bg-gray-100 dark:bg-gray-800 rounded">
              <div className="font-semibold mb-1">
                {activeOnnxFamily === "m2m" ? "M2M ONNX" : "NLLB ONNX"} files used for benchmark:
              </div>
              <div>Encoder file: {translatorStatus.onnx.active_models.encoder}</div>
              <div>Decoder file: {translatorStatus.onnx.active_models.decoder}</div>
              <div>LM head file: {translatorStatus.onnx.active_models.lm_head}</div>
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
            {(metrics.dataset?.name === "FLORES-200" || typeof metrics.quality?.corpus_bleu === "number") ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg text-white">
                  <h3 className="font-semibold text-blue-300 mb-2">Dataset</h3>
                  <div className="text-sm space-y-1">
                    <div><span className="font-medium">Name:</span> {metrics.dataset?.name || "FLORES-200"}</div>
                    <div><span className="font-medium">Split:</span> {metrics.dataset?.split || floresSplit}</div>
                    <div><span className="font-medium">Samples:</span> {metrics.dataset?.samples_evaluated ?? floresSamples}</div>
                    <div><span className="font-medium">Lang:</span> {metrics.dataset?.src_lang || srcLang} → {metrics.dataset?.tgt_lang || "en"}</div>
                    <div><span className="font-medium">Backend:</span> {String(metrics.dataset?.backend || backend).toUpperCase()}</div>
                  </div>
                </div>

                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <h3 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-2">FLORES Quality</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="font-medium">Corpus BLEU</div>
                      <div className="text-2xl font-bold text-yellow-700">{Number(metrics.quality?.corpus_bleu ?? 0).toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="font-medium">Corpus chrF</div>
                      <div className="text-2xl font-bold text-yellow-700">{Number(metrics.quality?.corpus_chrf ?? 0).toFixed(2)}</div>
                    </div>
                  </div>
                </div>

                <div className="col-span-2 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <h3 className="font-semibold text-green-800 dark:text-green-300 mb-2">FLORES Throughput</h3>
                  <div className="grid grid-cols-4 gap-3 text-sm">
                    <div><span className="font-medium">Avg / sentence:</span><br />{Number(metrics.throughput?.avg_time_per_sentence_s ?? 0).toFixed(4)}s</div>
                    <div><span className="font-medium">Chars / sec:</span><br />{Number(metrics.throughput?.forward?.chars_per_sec ?? metrics.throughput?.chars_per_sec ?? 0).toFixed(2)}</div>
                    <div><span className="font-medium">Tokens / sec:</span><br />{Number(metrics.throughput?.forward?.tokens_per_sec ?? metrics.throughput?.tokens_per_sec ?? 0).toFixed(2)}</div>
                    <div><span className="font-medium">Total time:</span><br />{Number(metrics.throughput?.total_time_s ?? 0).toFixed(3)}s</div>
                  </div>
                </div>

                {Array.isArray(metrics.examples) && metrics.examples.length > 0 && (
                  <div className="col-span-2 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                    <h3 className="font-semibold mb-2">FLORES Examples</h3>
                    <div className="space-y-3 text-sm max-h-80 overflow-y-auto">
                      {metrics.examples.slice(0, 5).map((ex, idx) => (
                        <div key={idx} className="p-2 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          <div className="text-xs text-gray-500 mb-1">Sample {idx + 1}</div>
                          <div><span className="font-medium">Source:</span> {ex.source}</div>
                          <div><span className="font-medium">Reference:</span> {ex.reference}</div>
                          <div><span className="font-medium">Hypothesis:</span> {ex.hypothesis}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (metrics.input && metrics.throughput?.forward && metrics.throughput?.roundtrip && metrics.quality && metrics.memory ? (
            <div className="grid grid-cols-2 gap-4">
              {/* Input Section */}
            <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg text-white">
                <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Input</h3>
                <div className="text-sm space-y-1">
                  <div><span className="font-medium">Backend:</span> {metrics.input.backend?.toUpperCase() || "N/A"}</div>
                  
                  {/* Show ONNX models used if backend is ONNX */}
                  {(metrics.input.backend === "onnx" || metrics.input.backend === "m2m_onnx" || metrics.input.backend === "nllb_onnx") && translatorStatus?.onnx.active_models && (
                    <div className="mt-2 p-2 bg-blue-100 dark:bg-blue-800/30 rounded text-xs">
                      <div className="font-semibold mb-1">
                        {activeOnnxFamily === "m2m" ? "M2M ONNX" : "NLLB ONNX"} files used:
                      </div>
                      <div className="ml-2 space-y-0.5">
                        <div>• Encoder file: {translatorStatus.onnx.active_models.encoder}</div>
                        <div>• Decoder file: {translatorStatus.onnx.active_models.decoder}</div>
                        <div>• LM head file: {translatorStatus.onnx.active_models.lm_head}</div>
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
            ) : (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-700 dark:text-red-300">
                Metrics response is missing expected fields. Try measuring again or check backend response format.
              </div>
            ))}
          </div>
        )}

        {metricsError && (
          <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-700 dark:text-red-300">
            <div className="font-semibold mb-1">Metrics Error</div>
            <div>{metricsError}</div>
          </div>
        )}
      </main>
    </div>
  );
}
