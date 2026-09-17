import { NextResponse } from "next/server";
import { gitCommit, gitCommitAndPush, gitInit, gitLog, gitPull, gitPush, gitSetRemote, gitStatus } from "@/lib/git";

export async function GET(req: Request) {
  const view = new URL(req.url).searchParams.get("view") || "status";
  try {
    if (view === "log") {
      const commits = await gitLog(50);
      return NextResponse.json({ commits });
    }
    const status = await gitStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    action?: string;
    message?: string;
    url?: string;
  };
  try {
    if (body.action === "init") return NextResponse.json(await gitInit());
    if (body.action === "commit") {
      const message = body.message?.trim();
      if (!message) return NextResponse.json({ ok: false, stderr: "Commit message required" }, { status: 400 });
      return NextResponse.json(await gitCommit(message));
    }
    if (body.action === "push") return NextResponse.json(await gitPush());
    if (body.action === "commit-push") {
      const message = body.message?.trim();
      if (!message) return NextResponse.json({ ok: false, stderr: "Commit message required" }, { status: 400 });
      return NextResponse.json(await gitCommitAndPush(message));
    }
    if (body.action === "pull") return NextResponse.json(await gitPull());
    if (body.action === "remote") {
      const url = body.url?.trim();
      if (!url) return NextResponse.json({ ok: false, stderr: "Remote URL required" }, { status: 400 });
      return NextResponse.json(await gitSetRemote(url));
    }
    return NextResponse.json({ ok: false, stderr: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, stderr: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
