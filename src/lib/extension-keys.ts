export function eventMatchesChord(e: KeyboardEvent, chord: string) {
  const parts = chord
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const key = parts.pop();
  if (!key) return false;
  const wantCtrl = parts.includes("ctrl") || parts.includes("cmd") || parts.includes("meta");
  const wantShift = parts.includes("shift");
  const wantAlt = parts.includes("alt");
  const hasCtrl = e.ctrlKey || e.metaKey;
  if (hasCtrl !== wantCtrl) return false;
  if (e.shiftKey !== wantShift) return false;
  if (e.altKey !== wantAlt) return false;
  return e.key.toLowerCase() === key;
}
