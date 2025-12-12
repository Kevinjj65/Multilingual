import React, { useRef, useState } from "react";

export default function TranslatorPage() {
  const [input, setInput] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [output, setOutput] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
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

  return (
    <div className="grid grid-cols-12 gap-6">
      <aside className="col-span-4 p-4 bg-white dark:bg-slate-800 rounded-lg shadow">
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

        <div className="mt-4 text-xs text-gray-500 dark:text-gray-400" ref={scrollRef}>
          <div>Logs:</div>
          <div className="h-40 overflow-y-auto bg-slate-50 dark:bg-slate-900 p-2 rounded border">
            {logs.map((l, i) => (
              <div key={i} className="font-mono text-[12px]">{l}</div>
            ))}
          </div>
        </div>
      </aside>

      <main className="col-span-8 p-4 bg-white dark:bg-slate-800 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-3">Translated Output</h2>
        <div className="min-h-40 p-3 rounded bg-slate-50 dark:bg-slate-900">
          {output || <span className="text-gray-400">Translation will appear here…</span>}
        </div>
      </main>
    </div>
  );
}
