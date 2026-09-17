import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 5 * 60 * 1000;

function trimOutput(value: string) {
  const lines = value
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[lines.length - 1] || null;
}

async function pickWindows(startPath?: string) {
  const script = path.join(process.cwd(), "scripts", "pick-folder.ps1");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-STA",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      "-StartPath",
      startPath || "",
    ],
    { timeout: TIMEOUT_MS, windowsHide: false, encoding: "utf8" },
  );
  return trimOutput(stdout) || null;
}

async function pickMac(startPath?: string) {
  const prompt = "Open Folder";
  const script = startPath
    ? `try { POSIX path of (choose folder with prompt "${prompt}" default location POSIX file ${JSON.stringify(startPath)}) } on error { "" }`
    : `try { POSIX path of (choose folder with prompt "${prompt}") } on error { "" }`;
  const { stdout } = await execFileAsync("osascript", ["-e", script], {
    timeout: TIMEOUT_MS,
    encoding: "utf8",
  });
  return trimOutput(stdout).replace(/\/$/, "") || null;
}

async function pickLinux(startPath?: string) {
  const args = ["--file-selection", "--directory", "--title=Open Folder"];
  if (startPath) args.push(`--filename=${startPath}${startPath.endsWith("/") ? "" : "/"}`);
  try {
    const { stdout } = await execFileAsync("zenity", args, {
      timeout: TIMEOUT_MS,
      encoding: "utf8",
    });
    return trimOutput(stdout) || null;
  } catch (error) {
    const err = error as { code?: number; stdout?: string };
    if (err.code === 1) return null;
    const kdialogArgs = ["--getexistingdirectory"];
    if (startPath) kdialogArgs.push(startPath);
    else kdialogArgs.push(os.homedir());
    const { stdout } = await execFileAsync("kdialog", kdialogArgs, {
      timeout: TIMEOUT_MS,
      encoding: "utf8",
    });
    return trimOutput(stdout) || null;
  }
}

export async function pickFolderDialog(startPath?: string) {
  if (process.platform === "win32") return pickWindows(startPath);
  if (process.platform === "darwin") return pickMac(startPath);
  return pickLinux(startPath);
}
