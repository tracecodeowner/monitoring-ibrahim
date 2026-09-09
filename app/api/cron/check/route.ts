import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/auth";
import { runMonitorCheck } from "@/lib/monitor";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await runMonitorCheck();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("cron check failed", error);
    return NextResponse.json({ error: "Monitor check failed", details: error?.message || "Unknown error" }, { status: 500 });
  }
}