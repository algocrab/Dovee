export const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".cache",
  "dist",
  "build",
  "out",
  "coverage",
  "__pycache__",
  ".venv",
  "venv",
  ".dovee",
  ".dovee-desktop",
  ".idea",
  ".vscode",
  ".cursor",
]);

export const BINARY_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "bmp",
  "svg",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "mp3",
  "mp4",
  "webm",
  "wav",
  "pdf",
  "zip",
  "gz",
  "7z",
  "rar",
  "exe",
  "dll",
  "bin",
  "wasm",
  "ico",
  "psd",
  "ai",
  "lockb",
]);

export function isIgnoredName(name: string) {
  if (IGNORE_DIRS.has(name)) return true;
  if (name === ".env" || name.startsWith(".env.")) return name !== ".env.example";
  return false;
}

export function isBinaryPath(filePath: string) {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return BINARY_EXTS.has(ext);
}

export function languageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    md: "markdown",
    css: "css",
    scss: "scss",
    html: "html",
    htm: "html",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    c: "c",
    h: "c",
    cpp: "cpp",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    rb: "ruby",
    sh: "shell",
    bash: "shell",
    ps1: "powershell",
    yml: "yaml",
    yaml: "yaml",
    toml: "toml",
    xml: "xml",
    sql: "sql",
    graphql: "graphql",
    vue: "vue",
    svelte: "svelte",
    txt: "plaintext",
  };
  return map[ext] ?? "plaintext";
}
