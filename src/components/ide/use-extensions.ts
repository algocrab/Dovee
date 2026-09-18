"use client";

import { useEffect } from "react";
import { useIde } from "@/stores/ide-store";
import { loadExtensions } from "./extension-actions";

const STYLE_ID = "dovee-ext-theme";

export function useExtensions() {
  const workspace = useIde((s) => s.settings?.workspace);
  const extensions = useIde((s) => s.extensions);
  const extensionThemeId = useIde((s) => s.extensionThemeId);

  useEffect(() => {
    if (!workspace) return;
    void loadExtensions().catch(() => {
      useIde.getState().setStatus("Could not load extensions");
    });
  }, [workspace]);

  useEffect(() => {
    if (extensionThemeId) {
      const still = extensions.some(
        (ext) => ext.enabled && ext.themes.some((theme) => theme.id === extensionThemeId),
      );
      if (!still) {
        useIde.getState().setExtensionTheme(null);
        return;
      }
    }
    const pack = extensions
      .filter((ext) => ext.enabled)
      .flatMap((ext) => ext.themes)
      .find((theme) => theme.id === extensionThemeId);
    const existing = document.getElementById(STYLE_ID);
    if (!pack) {
      existing?.remove();
      return;
    }
    const node = existing ?? document.createElement("style");
    node.id = STYLE_ID;
    node.textContent = `html, html[data-theme], :root { ${pack.css} }`;
    if (!existing) document.head.append(node);
  }, [extensions, extensionThemeId]);
}
