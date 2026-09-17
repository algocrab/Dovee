import { createRequire } from "node:module";
import path from "node:path";
import type { Options } from "prettier";
import { getWorkspaceRoot, resolveSafe } from "./workspace";

/** The slice of the prettier API this module uses, so it can be loaded at runtime. */
type PrettierApi = {
  version: string;
  format: (source: string, options?: Options) => Promise<string>;
  resolveConfig: (
    filePath: string,
    options?: { editorconfig?: boolean },
  ) => Promise<Options | null>;
  resolveConfigFile: (filePath: string) => Promise<string | null>;
  getFileInfo: (filePath: string) => Promise<{ ignored: boolean; inferredParser: string | null }>;
};

/**
 * Dovee's house style, applied ONLY when the project has no prettier config of its own.
 * A project that does have one must be formatted exactly like its own `npx prettier`
 * would, otherwise format-on-save would fight whatever their CI checks.
 */
const HOUSE_STYLE = {
  printWidth: 100,
  tabWidth: 2,
  semi: true,
  singleQuote: false,
  trailingComma: "all",
} satisfies Options;

export type FormatResult =
  | {
      ok: true;
      formatted: string;
      changed: boolean;
      parser: string;
      /** Project config that was applied, if any. */
      configPath: string | null;
    }
  | {
      ok: false;
      /** Set when the file type simply has no formatter — callers can stay quiet. */
      unsupported?: boolean;
      error: string;
    };

function unwrapPrettier(mod: unknown): PrettierApi | null {
  const asRecord = mod as { default?: unknown } | null;
  const candidate = (asRecord?.default ?? mod) as PrettierApi | undefined;
  return candidate && typeof candidate.format === "function" ? candidate : null;
}

/**
 * Prefer the workspace's own prettier so a project's pinned version, config and
 * plugins behave exactly like `npx prettier` does for them. Falls back to the copy
 * Dovee ships.
 */
async function loadPrettier(fromDir: string): Promise<PrettierApi> {
  for (const root of [fromDir, process.cwd()]) {
    try {
      const require = createRequire(path.join(root, "__dovee_resolve__.js"));
      const found = unwrapPrettier(require("prettier"));
      if (found) return found;
    } catch {
      /* try the next root */
    }
  }
  // Static enough for the bundler to trace it, so packaged builds keep prettier.
  const bundled = unwrapPrettier(await import("prettier"));
  if (bundled) return bundled;
  throw new Error("prettier is not available");
}

/** Format one file's contents. Never writes to disk — the caller decides that. */
export async function formatCode(input: { path: string; content: string }): Promise<FormatResult> {
  let abs: string;
  let prettier: PrettierApi;
  try {
    const root = await getWorkspaceRoot();
    abs = resolveSafe(root, input.path);
    prettier = await loadPrettier(path.dirname(abs));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to format" };
  }

  let config: Options | null = null;
  let configPath: string | null = null;
  try {
    config = await prettier.resolveConfig(abs, { editorconfig: true });
    if (config) configPath = (await prettier.resolveConfigFile(abs)) ?? null;
  } catch {
    config = null;
  }

  try {
    const info = await prettier.getFileInfo(abs);
    if (info.ignored) {
      return { ok: false, unsupported: true, error: `${path.basename(abs)} is in .prettierignore` };
    }
    if (!info.inferredParser) {
      const ext = path.extname(abs);
      return { ok: false, unsupported: true, error: `No formatter for ${ext || path.basename(abs)}` };
    }

    const formatted = await prettier.format(input.content, {
      ...(config ? {} : HOUSE_STYLE),
      ...config,
      filepath: abs,
      parser: info.inferredParser,
    });

    return {
      ok: true,
      formatted,
      changed: formatted !== input.content,
      parser: info.inferredParser,
      configPath,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Formatting failed" };
  }
}

/** Version of the prettier that would be used, or null when none can be loaded. */
export async function formatterVersion(): Promise<string | null> {
  try {
    const root = await getWorkspaceRoot();
    const prettier = await loadPrettier(root);
    return prettier.version ?? null;
  } catch {
    return null;
  }
}
