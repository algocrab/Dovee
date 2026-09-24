import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const RECOVERY_DIR = path.join(os.homedir(), ".dovee", "recovery");
const MAX_SNAPSHOTS = 100;

export type RecoverySnapshot = {
  id: string;
  path: string;
  original: string;
  modified: string;
  createdAt: string;
};

export async function saveRecoverySnapshot(snapshot: Omit<RecoverySnapshot, "id" | "createdAt">) {
  await fs.mkdir(RECOVERY_DIR, { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const value: RecoverySnapshot = { ...snapshot, id, createdAt: new Date().toISOString() };
  await fs.writeFile(path.join(RECOVERY_DIR, `${id}.json`), JSON.stringify(value), "utf8");
  const entries = (await fs.readdir(RECOVERY_DIR)).filter((entry) => entry.endsWith(".json")).sort().reverse();
  await Promise.all(entries.slice(MAX_SNAPSHOTS).map((entry) => fs.unlink(path.join(RECOVERY_DIR, entry)).catch(() => undefined)));
  return value;
}

export async function listRecoverySnapshots() {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(RECOVERY_DIR);
  } catch {
    return [];
  }
  const snapshots: RecoverySnapshot[] = [];
  for (const entry of entries.filter((item) => item.endsWith(".json")).sort().reverse().slice(0, MAX_SNAPSHOTS)) {
    try {
      snapshots.push(JSON.parse(await fs.readFile(path.join(RECOVERY_DIR, entry), "utf8")) as RecoverySnapshot);
    } catch {
      /* Ignore a partially written snapshot. */
    }
  }
  return snapshots;
}
