"use client";

import { Puzzle, RefreshCw, Sparkles } from "lucide-react";
import { useIde } from "@/stores/ide-store";
import { IconButton, PanelHeading, Switch } from "./chrome";
import { reloadExtensions, runExtensionCommand, scaffoldSampleExtension, toggleExtension } from "./extension-actions";

export function ExtensionsPanel() {
  const extensions = useIde((s) => s.extensions);
  const enabled = extensions.filter((item) => item.enabled).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeading
        kicker="Extensions"
        title={`${enabled} enabled`}
        actions={
          <>
            <IconButton title="Create sample workspace extension" onClick={() => void scaffoldSampleExtension()}>
              <Sparkles className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton title="Reload extensions" onClick={() => void reloadExtensions()}>
              <RefreshCw className="h-3.5 w-3.5" />
            </IconButton>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
        {extensions.length === 0 ? (
          <p className="px-2 py-3 text-[12px] text-muted">
            No extensions loaded. Add an unpacked extension folder with <span className="font-mono">package.json</span> or{" "}
            <span className="font-mono">.dovee/extensions</span>.
          </p>
        ) : (
          extensions.map((ext) => (
            <article key={ext.id} className="mb-2 rounded-lg border border-line bg-bg/40 p-2.5">
              <div className="flex items-start gap-2">
                <Puzzle className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{ext.name}</div>
                  <div className="truncate font-mono text-[10px] text-muted">
                    {ext.id} · v{ext.version} · {ext.source}
                  </div>
                </div>
              </div>
              {ext.description ? <p className="mt-2 text-[12px] text-muted">{ext.description}</p> : null}
              <div className="mt-2 flex flex-wrap gap-1">
                {ext.permissions.map((permission) => (
                  <span key={permission} className="rounded-md bg-gold/10 px-1.5 py-0.5 font-mono text-[10px] text-gold">
                    {permission}
                  </span>
                ))}
                {ext.themes.length ? (
                  <span className="rounded-md bg-hover px-1.5 py-0.5 font-mono text-[10px] text-muted">
                    {ext.themes.length} theme
                  </span>
                ) : null}
                {ext.snippets.length ? (
                  <span className="rounded-md bg-hover px-1.5 py-0.5 font-mono text-[10px] text-muted">
                    {ext.snippets.length} snippets
                  </span>
                ) : null}
                {ext.keybindings.length ? (
                  <span className="rounded-md bg-hover px-1.5 py-0.5 font-mono text-[10px] text-muted">
                    {ext.keybindings.map((bind) => bind.key).join(" ")}
                  </span>
                ) : null}
              </div>
              {ext.error ? <p className="mt-2 text-[12px] text-rose">{ext.error}</p> : null}
              <div className="mt-2">
                <Switch checked={ext.enabled} onChange={(value) => void toggleExtension(ext.id, value)} label={ext.enabled ? "Enabled" : "Disabled"} />
              </div>
              {ext.commands.length > 0 ? (
                <div className="mt-2 flex flex-col gap-0.5">
                  {ext.commands.map((command) => (
                    <button
                      key={command.id}
                      type="button"
                      disabled={!ext.enabled}
                      onClick={() => void runExtensionCommand(command.id)}
                      className="truncate rounded-md px-2 py-1 text-left font-mono text-[11px] text-teal hover:bg-hover disabled:text-muted"
                    >
                      {command.title}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          ))
        )}
        <p className="px-2 pt-2 text-[11px] text-muted">
          Dovee accepts an unpacked VS Code-style <span className="font-mono">package.json</span> or native{" "}
          <span className="font-mono">extension.json</span> under <span className="font-mono">.dovee/extensions/&lt;id&gt;/</span>.
          The supported subset includes commands, snippets, themes, keybindings, and limited local APIs. Extensions run locally in the IDE process.
        </p>
      </div>
    </div>
  );
}
