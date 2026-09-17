import fs from "node:fs/promises";
import path from "node:path";
import { getWorkspaceRoot, pathExists } from "./workspace";

export type TypeLib = { path: string; text: string };

export type TypeBundle = {
  compilerOptions: Record<string, unknown>;
  libs: TypeLib[];
  stats: { packages: number; files: number; bytes: number; skipped: number };
};

type PkgJson = {
  name?: string;
  types?: string;
  typings?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type Budget = { bytes: number; files: number; skipped: number };

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const MAX_FILES = 3000;

/** Build outputs and VCS dirs hold no hand-written source. */
const SKIP_PROJECT_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "out",
  "build",
  "coverage",
]);

/**
 * Inside a dependency we must NOT skip `dist` — that is exactly where packages
 * keep their .d.ts files (next/dist/**, lucide-react/dist/**). Only nested
 * installs are skipped.
 */
const SKIP_PACKAGE_DIRS = new Set(["node_modules"]);

/**
 * Always loaded with the base bundle so a blank React/TS file still gets
 * completions for `useState`, `process`, etc. before any import is written.
 */
const ESSENTIAL_PACKAGES = ["@types/node", "@types/react", "@types/react-dom", "csstype"];

/**
 * tsconfig.json is JSONC, so strip comments and trailing commas before parsing.
 * Tracks string state so `//` inside a string (a URL, a glob) is left alone.
 */
export function parseJsonc<T>(input: string): T {
  let out = "";
  let inString = false;
  let quote = "";
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch;
      }
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        out += ch + (next ?? "");
        i++;
        continue;
      }
      if (ch === quote) inString = false;
      out += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    out += ch;
  }

  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1")) as T;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function hasTypes(pkg: PkgJson | null) {
  if (!pkg) return false;
  return typeof pkg.types === "string" || typeof pkg.typings === "string";
}

const isDeclaration = (name: string) => name.endsWith(".d.ts") || name.endsWith(".d.mts");
const isSource = (name: string) => name.endsWith(".ts") || name.endsWith(".tsx");

function walkSource(
  dir: string,
  match: (name: string) => boolean,
  into: string[],
  skip: Set<string>,
  depth = 0,
): Promise<void> {
  if (depth > 10) return Promise.resolve();
  return fs
    .readdir(dir, { withFileTypes: true })
    .then(async (entries) => {
      for (const entry of entries) {
        if (entry.name.startsWith(".") || skip.has(entry.name)) continue;
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walkSource(abs, match, into, skip, depth + 1);
          continue;
        }
        if (entry.isFile() && match(entry.name)) into.push(abs);
      }
    })
    .catch(() => {
      /* unreadable directory */
    });
}

/** `@scope/name` -> `@types/scope__name`, matching the DefinitelyTyped convention. */
function typesPackageName(name: string) {
  if (name.startsWith("@types/")) return name.slice("@types/".length);
  if (!name.startsWith("@")) return name;
  const [scope, rest] = name.split("/");
  return rest ? `${scope.slice(1)}__${rest}` : name.slice(1);
}

/**
 * Pull bare package names out of import/require/export-from statements.
 * Skips relative paths and tsconfig path aliases (`@/...`).
 */
export function extractPackageImports(source: string): string[] {
  const found = new Set<string>();
  const re =
    /(?:import|export)(?:[\s\S]*?from\s*|[\s]*|[\s]+type[\s\S]*?from\s*)["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)|import\(\s*["']([^"']+)["']\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const spec = match[1] || match[2] || match[3];
    if (!spec) continue;
    if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("@/")) continue;
    // Scoped: @scope/name[/subpath] -> @scope/name
    // Bare: name[/subpath] -> name
    const pkg = spec.startsWith("@")
      ? spec.split("/").slice(0, 2).join("/")
      : spec.split("/")[0];
    if (pkg) found.add(pkg);
  }
  return [...found];
}

function toVirtualPath(root: string, abs: string) {
  const rel = path.relative(root, abs).split(path.sep).join("/");
  return `file:///${rel}`;
}

/**
 * The workspace's own sources. Small, always worth having, and they are what makes
 * `@/lib/...` imports resolve instead of showing "cannot find module".
 */
async function projectFiles(root: string) {
  const out: string[] = [];
  await walkSource(path.join(root, "src"), isSource, out, SKIP_PROJECT_DIRS);
  try {
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      if (entry.isFile() && isSource(entry.name)) out.push(path.join(root, entry.name));
    }
  } catch {
    /* unreadable root */
  }
  return out;
}

async function readInto(
  root: string,
  files: string[],
  libs: TypeLib[],
  budget: Budget,
  cap: number,
) {
  for (const abs of files) {
    if (budget.files >= cap || budget.bytes >= MAX_TOTAL_BYTES) {
      budget.skipped++;
      continue;
    }
    try {
      const stat = await fs.stat(abs);
      if (stat.size > MAX_FILE_BYTES) {
        budget.skipped++;
        continue;
      }
      // Skip lucide-react alternate entry points — nobody imports them, they
      // alone are ~4 MB of near-duplicate icon declarations.
      const base = path.basename(abs);
      if (base.includes(".prefixed.") || base.includes(".suffixed.")) {
        budget.skipped++;
        continue;
      }
      libs.push({ path: toVirtualPath(root, abs), text: await fs.readFile(abs, "utf8") });
      budget.files++;
      budget.bytes += stat.size;
    } catch {
      budget.skipped++;
    }
  }
}

/*
 * These values must match Monaco's OWN bundled TypeScript, not the workspace's
 * `typescript` package — the two disagree. Verified against
 * node_modules/monaco-editor/monaco.d.ts (monaco-editor 0.52.2), which uses
 * numeric enums.
 */

/** monaco.d.ts ScriptTarget: ES3=0, ES5=1, ES2015=2, ES2016=3, ES2017=4, ES2018=5, ES2019=6, ES2020=7, ESNext=99 */
const MONACO_TARGETS: Record<string, number> = {
  es3: 0,
  es5: 1,
  es6: 2,
  es2015: 2,
  es2016: 3,
  es2017: 4,
  es2018: 5,
  es2019: 6,
  es2020: 7,
  // Monaco stops at ES2020; anything newer falls back to ESNext.
  es2021: 99,
  es2022: 99,
  es2023: 99,
  es2024: 99,
  esnext: 99,
  latest: 99,
};

/** monaco.d.ts ModuleKind: None=0, CommonJS=1, AMD=2, UMD=3, System=4, ES2015=5, ESNext=99 */
const MONACO_MODULES: Record<string, number> = {
  none: 0,
  commonjs: 1,
  amd: 2,
  umd: 3,
  system: 4,
  es6: 5,
  es2015: 5,
  esnext: 99,
};

/** monaco.d.ts JsxEmit: None=0, Preserve=1, React=2, ReactNative=3, ReactJSX=4, ReactJSXDev=5 */
const MONACO_JSX: Record<string, number> = {
  none: 0,
  preserve: 1,
  react: 2,
  "react-native": 3,
  reactnative: 3,
  "react-jsx": 4,
  reactjsx: 4,
  "react-jsxdev": 5,
  reactjsxdev: 5,
};

/**
 * monaco.d.ts ModuleResolutionKind only has Classic=1 and NodeJs=2. Every modern
 * mode (node10, node16, nodenext, bundler) is closest to NodeJs, and NodeJs is
 * also what makes the node_modules .d.ts files we feed in resolvable.
 */
const MONACO_MODULE_RESOLUTION: Record<string, number> = {
  classic: 1,
  node: 2,
  nodejs: 2,
  node10: 2,
  node16: 2,
  nodenext: 2,
  bundler: 2,
};

function lower(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

/**
 * Translate the workspace tsconfig compilerOptions into the numeric enums the
 * Monaco TS worker expects. Only options that actually change IntelliSense are kept.
 */
export function toMonacoCompilerOptions(raw: Record<string, unknown>) {
  const options: Record<string, unknown> = {
    allowNonTsExtensions: true,
    allowJs: raw.allowJs === true,
    esModuleInterop: raw.esModuleInterop !== false,
    strict: raw.strict !== false,
    skipLibCheck: true,
    noEmit: true,
    // The worker's virtual FS is rooted at file:///, so `baseUrl: "file:///"`
    // is what makes the tsconfig `paths` below line up with the extra lib URIs
    // (a bare "." would resolve against an empty current directory).
    baseUrl: "file:///",
  };

  const target = MONACO_TARGETS[lower(raw.target)];
  if (target !== undefined) options.target = target;
  const moduleKind = MONACO_MODULES[lower(raw.module)];
  if (moduleKind !== undefined) options.module = moduleKind;
  const jsx = MONACO_JSX[lower(raw.jsx)];
  if (jsx !== undefined) options.jsx = jsx;
  const resolution = MONACO_MODULE_RESOLUTION[lower(raw.moduleResolution)];
  if (resolution !== undefined) options.moduleResolution = resolution;

  if (Array.isArray(raw.lib) && raw.lib.every((item) => typeof item === "string")) {
    options.lib = raw.lib as string[];
  }
  if (raw.paths && typeof raw.paths === "object") options.paths = raw.paths;

  return options;
}

async function resolveCompilerOptions(root: string) {
  try {
    const raw = await fs.readFile(path.join(root, "tsconfig.json"), "utf8");
    const parsed = parseJsonc<{ compilerOptions?: Record<string, unknown> }>(raw);
    return toMonacoCompilerOptions(parsed.compilerOptions ?? {});
  } catch {
    return toMonacoCompilerOptions({});
  }
}

/**
 * Resolve a package name to directories that hold .d.ts files:
 * the package itself (if it ships types) and/or its @types counterpart.
 */
async function packageDirsFor(root: string, name: string): Promise<string[]> {
  const nodeModules = path.join(root, "node_modules");
  const dirs: string[] = [];
  const seen = new Set<string>();

  const add = async (dir: string) => {
    const key = dir.toLowerCase();
    if (seen.has(key)) return;
    if (!(await pathExists(dir))) return;
    seen.add(key);
    dirs.push(dir);
  };

  // Direct package (next, zustand, lucide-react, @xterm/xterm, ...).
  const pkgDir = path.join(nodeModules, name);
  const pkg = await readJson<PkgJson>(path.join(pkgDir, "package.json"));
  if (hasTypes(pkg) || name.startsWith("@types/")) await add(pkgDir);

  // Matching @types package.
  if (!name.startsWith("@types/")) {
    const typesName = typesPackageName(name);
    await add(path.join(nodeModules, "@types", typesName));
  }

  // One level of type dependencies (e.g. @types/react-dom -> csstype).
  for (const dir of [...dirs]) {
    const meta = await readJson<PkgJson>(path.join(dir, "package.json"));
    for (const dep of Object.keys(meta?.dependencies ?? {})) {
      const depDir = path.join(nodeModules, dep);
      if (hasTypes(await readJson<PkgJson>(path.join(depDir, "package.json")))) {
        await add(depDir);
      }
    }
  }

  return dirs;
}

async function loadPackageLibs(root: string, names: string[], budget: Budget) {
  const libs: TypeLib[] = [];
  const loaded = new Set<string>();

  for (const name of names) {
    if (loaded.has(name)) continue;
    loaded.add(name);
    const dirs = await packageDirsFor(root, name);
    for (const dir of dirs) {
      const files: string[] = [];
      await walkSource(dir, isDeclaration, files, SKIP_PACKAGE_DIRS);
      await readInto(root, files, libs, budget, MAX_FILES);
    }
  }

  return libs;
}

type Cache = {
  root: string;
  compilerOptions: Record<string, unknown>;
  baseLibs: TypeLib[];
  baseStats: TypeBundle["stats"];
  packages: Map<string, TypeLib[]>;
};

const g = globalThis as typeof globalThis & { __doveeTypeCache?: Promise<Cache> };

async function getCache(): Promise<Cache> {
  if (!g.__doveeTypeCache) {
    g.__doveeTypeCache = (async () => {
      const root = await getWorkspaceRoot();
      const compilerOptions = await resolveCompilerOptions(root);
      const budget: Budget = { bytes: 0, files: 0, skipped: 0 };
      const baseLibs: TypeLib[] = [];

      // Workspace sources first.
      const sources = await projectFiles(root);
      await readInto(root, sources, baseLibs, budget, sources.length);

      // Essential ambient types so blank files still get React/Node completions.
      const essential = await loadPackageLibs(root, ESSENTIAL_PACKAGES, budget);
      baseLibs.push(...essential);

      return {
        root,
        compilerOptions,
        baseLibs,
        baseStats: {
          packages: ESSENTIAL_PACKAGES.length,
          files: budget.files,
          bytes: budget.bytes,
          skipped: budget.skipped,
        },
        packages: new Map(),
      };
    })().catch((error) => {
      g.__doveeTypeCache = undefined;
      throw error;
    });
  }
  return g.__doveeTypeCache;
}

/** Base bundle: compiler options + project sources + essential ambient types. */
export async function getTypeBundle(): Promise<TypeBundle> {
  const cache = await getCache();
  return {
    compilerOptions: cache.compilerOptions,
    libs: cache.baseLibs,
    stats: cache.baseStats,
  };
}

/**
 * Load .d.ts files for the given package names (and their @types / type deps).
 * Results are cached per package for the lifetime of the server process.
 */
export async function getPackageTypeLibs(names: string[]): Promise<{
  libs: TypeLib[];
  stats: TypeBundle["stats"];
}> {
  const cache = await getCache();
  const libs: TypeLib[] = [];
  const budget: Budget = { bytes: 0, files: 0, skipped: 0 };
  let packages = 0;

  for (const name of names) {
    const key = name.toLowerCase();
    let pkgLibs = cache.packages.get(key);
    if (!pkgLibs) {
      const freshBudget: Budget = { bytes: 0, files: 0, skipped: 0 };
      pkgLibs = await loadPackageLibs(cache.root, [name], freshBudget);
      cache.packages.set(key, pkgLibs);
      budget.skipped += freshBudget.skipped;
    }
    packages++;
    for (const lib of pkgLibs) {
      libs.push(lib);
      budget.files++;
      budget.bytes += lib.text.length;
    }
  }

  return {
    libs,
    stats: {
      packages,
      files: budget.files,
      bytes: budget.bytes,
      skipped: budget.skipped,
    },
  };
}

/** @deprecated alias kept for any leftover callers */
export function resetTypeBundle() {
  g.__doveeTypeCache = undefined;
}
