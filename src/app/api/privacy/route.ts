import { NextResponse } from "next/server";
import { loadSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await loadSettings();
  return NextResponse.json({
    local: [
      "Workspace files, editor buffers, Git metadata, recovery snapshots, and context index remain on this machine.",
      "Telemetry is not sent by default.",
    ],
    providerBound: [
      settings.provider === "custom"
        ? "Only the bounded request context selected by Dovee is sent to your custom endpoint."
        : `Only requests made to ${settings.provider} are sent to that provider.`,
      "Inline completion uses the current file context unless workspace context is explicitly enabled.",
    ],
    userControls: [
      "Completion can be disabled or excluded by path.",
      "Provider, model, and API key can be changed in Settings.",
      "Collaboration foundation is disabled by default.",
    ],
  });
}
