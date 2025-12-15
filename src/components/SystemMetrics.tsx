import React, { useEffect, useState } from "react";

type MetricsData = {
  cpu_percent: number;
  ram: {
    total_bytes: number;
    used_bytes: number;
    available_bytes: number;
    percent: number;
  };
  swap: {
    total_bytes: number;
    used_bytes: number;
    percent: number;
  };
  vram: {
    available: boolean;
    total_bytes: number;
    used_bytes: number;
    reserved_bytes: number;
  };
  process: {
    pid: number;
    cpu_percent: number;
    rss_bytes: number;
    vms_bytes: number;
  };
};

export default function SystemMetrics() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let reconnectTimeout: number | null = null;

    async function connectMetrics() {
      try {
        setConnected(false);
        const res = await fetch("http://localhost:5005/system/metrics", {
          signal: controller.signal,
        });

        if (!res.body) {
          console.error("No response body from metrics endpoint");
          return;
        }

        setConnected(true);
        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunkText = decoder.decode(value, { stream: true });
          buffer += chunkText;

          const events = buffer.split("\n\n");
          for (let i = 0; i < events.length - 1; i++) {
            const event = events[i].trim();
            if (event.startsWith("data: ")) {
              const eventData = event.slice(6);
              try {
                const payload = JSON.parse(eventData);
                if (payload.type === "metrics") {
                  setMetrics(payload);
                }
              } catch (e) {
                console.error("Failed to parse metrics:", e);
              }
            }
          }
          buffer = events[events.length - 1];
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error("Metrics connection error:", err);
          setConnected(false);
          // Reconnect after 5 seconds
          reconnectTimeout = window.setTimeout(connectMetrics, 5000);
        }
      }
    }

    connectMetrics();

    return () => {
      controller.abort();
      if (reconnectTimeout !== null) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const ProgressBar = ({ percent, label, color }: { percent: number; label: string; color: string }) => (
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span>{label}</span>
        <span>{percent.toFixed(1)}%</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all duration-300`} style={{ width: `${percent}%` }}></div>
      </div>
    </div>
  );

  if (!metrics) {
    return (
      <div className="p-3 bg-white dark:bg-slate-800 rounded-lg shadow border">
        <div className="text-xs text-gray-500">
          {connected ? "Loading metrics..." : "Connecting to metrics server..."}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 bg-white dark:bg-slate-800 rounded-lg shadow border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">System Metrics</h3>
        <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}></div>
      </div>

      <ProgressBar percent={metrics.cpu_percent} label="CPU" color="bg-blue-500" />
      <ProgressBar percent={metrics.ram.percent} label={`RAM (${formatBytes(metrics.ram.used_bytes)} / ${formatBytes(metrics.ram.total_bytes)})`} color="bg-green-500" />
      
      {metrics.swap.total_bytes > 0 && (
        <ProgressBar percent={metrics.swap.percent} label={`Swap (${formatBytes(metrics.swap.used_bytes)} / ${formatBytes(metrics.swap.total_bytes)})`} color="bg-yellow-500" />
      )}

      {metrics.vram.available && (
        <ProgressBar 
          percent={(metrics.vram.used_bytes / metrics.vram.total_bytes) * 100} 
          label={`VRAM (${formatBytes(metrics.vram.used_bytes)} / ${formatBytes(metrics.vram.total_bytes)})`} 
          color="bg-purple-500" 
        />
      )}

      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
        <div className="text-xs text-gray-600 dark:text-gray-400">
          <div className="flex justify-between mb-1">
            <span>Process CPU:</span>
            <span>{metrics.process.cpu_percent.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span>Process RAM:</span>
            <span>{formatBytes(metrics.process.rss_bytes)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
