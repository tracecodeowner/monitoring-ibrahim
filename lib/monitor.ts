import { createHash } from "node:crypto";
import { hasMonitorPost, insertMonitorPost, setMonitorState } from "@/lib/db";
import { sendPush } from "@/lib/push";
import { scorePost } from "@/lib/scoring";
import { RSSMonitorSource } from "@/lib/sources/rss";
import { RSSBridgeSource } from "@/lib/sources/rss-bridge";
import { XSyndicationSource } from "@/lib/sources/x-syndication";
import { ZamantikaSource } from "@/lib/sources/zamantika";

export type Severity = "LOW" | "MEDIUM" | "HIGH";

export interface MonitorPost {
  id: string;
  username: string;
  text: string;
  created_at: string;
  score: number;
  severity: Severity;
  matches: string[];
  url: string;
  source?: string;
}

export interface MonitorSource {
  name: string;
  fetchLatestPosts(): Promise<MonitorPost[]>;
}

export type SourceHealthStatus = "HEALTHY" | "DEGRADED" | "DOWN" | "DISABLED";

export interface MonitorCheckSummary {
  ok: boolean;
  checkedSources: number;
  successfulSources: number;
  failedSources: number;
  fetchedPosts: number;
  newPosts: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
  pushSkipped: boolean;
  pushStatus: "sent" | "skipped" | "configuration-missing";
  lastSuccessfulCheck?: string;
  error?: string;
  sources: Array<{
    name: string;
    status: SourceHealthStatus;
    ok: boolean;
    posts: number;
    itemsReceived: number;
    itemsAccepted: number;
    error?: string;
  }>;
}

function isEnabled(key: string) {
  const value = (process.env[key] || "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

function parseSources() {
  const sources: MonitorSource[] = [];

  // 1. Primary Source: X Syndication
  if (isEnabled("MONITOR_ENABLE_X_SYNDICATION")) {
    sources.push(new XSyndicationSource());
  }

  // 2. Fallback Source: RSS / Google Search RSS
  if (isEnabled("MONITOR_ENABLE_RSS")) {
    const defaultGoogleRss = `https://news.google.com/rss/search?q=${encodeURIComponent("site:x.com/ibamarief")}&hl=id&gl=ID&ceid=ID:id`;
    const configured = (process.env.MONITOR_FEED_URLS || "").trim();

    const rawUrls = configured
      ? configured.split(",").map((entry) => entry.trim()).filter(Boolean)
      : [defaultGoogleRss];

    if (!rawUrls.includes(defaultGoogleRss)) {
      rawUrls.push(defaultGoogleRss);
    }

    for (const url of [...new Set(rawUrls)]) {
      try {
        new URL(url);
        sources.push(new RSSMonitorSource(url));
      } catch {
        // Ignore invalid URLs
      }
    }
  }

  // 3. Fallback Source: RSS Bridge
  if (isEnabled("MONITOR_ENABLE_RSSBRIDGE")) {
    const configured = (process.env.RSSBRIDGE_FEED_URLS || "").trim();
    if (configured) {
      const urls = configured
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

      for (const url of [...new Set(urls)]) {
        try {
          new URL(url);
          sources.push(new RSSBridgeSource(url));
        } catch {
          // Ignore invalid RSS Bridge URLs
        }
      }
    }
  }

  // 4. Fallback Source: Zamantika API
  if (isEnabled("MONITOR_ENABLE_ZAMANTIKA")) {
    const zamantikaUrl = (process.env.ZAMANTIKA_PROFILE_API_URL || "https://zamantika.com/api/twitter/profile/ibamarief").trim();
    if (zamantikaUrl) {
      try {
        new URL(zamantikaUrl);
        sources.push(new ZamantikaSource());
      } catch {
        // Ignore invalid Zamantika URL
      }
    }
  }

  return sources;
}

function normalizeText(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function postIdentity(post: MonitorPost): string {
  const rawId = normalizeText(post.id);
  if (rawId) return rawId;

  const rawUrl = normalizeText(post.url);
  if (rawUrl) return `url:${rawUrl}`;

  const payload = `${post.username}|${post.text}|${post.created_at}`;
  return createHash("sha256").update(payload).digest("hex");
}

function dedupePosts(posts: MonitorPost[]) {
  const seen = new Set<string>();
  const deduped: MonitorPost[] = [];

  for (const post of posts) {
    const normalized: MonitorPost = {
      ...post,
      id: postIdentity(post),
      text: normalizeText(post.text),
      url: normalizeText(post.url),
      username: normalizeText(post.username) || "unknown"
    };

    const key = normalized.id;
    if (seen.has(key)) continue;

    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}

export interface MonitorRuntimeDeps {
  sources?: MonitorSource[];
  hasMonitorPost?: typeof hasMonitorPost;
  insertMonitorPost?: typeof insertMonitorPost;
  setMonitorState?: typeof setMonitorState;
  sendPush?: typeof sendPush;
}

export async function runMonitorCheck(overrides: Partial<MonitorRuntimeDeps> = {}): Promise<MonitorCheckSummary> {
  const sources = overrides.sources ?? parseSources();
  const hasMonitorPostFn = overrides.hasMonitorPost ?? hasMonitorPost;
  const insertMonitorPostFn = overrides.insertMonitorPost ?? insertMonitorPost;
  const setMonitorStateFn = overrides.setMonitorState ?? setMonitorState;
  const sendPushFn = overrides.sendPush ?? sendPush;

  if (sources.length === 0) {
    return {
      ok: false,
      checkedSources: 0,
      successfulSources: 0,
      failedSources: 0,
      fetchedPosts: 0,
      newPosts: 0,
      highPriority: 0,
      mediumPriority: 0,
      lowPriority: 0,
      pushSkipped: true,
      pushStatus: "configuration-missing",
      error: "No public monitor feed configured",
      sources: []
    };
  }

  const sourceStatus: MonitorCheckSummary["sources"] = [];
  const fetched: MonitorPost[] = [];
  let successfulSources = 0;

  // Eksekusi paralel menggunakan Promise.allSettled
  const sourceResults = await Promise.allSettled(
    sources.map(async (source) => {
      const posts = await source.fetchLatestPosts();
      const itemsReceived = posts.length;
      // Safe check untuk username & text
      const itemsAccepted = posts.filter((post) => 
        (post.username || "").toLowerCase().includes("ibamarief") || 
        (post.text || "").toLowerCase().includes("ibamarief")
      ).length;
      return { source, posts, itemsReceived, itemsAccepted };
    })
  );

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const result = sourceResults[i];

    if (result.status === "fulfilled") {
      const { posts, itemsReceived, itemsAccepted } = result.value;
      fetched.push(...posts);
      successfulSources += 1;
      sourceStatus.push({
        name: source.name,
        status: "HEALTHY",
        ok: true,
        posts: itemsReceived,
        itemsReceived,
        itemsAccepted,
        error: undefined
      });
      console.log(`[source=${source.name}] status=healthy items=${itemsReceived} accepted=${itemsAccepted}`);
    } else {
      const errorMsg = result.reason?.message || "Feed fetch failed";
      sourceStatus.push({
        name: source.name,
        status: "DOWN",
        ok: false,
        posts: 0,
        itemsReceived: 0,
        itemsAccepted: 0,
        error: errorMsg
      });
      console.warn(`[source=${source.name}] status=down reason=${errorMsg}`);
    }
  }

  const deduped = dedupePosts(fetched);
  const inserted: MonitorPost[] = [];
  let pushSkipped = false;
  let pushStatus: "sent" | "skipped" | "configuration-missing" = "sent";

  for (const post of deduped) {
    try {
      if (await hasMonitorPostFn(post.id)) continue;

      const scored = scorePost(post.text);

      // OPTIMASI DATABASE: Abaikan post yang tidak ada keyword/skornya 0 (Severity LOW)
      // Ini menjaga kuota Free Tier Supabase agar tidak cepat habis.
      if (scored.score === 0 && scored.severity === "LOW") {
        continue;
      }

      const candidate = {
        ...post,
        score: scored.score,
        severity: scored.severity,
        matches: scored.matches
      } satisfies MonitorPost;

      await insertMonitorPostFn(candidate);
      inserted.push(candidate);

      if (candidate.severity === "HIGH" || candidate.severity === "MEDIUM") {
        const title = `IBAM Monitor — ${candidate.severity}`;
        const summary = `${scored.matches.join(", ") || "public feed"}: ${candidate.text.slice(0, 180)}`;
        const pushResult = await sendPushFn(title, summary, candidate.url);
        if (pushResult?.skipped) {
          pushSkipped = true;
          pushStatus = "configuration-missing";
        }
      }
    } catch (err: any) {
      console.error(`[monitor] Failed to process post id=${post.id}:`, err?.message);
    }
  }

  const timestamp = new Date().toISOString();
  try {
    await setMonitorStateFn("last_successful_check", timestamp);
  } catch (err: any) {
    console.warn("[monitor] Failed to update last_successful_check:", err?.message);
  }

  const summary: MonitorCheckSummary = {
    ok: successfulSources > 0,
    checkedSources: sources.length,
    successfulSources,
    failedSources: sources.length - successfulSources,
    fetchedPosts: deduped.length,
    newPosts: inserted.length,
    highPriority: inserted.filter((post) => post.severity === "HIGH").length,
    mediumPriority: inserted.filter((post) => post.severity === "MEDIUM").length,
    lowPriority: inserted.filter((post) => post.severity === "LOW").length,
    pushSkipped,
    pushStatus: pushSkipped ? "configuration-missing" : pushStatus,
    lastSuccessfulCheck: timestamp,
    sources: sourceStatus
  };

  console.log(`[monitor] source_count=${sources.length} successful=${successfulSources} failed=${sources.length - successfulSources} fetched=${deduped.length} new=${inserted.length} high=${summary.highPriority} medium=${summary.mediumPriority} push=${summary.pushStatus}`);

  if (successfulSources === 0) {
    return {
      ...summary,
      ok: false,
      error: "All configured monitor feeds failed"
    };
  }

  return summary;
}