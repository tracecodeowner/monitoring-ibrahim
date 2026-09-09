import { NextResponse } from "next/server";
import { listMonitorPosts } from "@/lib/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const headerPassword = request.headers.get("x-dashboard-password") ?? "";
  const password = headerPassword || url.searchParams.get("password") || "";

  if (process.env.DASHBOARD_PASSWORD && password !== process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await listMonitorPosts();
  return NextResponse.json(rows);
}