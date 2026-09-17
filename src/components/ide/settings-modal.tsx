"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { useIde } from "@/stores/ide-store";
import { refreshRoot } from "./file-tree";

export function SettingsModal() {
  const open = useIde((s) => s.settingsOpen);
  const settings = useIde((s) => s.settings);
  if (!open) return null;
  return <SettingsForm settings={settings} />;
}

function SettingsForm({
  settings,
}: {
  settings: ReturnType<typeof useIde.getState>["settings"];
}) {
  const [apiKey, setApiKey] = useState("");
  const [workspace, setWorkspace] = useState(settings?.workspace ?? "");
  const [model, setModel] = useState(settings?.model ?? "deepseek-flash");
  const [effort, setEffort] = useState(settings?.reasoningEffort ?? "high");

  async function save() {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: apiKey || undefined,
        workspace,
        model,
        reasoningEffort: effort,
      }),
    });
    const data = await res.json();
    useIde.getState().setSettings(data);
    useIde.getState().setSettingsOpen(false);
    await refreshRoot();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-bg-2 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium">Settings</h2>
          <button type="button" onClick={() => useIde.getState().setSettingsOpen(false)} className="text-muted hover:text-text">
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="mb-3 block text-xs text-muted">
          DeepSeek API key
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings?.apiKeyHint || "sk-…"}
            className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-xs text-text outline-none focus:border-teal/40"
          />
        </label>
        <label className="mb-3 block text-xs text-muted">
          Workspace folder
          <input
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-xs text-text outline-none focus:border-teal/40"
          />
        </label>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block text-xs text-muted">
            Model
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as typeof model)}
              className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-text outline-none"
            >
              <option value="deepseek-flash">deepseek-flash (V4.1)</option>
              <option value="deepseek-v4-pro">deepseek-v4-pro</option>
            </select>
          </label>
          <label className="block text-xs text-muted">
            Thinking
            <select
              value={effort}
              onChange={(e) => setEffort(e.target.value as typeof effort)}
              className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-text outline-none"
            >
              <option value="none">Off</option>
              <option value="low">Low</option>
              <option value="high">High</option>
              <option value="max">Max</option>
            </select>
          </label>
        </div>
        <p className="mb-4 text-[11px] text-muted">
          Key is stored in <span className="font-mono">~/.dovee/settings.json</span> and only used server-side.
        </p>
        <button type="button" onClick={() => void save()} className="w-full rounded-lg bg-teal/20 py-2 text-sm text-teal hover:bg-teal/30">
          Save
        </button>
      </div>
    </div>
  );
}
