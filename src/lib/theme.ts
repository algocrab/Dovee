export type ThemeId = "dark" | "light" | "dusk";

export const THEMES: { id: ThemeId; label: string; swatches: [string, string, string] }[] = [
  { id: "dark", label: "Dark", swatches: ["#09090b", "#7dd3c0", "#e4b86a"] },
  { id: "light", label: "Light", swatches: ["#f3efe8", "#0f766e", "#b45309"] },
  { id: "dusk", label: "Dusk", swatches: ["#161210", "#e8a87c", "#f0c27a"] },
];

export const MONACO_THEME: Record<ThemeId, string> = {
  dark: "dovee-dark",
  light: "dovee-light",
  dusk: "dovee-dusk",
};

export function applyTheme(theme: ThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("dovee-theme", theme);
  } catch {
    /* ignore */
  }
}

export function applyEditorFontSize(px: number) {
  if (typeof document === "undefined") return;
  const size = Math.min(22, Math.max(11, Math.round(px)));
  document.documentElement.style.setProperty("--editor-font-size", `${size}px`);
}

export const XTERM_THEMES: Record<ThemeId, { background: string; foreground: string; cursor: string; selectionBackground: string }> = {
  dark: {
    background: "#0c0d12",
    foreground: "#eeeae3",
    cursor: "#7dd3c0",
    selectionBackground: "#7dd3c044",
  },
  light: {
    background: "#fffcf7",
    foreground: "#1c1916",
    cursor: "#0f766e",
    selectionBackground: "#0f766e33",
  },
  dusk: {
    background: "#1a1512",
    foreground: "#f3e6d4",
    cursor: "#e8a87c",
    selectionBackground: "#e8a87c44",
  },
};

export function readStoredTheme(): ThemeId {
  try {
    const v = localStorage.getItem("dovee-theme");
    if (v === "light" || v === "dusk" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return "dark";
}
