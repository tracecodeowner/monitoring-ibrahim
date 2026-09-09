import webpush from "web-push";
import { deletePushSubscription, listPushSubscriptions } from "./db";

function configured() {
  const publicKey = (process.env.VAPID_PUBLIC_KEY || "").trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = (process.env.VAPID_SUBJECT || "").trim();

  const placeholderValues = new Set(["replace_me", "placeholder", "changeme", "example", "test"]);
  if (!publicKey || !privateKey || !subject) return false;
  if ([publicKey, privateKey, subject].some((value) => placeholderValues.has(value.toLowerCase()))) return false;

  try {
    const decoded = Buffer.from(publicKey.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (decoded.length !== 65) return false;
  } catch {
    return false;
  }

  return true;
}

if (configured()) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
}

export async function sendPush(title: string, body: string, url: string) {
  if (!configured()) {
    return { skipped: true, reason: "VAPID configuration missing or placeholder" };
  }

  const rows = await listPushSubscriptions();
  for (const row of rows) {
    const subscription = row.subscription as Record<string, unknown>;
    try {
      await webpush.sendNotification(
        subscription as any,
        JSON.stringify({ title, body, url })
      );
    } catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await deletePushSubscription(Number(row.id));
      }
    }
  }

  return { skipped: false, reason: null };
}