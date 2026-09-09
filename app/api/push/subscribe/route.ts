import { NextResponse } from "next/server";
import { upsertPushSubscription } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY || "" });
}

export async function POST(request: Request) {
  const body = await request.json();

  if (process.env.DASHBOARD_PASSWORD && body.password !== process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!body.subscription?.endpoint) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  await upsertPushSubscription(body.subscription.endpoint, body.subscription);

  return NextResponse.json({ ok: true });
}