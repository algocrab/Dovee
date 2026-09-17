import { NextResponse } from "next/server";
import {
  gitBranches,
  gitCheckout,
  gitCommit,
  gitCommitAndPush,
  gitCreateBranch,
  gitDiscard,
  gitFileDiff,
  gitInit,
  gitLog,
  gitPull,
  gitPush,
  gitSetRemote,
  gitStage,
  gitStatus,
  gitUnstage,
} from "@/lib/git";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const view = url.searchParams.get("view");
    if (view === "log") {
      const limit = Number(url.searchParams.get("limit") ?? "40");
      return NextResponse.json({ commits: await gitLog(Number.isFinite(limit) ? limit : 40) });
    }
    if (view === "branches") {
      return NextResponse.json({ branches: await gitBranches() });
    }
    if (view === "diff") {
      const filePath = url.searchParams.get("path");
      if (!filePath) return NextResponse.json({ error: "path required" }, { status: 400 });
      return NextResponse.json(await gitFileDiff(filePath));
    }
    return NextResponse.json(await gitStatus());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Git status failed" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: string;
      paths?: string[];
      message?: string;
      url?: string;
      branch?: string;
      name?: string;
    };
    const action = body.action ?? "";

    if (action === "init") return NextResponse.json(await gitInit());
    if (action === "stage") return NextResponse.json(await gitStage(body.paths ?? []));
    if (action === "unstage") return NextResponse.json(await gitUnstage(body.paths ?? []));
    if (action === "discard") return NextResponse.json(await gitDiscard(body.paths ?? []));
    if (action === "commit") return NextResponse.json(await gitCommit(body.message ?? ""));
    if (action === "commit-push") return NextResponse.json(await gitCommitAndPush(body.message ?? ""));
    if (action === "push") return NextResponse.json(await gitPush());
    if (action === "pull") return NextResponse.json(await gitPull());
    if (action === "remote") return NextResponse.json(await gitSetRemote(body.url ?? ""));
    if (action === "checkout") {
      return NextResponse.json(await gitCheckout(body.branch ?? body.name ?? ""));
    }
    if (action === "create-branch") {
      return NextResponse.json(await gitCreateBranch(body.branch ?? body.name ?? ""));
    }

    return NextResponse.json({ ok: false, stderr: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, stderr: error instanceof Error ? error.message : "Git action failed" },
      { status: 500 },
    );
  }
}
