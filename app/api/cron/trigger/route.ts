import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { runMonitorCheck } from "@/lib/monitor";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { password?: string } = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const password = body.password ?? request.headers.get("x-dashboard-password") ?? "";

  if (!authorized(request, password)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runMonitorCheck();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("manual sync failed", error);
    return NextResponse.json({ error: "Sync failed", details: error?.message || "Unknown error" }, { status: 500 });
  }
}
