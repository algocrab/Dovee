export function canDebugPath(filePath: string) {
  if (!filePath || filePath.includes("://")) return false;
  return /\.(c|m)?[jt]sx?$/i.test(filePath);
}
