// src/components/ChatView.tsx in
import React, { useRef, useState } from "react";
import type { Message } from "../App";
import VirtualKeyboard from "./VirtualKeyboard";


export default function ChatView({ messages, onSend, language }: { messages: Message[]; onSend: (t: string) => void; language: string }) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showKeyboard, setShowKeyboard] = useState(true);


  // auto scroll on new messages
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
  };

  // when language is auto, fall back to English keyboard
  const keyboardLang = language === "auto" ? "en" : language;

  return (
    <div className="flex flex-col h-[70vh]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 dark:bg-slate-900 rounded">
        {messages.map((m) => (
  <div
    key={m.id}
    className={`p-3 rounded max-w-[80%] ${
      m.role === "user"
        ? "bg-indigo-600 text-white self-end text-right"
        : m.role === "assistant"
        ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white"
        : "bg-yellow-100 dark:bg-yellow-900 text-slate-800 dark:text-yellow-200 text-sm"
    }`}
  >
    <div className="whitespace-pre-wrap">{m.text}</div>
    <div className="text-xs opacity-70 mt-1">{m.role}</div>
  </div>
))}

        {messages.length === 0 && (
          <div className="text-center text-gray-400">No conversation yet. Try loading a model and sending a prompt.</div>
        )}
      </div>

      <form onSubmit={submit} className="mt-3 flex gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message (or paste text)..."
          className="flex-1 px-3 py-2 rounded border 
bg-white text-black 
dark:bg-slate-700 dark:text-white 
border-slate-300 dark:border-slate-600"

        />
        <button type="submit" className="px-4 py-2 rounded bg-indigo-600 text-white">Send</button>
      </form>

      <div className="mt-2">
  <button
    onClick={() => setShowKeyboard((s) => !s)}
    className="text-sm px-3 py-1 rounded bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-white"
  >
    {showKeyboard ? "Hide Keyboard" : "Show Keyboard"}
  </button>

  {showKeyboard && (
    <VirtualKeyboard
      language={keyboardLang}
      value={input}
      onChange={setInput}
    />
  )}
</div>

    </div>
  );
}
