import React from "react";
import ModelList from "../components/ModelList";
import Controls from "../components/Controls";
import ChatView from "../components/ChatView";
import SystemMetrics from "../components/SystemMetrics";
import type { Message } from "../App";

type Props = {
  models: string[];
  translatorModels: string[];
  selectedModel: string | null;
  loadedModel: string | null;
  running: boolean;
  messages: Message[];
  logs: string[];
  language: string;
  pipelineMetrics: any | null;
  onRefreshModels: () => Promise<void> | void;
  onRefreshTranslatorModels: () => Promise<void> | void;
  onLoadModel: (id: string) => Promise<void> | void;
  onUnloadModel: () => Promise<void> | void;
  onStartModel: () => Promise<void> | void;
  onStopModel: () => Promise<void> | void;
  onSendMessage: (text: string) => Promise<void> | void;
  setLanguage: (s: string) => void;
};

export default function PipelinePage({
  models,
  translatorModels,
  selectedModel,
  loadedModel,
  running,
  messages,
  logs,
  language,
  pipelineMetrics,
  onRefreshModels,
  onRefreshTranslatorModels,
  onLoadModel,
  onUnloadModel,
  onStartModel,
  onStopModel,
  onSendMessage,
  setLanguage,
}: Props) {
  return (
    <div className="grid grid-cols-12 gap-6 text-white">

      {/* LEFT PANEL */}
      <aside className="col-span-3 p-4 bg-slate-900 rounded-xl shadow-lg">

        <h2 className="text-lg font-semibold mb-4 text-white">
          Models
        </h2>

        <ModelList
          models={models}
          selected={selectedModel}
          loadedModel={loadedModel}
          onRefresh={onRefreshModels}
          onLoad={onLoadModel}
        />

        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Translation Models</div>
            <button
              onClick={onRefreshTranslatorModels}
              className="text-xs px-2 py-1 bg-indigo-100 rounded"
            >
              Refresh
            </button>
          </div>

          <div className="space-y-2">
            {translatorModels.length === 0 && (
              <div className="text-sm text-gray-500">
                No models found — drop translator models in <code>./models/translators</code>
              </div>
            )}

            {translatorModels.map((m) => (
              <div key={m} className="p-2 border rounded">
                <div className="truncate">{m}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <Controls
            loadedModel={loadedModel}
            onUnload={onUnloadModel}
            language={language}
            setLanguage={setLanguage}
          />
        </div>

        {/* SYSTEM METRICS */}
        <div className="mt-6">
          <SystemMetrics />
        </div>

        {/* PIPELINE METRICS */}
        {pipelineMetrics && (
          <div className="mt-6 text-sm bg-slate-800 p-4 rounded-lg border border-slate-700">
            <div className="font-semibold mb-3 text-indigo-400">
              Pipeline Metrics
            </div>

            {"cache_hit" in pipelineMetrics && (
              <div>Cache Hit: {pipelineMetrics.cache_hit ? "Yes" : "No"}</div>
            )}

            {typeof pipelineMetrics.cache_similarity === "number" && (
              <div>
                Cache Similarity: {pipelineMetrics.cache_similarity.toFixed(3)}
              </div>
            )}

            {typeof pipelineMetrics.embedding_time_sec === "number" && (
              <div>
                Embedding: {pipelineMetrics.embedding_time_sec.toFixed(3)}s
              </div>
            )}

            {typeof pipelineMetrics.rag_time_sec === "number" && (
              <div>
                RAG: {pipelineMetrics.rag_time_sec.toFixed(3)}s
              </div>
            )}

            {typeof pipelineMetrics.translation_in_time_sec === "number" && (
              <div>
                Translate In: {pipelineMetrics.translation_in_time_sec.toFixed(3)}s
              </div>
            )}

            {typeof pipelineMetrics.translation_out_time_sec === "number" && (
              <div>
                Translate Out: {pipelineMetrics.translation_out_time_sec.toFixed(3)}s
              </div>
            )}

            {typeof pipelineMetrics.llm_time_sec === "number" && (
              <div>
                LLM: {pipelineMetrics.llm_time_sec.toFixed(3)}s
              </div>
            )}

            {typeof pipelineMetrics.total_time_sec === "number" && (
              <div className="font-bold mt-2 text-indigo-300">
                Total: {pipelineMetrics.total_time_sec.toFixed(3)}s
              </div>
            )}
          </div>
        )}

        {/* LOGS */}
        <div className="mt-6 text-sm">
          <div className="mb-2 font-semibold text-indigo-400">Logs</div>

          <div className="h-40 overflow-y-auto bg-slate-800 p-3 rounded-lg border border-slate-700">
            {logs.map((l, i) => (
              <div key={i} className="font-mono text-xs text-white">
                {l}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* RIGHT PANEL */}
      <main className="col-span-9 p-6 bg-slate-900 rounded-xl shadow-lg text-white">

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-indigo-400">
            Edge Multilingual Assistant
          </h1>

          <div className="text-sm text-white">
            Model: {selectedModel ?? "—"}
          </div>
        </div>

        <ChatView
          messages={messages}
          onSend={onSendMessage}
          language={language}
        />
      </main>
    </div>
  );
}
