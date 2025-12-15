import React from "react";
import ModelList from "../components/ModelList";
import Controls from "../components/Controls";
import ChatView from "../components/ChatView";
import SystemMetrics from "../components/SystemMetrics";
import type { Message } from "../App";

type Props = {
  models: string[];
  selectedModel: string | null;
  loadedModel: string | null;
  running: boolean;
  messages: Message[];
  logs: string[];
  language: string;
  onRefreshModels: () => Promise<void> | void;
  onLoadModel: (id: string) => Promise<void> | void;
  onUnloadModel: () => Promise<void> | void;
  onStartModel: () => Promise<void> | void;
  onStopModel: () => Promise<void> | void;
  onSendMessage: (text: string) => Promise<void> | void;
  setLanguage: (s: string) => void;
};

export default function PipelinePage({
  models,
  selectedModel,
  loadedModel,
  running,
  messages,
  logs,
  language,
  onRefreshModels,
  onLoadModel,
  onUnloadModel,
  onStartModel,
  onStopModel,
  onSendMessage,
  setLanguage,
}: Props) {
  return (
    <div className="grid grid-cols-12 gap-6">
      <aside className="col-span-3 p-4 bg-white dark:bg-slate-800 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-3">Models</h2>
        <ModelList models={models} selected={selectedModel} loadedModel={loadedModel} onRefresh={onRefreshModels} onLoad={onLoadModel} />
        <div className="mt-4">
          <Controls loadedModel={loadedModel} onUnload={onUnloadModel} language={language} setLanguage={setLanguage} />
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

      <main className="col-span-9 p-4 bg-white dark:bg-slate-800 rounded-lg shadow">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Edge Multilingual Assistant</h1>
          <div className="text-sm text-gray-500 dark:text-gray-400">Model: {selectedModel ?? "—"}</div>
        </div>

        <ChatView messages={messages} onSend={onSendMessage} />
      </main>
    </div>
  );
}
