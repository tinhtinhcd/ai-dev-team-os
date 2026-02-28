"use client";

import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { loadBrainFile, saveBrainFile } from "./actions";
import type { BrainFile } from "@/lib/brain";

const BRAIN_FILES: BrainFile[] = [
  "PRODUCT.md",
  "BACKLOG.md",
  "DECISIONS.md",
  "STACK.md",
];

export default function BrainPage() {
  const [files] = useState<BrainFile[]>(BRAIN_FILES);
  const [selected, setSelected] = useState<BrainFile>("PRODUCT.md");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadFile = useCallback(
    async (filename: BrainFile) => {
      try {
        const data = await loadBrainFile(filename);
        setContent(data);
        setStatus("idle");
        setErrorMessage(null);
      } catch (e) {
        setStatus("error");
        setErrorMessage(e instanceof Error ? e.message : "Failed to load");
      }
    },
    []
  );

  useEffect(() => {
    loadFile(selected);
  }, [selected, loadFile]);

  const handleSave = async () => {
    setStatus("saving");
    setErrorMessage(null);
    const result = await saveBrainFile(selected, content);
    if (result.success) {
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } else {
      setStatus("error");
      setErrorMessage(result.error ?? "Save failed");
    }
  };

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold tracking-tight">
            AI Dev Team OS · Brain
          </h1>
          <a
            href="/integrations"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Integrations
          </a>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`text-sm font-medium ${
              status === "saved"
                ? "text-emerald-400"
                : status === "saving"
                  ? "text-amber-400"
                  : status === "error"
                    ? "text-red-400"
                    : "text-zinc-500"
            }`}
          >
            {status === "saved"
              ? "Saved"
              : status === "saving"
                ? "Saving…"
                : status === "error"
                  ? errorMessage ?? "Error"
                  : "Unsaved"}
          </span>
          <button
            onClick={handleSave}
            disabled={status === "saving"}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </header>

      {/* Main layout */}
      <main className="flex flex-1 min-h-0">
        {/* Left: file list */}
        <aside className="w-52 shrink-0 border-r border-zinc-800 bg-zinc-900/40 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Documents
          </p>
          <nav className="flex flex-col gap-0.5">
            {files.map((file) => (
              <button
                key={file}
                onClick={() => setSelected(file)}
                className={`rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selected === file
                    ? "bg-violet-600/20 text-violet-300"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                {file}
              </button>
            ))}
          </nav>
        </aside>

        {/* Center: editor */}
        <section className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-hidden flex">
            <div className="flex-1 flex flex-col border-r border-zinc-800">
              <div className="shrink-0 px-4 py-2 text-xs text-zinc-500 border-b border-zinc-800">
                Edit
              </div>
              <textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  if (status === "saved") setStatus("idle");
                }}
                className="flex-1 w-full resize-none bg-transparent p-4 font-mono text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none"
                placeholder="Start typing markdown…"
                spellCheck={false}
              />
            </div>

            {/* Right: preview */}
            <div className="w-[50%] min-w-[320px] flex flex-col overflow-hidden">
              <div className="shrink-0 px-4 py-2 text-xs text-zinc-500 border-b border-zinc-800">
                Preview
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <article className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{content || "_No content yet._"}</ReactMarkdown>
                </article>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
