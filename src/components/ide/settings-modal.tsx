"use client";

import { Check, FolderOpen, KeyRound, Palette, Search, ShieldCheck, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useCallback, useMemo, useState, type ChangeEvent } from "react";
import { getProvider, PROVIDERS, type ProviderId } from "@/lib/providers";
import { MAX_TOOL_ROUNDS_LIMIT, MIN_TOOL_ROUNDS } from "@/lib/tool-rounds";
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
  const [formatOnSave, setFormatOnSave] = useState(settings?.formatOnSave ?? false);
  const [completionEnabled, setCompletionEnabled] = useState(settings?.completionEnabled ?? true);
  const [completionPrivacy, setCompletionPrivacy] = useState<"local-context" | "workspace">(
    settings?.completionPrivacy ?? "local-context",
  );
  const [completionExcludedPaths, setCompletionExcludedPaths] = useState(
    settings?.completionExcludedPaths?.join(", ") ?? "",
  );
  const [collaborationEnabled, setCollaborationEnabled] = useState(settings?.collaborationEnabled ?? false);
  const [maxToolRounds, setMaxToolRounds] = useState(settings?.maxToolRounds ?? 120);
  const [activeSection, setActiveSection] = useState("General");
  const [settingsSearch, setSettingsSearch] = useState("");

  const preset = useMemo(() => getProvider(provider), [provider]);

  const changeFontSize = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const size = Number(event.target.value);
    setEditorFontSize(size);
    void persistAppearance({ editorFontSize: size });
  }, []);

  const changeMaxToolRounds = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setMaxToolRounds(Number(event.target.value));
  }, []);

  function switchProvider(id: ProviderId) {
    const next = getProvider(id);
    setProvider(id);
    setBaseUrl(next.baseUrl);
    if (next.models[0]) setModel(next.models[0]);
  }

  async function save() {
    applyTheme(theme);
    const secureKeyStored = Boolean(
      apiKey &&
        window.doveeDesktop?.isDesktop &&
        (await window.doveeDesktop.storeApiKey(provider, apiKey)),
    );
    const payload: Record<string, unknown> = {
        apiKey: apiKey || undefined,
      secureKeyStored,
        provider,
        model,
        baseUrl,
        reasoningEffort: effort,
        theme,
        editorFontSize,
        wordWrap,
        minimap,
        autoSave,
        formatOnSave,
        completionEnabled,
        completionPrivacy,
        completionExcludedPaths: completionExcludedPaths
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        collaborationEnabled,
        maxToolRounds,
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

  const navItems = [
    { label: "General", icon: SlidersHorizontal },
    { label: "Appearance", icon: Palette },
    { label: "AI Provider", icon: Sparkles },
    { label: "Inline Completion", icon: Check },
    { label: "Workspace", icon: FolderOpen },
    { label: "Privacy", icon: ShieldCheck },
  ];
  const visibleNav = navItems.filter((item) => item.label.toLowerCase().includes(settingsSearch.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-3 sm:p-6">
      <div className="flex h-[min(820px,94vh)] w-full max-w-6xl overflow-hidden rounded-2xl border border-line bg-bg-2 shadow-[var(--shadow)]">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-bg-1/80 p-3 md:flex">
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-bg-2 p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal/15 text-teal">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">Dovee</div>
              <div className="truncate text-[11px] text-muted">AI coding workspace</div>
            </div>
          </div>
          <label className="relative mb-4 block">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted" />
            <input
              value={settingsSearch}
              onChange={(event) => setSettingsSearch(event.target.value)}
              placeholder="Search settings"
              className="w-full rounded-lg border border-line bg-bg px-8 py-1.5 text-[12px] text-text outline-none"
            />
          </label>
          <div className="space-y-0.5">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setActiveSection(item.label)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] ${
                    activeSection === item.label ? "bg-hover text-text" : "text-muted hover:bg-hover hover:text-text"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
          <div className="mt-auto rounded-xl border border-teal/20 bg-teal/5 p-3 text-[11px] leading-relaxed text-muted">
            <KeyRound className="mb-2 h-4 w-4 text-teal" />
            Your API key is used only for provider requests and stays on this machine.
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-7">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="eyebrow">Preferences</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">{activeSection}</h2>
            <p className="mt-1 text-[13px] text-muted">Configure Dovee for the way you build.</p>
          </div>
          <button
            type="button"
            onClick={() => useIde.getState().setSettingsOpen(false)}
            className="rounded-md p-1 text-muted hover:bg-hover hover:text-text"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mx-auto max-w-3xl space-y-6">
        <section className="panel-surface p-4">
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
            <Switch checked={formatOnSave} onChange={setFormatOnSave} label="Format on save (prettier)" />
          </div>
        </section>

        <section className="mb-5">
          <p className="mb-2 text-[13px] font-medium">Inline completion</p>
          <div className="grid gap-2">
            <Switch checked={completionEnabled} onChange={setCompletionEnabled} label="Enable inline suggestions" />
            <label className="block text-[13px] text-muted">
              Context sent to the provider
              <select
                value={completionPrivacy}
                onChange={(event) => setCompletionPrivacy(event.target.value as typeof completionPrivacy)}
                className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-[13px] text-text outline-none"
              >
                <option value="local-context">Current file context only</option>
                <option value="workspace">Include ranked workspace context</option>
              </select>
            </label>
            <label className="block text-[13px] text-muted">
              Excluded path prefixes
              <input
                value={completionExcludedPaths}
                onChange={(event) => setCompletionExcludedPaths(event.target.value)}
                placeholder="secrets/, .env, vendor/"
                className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[13px] text-text outline-none"
              />
            </label>
          </div>
          <p className="mt-2 text-[12px] text-muted">
            Suggestions use a small bounded context and can be disabled for sensitive folders.
          </p>
        </section>

        <section className="mb-5">
          <p className="mb-2 text-[13px] font-medium">Privacy and collaboration</p>
          <Switch
            checked={collaborationEnabled}
            onChange={setCollaborationEnabled}
            label="Enable collaboration foundation (experimental)"
          />
          <p className="mt-2 text-[12px] text-muted">
            Disabled by default. Live shared editing is not enabled; this flag only prepares review bundles and audit metadata.
          </p>
        </section>

        <section className="mb-5">
          <p className="mb-2 text-[13px] font-medium">AI provider</p>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => switchProvider(p.id)}
                className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                  provider === p.id ? "border-teal bg-teal/10" : "border-line hover:bg-hover"
                }`}
              >
                <span className={`block text-[13px] ${provider === p.id ? "text-teal" : "text-text"}`}>{p.label}</span>
                <span className="mt-1 block text-[11px] text-muted">
                  {p.costTier === "custom" ? "Your endpoint" : `${p.costTier} cost`} · {p.strengths.slice(0, 2).join(" · ")}
                </span>
              </button>
            ))}
          </div>
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
          <label className="mb-3 block text-[13px] text-muted">
            Max tool rounds ({maxToolRounds})
            <input
              type="range"
              min={MIN_TOOL_ROUNDS}
              max={MAX_TOOL_ROUNDS_LIMIT}
              step={8}
              value={maxToolRounds}
              onChange={changeMaxToolRounds}
              className="mt-1 w-full"
            />
            <span className="mt-1 block text-[12px] leading-relaxed">
              Safety cap for one chat turn. Long tasks keep running; the agent only stops early if it starts repeating itself. Open a new chat for new work.
            </span>
          </label>
          <p className="text-[12px] text-muted">
            Works with OpenAI-compatible APIs. Custom = any endpoint that speaks `/chat/completions`.
            Desktop builds currently store settings in{" "}
            <span className="font-mono">~/.dovee/settings.json</span>; use a machine you trust and do not commit this file.
          </p>
        </section>

        <section className="panel-surface p-4">
        <label className="block text-[13px] text-muted">
          Workspace folder
          <input
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[13px] text-text outline-none"
          />
        </label>
        </section>
        <div className="sticky bottom-0 flex justify-end border-t border-line bg-bg-2/95 py-4 backdrop-blur">
          <button type="button" onClick={() => void save()} className="rounded-lg bg-teal px-5 py-2.5 text-[13px] font-medium text-bg hover:bg-teal/90">
            Save changes
          </button>
        </div>
        </div>
        </main>
    </div>
    </div>
  );
}
