"use client";

import { X } from "lucide-react";
import { useCallback, useMemo, useState, type ChangeEvent } from "react";
import { getProvider, PROVIDERS, type ProviderId } from "@/lib/providers";
import { applyTheme, THEMES, type ThemeId } from "@/lib/theme";
import { useIde } from "@/stores/ide-store";
import { persistAppearance } from "./actions";
import { Switch } from "./chrome";
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
  const [provider, setProvider] = useState<ProviderId>((settings?.provider as ProviderId) ?? "deepseek");
  const [model, setModel] = useState(settings?.model ?? "deepseek-flash");
  const [baseUrl, setBaseUrl] = useState(settings?.baseUrl ?? "https://api.deepseek.com");
  const [effort, setEffort] = useState(settings?.reasoningEffort ?? "high");
  const [theme, setTheme] = useState<ThemeId>(settings?.theme ?? "dark");
  const [editorFontSize, setEditorFontSize] = useState(settings?.editorFontSize ?? 15);
  const [wordWrap, setWordWrap] = useState(settings?.wordWrap ?? true);
  const [minimap, setMinimap] = useState(settings?.minimap ?? false);
  const [autoSave, setAutoSave] = useState(settings?.autoSave ?? false);

  const preset = useMemo(() => getProvider(provider), [provider]);

  const changeFontSize = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const size = Number(event.target.value);
    setEditorFontSize(size);
    void persistAppearance({ editorFontSize: size });
  }, []);

  function switchProvider(id: ProviderId) {
    const next = getProvider(id);
    setProvider(id);
    setBaseUrl(next.baseUrl);
    if (next.models[0]) setModel(next.models[0]);
  }

  async function save() {
    applyTheme(theme);
    const payload: Record<string, unknown> = {
        apiKey: apiKey || undefined,
        provider,
        model,
        baseUrl,
        reasoningEffort: effort,
        theme,
        editorFontSize,
        wordWrap,
        minimap,
        autoSave,
      };
    if (workspace.trim() && workspace.trim() !== (settings?.workspace ?? "")) {
      payload.workspace = workspace.trim();
    }
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    useIde.getState().setSettings(data);
    useIde.getState().setSettingsOpen(false);
    await refreshRoot();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
      <div className="max-h-[88vh] w-full max-w-lg overflow-auto rounded-2xl border border-line bg-bg-2 p-5 shadow-[var(--shadow)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-medium">Settings</h2>
          <button
            type="button"
            onClick={() => useIde.getState().setSettingsOpen(false)}
            className="rounded-md p-1 text-muted hover:bg-hover hover:text-text"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <section className="mb-5">
          <p className="mb-2 text-[13px] font-medium">Appearance</p>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTheme(t.id);
                  applyTheme(t.id);
                }}
                className={`rounded-xl border px-2 py-2.5 text-left text-[13px] ${
                  theme === t.id ? "border-teal bg-teal/15 text-teal" : "border-line hover:bg-hover"
                }`}
              >
                <span className="mb-2 flex gap-1">
                  {t.swatches.map((color) => (
                    <span key={color} className="h-3 w-3 rounded-full border border-line" style={{ background: color }} />
                  ))}
                </span>
                {t.label}
              </button>
            ))}
          </div>
          <label className="mb-3 block text-[13px] text-muted">
            Editor / terminal font size ({editorFontSize}px)
            <input
              type="range"
              min={11}
              max={22}
              value={editorFontSize}
              onChange={changeFontSize}
              className="mt-1 w-full"
            />
            <span
              className="mt-2 block rounded-lg border border-line bg-bg px-3 py-2 font-mono text-text"
              style={{ fontSize: editorFontSize, lineHeight: 1.55 }}
            >
              {'function greet() { return "hello"; }'}
            </span>
          </label>
          <div className="grid gap-2">
            <Switch checked={wordWrap} onChange={setWordWrap} label="Word wrap" />
            <Switch checked={minimap} onChange={setMinimap} label="Minimap" />
            <Switch checked={autoSave} onChange={setAutoSave} label="Auto save" />
          </div>
        </section>

        <section className="mb-5">
          <p className="mb-2 text-[13px] font-medium">AI provider</p>
          <label className="mb-3 block text-[13px] text-muted">
            Provider
            <select
              value={provider}
              onChange={(e) => switchProvider(e.target.value as ProviderId)}
              className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-[13px] text-text outline-none"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-3 block text-[13px] text-muted">
            {preset.label} API key
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings?.apiKeyHint || "paste key…"}
              className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[13px] text-text outline-none focus:border-teal/40"
            />
            {preset.docs && (
              <a href={preset.docs} target="_blank" rel="noreferrer" className="mt-1 inline-block text-teal hover:underline">
                Get a key
              </a>
            )}
          </label>
          <label className="mb-3 block text-[13px] text-muted">
            Model
            <input
              list="dovee-models"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="model id"
              className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[13px] text-text outline-none focus:border-teal/40"
            />
            <datalist id="dovee-models">
              {preset.models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <label className="mb-3 block text-[13px] text-muted">
            Base URL
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[13px] text-text outline-none focus:border-teal/40"
            />
          </label>
          {provider === "deepseek" && (
            <label className="mb-3 block text-[13px] text-muted">
              Thinking
              <select
                value={effort}
                onChange={(e) => setEffort(e.target.value as typeof effort)}
                className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-[13px] text-text outline-none"
              >
                <option value="none">Off</option>
                <option value="low">Low</option>
                <option value="high">High</option>
                <option value="max">Max</option>
              </select>
            </label>
          )}
          <p className="text-[12px] text-muted">
            Works with OpenAI-compatible APIs. Custom = any endpoint that speaks `/chat/completions`. Keys stay in{" "}
            <span className="font-mono">~/.dovee/settings.json</span>.
          </p>
        </section>

        <label className="mb-4 block text-[13px] text-muted">
          Workspace folder
          <input
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[13px] text-text outline-none focus:border-teal/40"
          />
        </label>
        <button type="button" onClick={() => void save()} className="w-full rounded-lg bg-teal/20 py-2.5 text-[15px] text-teal hover:bg-teal/30">
          Save
        </button>
      </div>
    </div>
  );
}
