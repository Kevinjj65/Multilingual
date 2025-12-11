// src/components/ChatView.tsx in
import React, { useRef, useState } from "react";
import type { Message } from "../App";


export default function ChatView({ messages, onSend }: { messages: Message[]; onSend: (t: string) => void }) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div className="flex flex-col h-[70vh]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 dark:bg-slate-900 rounded">
        {messages.map((m) => (
          <div key={m.id} className={`p-3 rounded ${m.role === "user" ? "bg-indigo-50 self-end text-right" : m.role === "assistant" ? "bg-slate-100" : "bg-yellow-50 text-sm"}`}>
            <div className="whitespace-pre-wrap">{m.text}</div>
            <div className="text-xs text-gray-400 mt-1">{m.role}</div>
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
          className="flex-1 px-3 py-2 rounded border bg-white dark:bg-slate-700"
        />
        <button type="submit" className="px-4 py-2 rounded bg-indigo-600 text-white">Send</button>
      </form>
    </div>
  );
}
