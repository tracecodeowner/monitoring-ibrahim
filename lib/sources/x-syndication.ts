import type { MonitorPost, MonitorSource } from "@/lib/monitor";

const X_SYNDICATION_URL = "https://syndication.twitter.com/srv/timeline-profile/screen-name/ibamarief";
const HTML_CHALLENGE_MARKERS = [
  "cf-challenge",
  "Just a moment",
  "checking your browser",
  "captcha",
  "enable javascript",
  "cloudflare"
];

export class XSyndicationSource implements MonitorSource {
  name = "x-syndication";

  async fetchLatestPosts(): Promise<MonitorPost[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(X_SYNDICATION_URL, {
        method: "GET",
        headers: {
          Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
          "User-Agent": "IBAM-Monitor/1.0"
        },
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      if (!text || text.trim().length === 0) {
        return [];
      }

      const isHtmlChallenge = HTML_CHALLENGE_MARKERS.some((marker) => text.toLowerCase().includes(marker.toLowerCase()));
      if (isHtmlChallenge) {
        throw new Error("non-timeline-response");
      }

      const jsonLike = text.trim();
      if (!jsonLike.startsWith("[") && !jsonLike.startsWith("{")) {
        return [];
      }

      let payload: any[] | Record<string, any> | null = null;
      try {
        payload = JSON.parse(jsonLike);
      } catch {
        return [];
      }

      const items = Array.isArray(payload) ? payload : [payload];
      const accepted: MonitorPost[] = [];

      for (const item of items) {
        const tweetId = String(item?.id || item?.tweet_id || item?.status_id || "").trim();
        const textValue = String(item?.text || item?.full_text || item?.content || "").trim();
        const username = String(item?.user?.screen_name || item?.screen_name || item?.username || "").toLowerCase();
        const createdAt = item?.created_at || item?.createdAt || item?.timestamp;
        const link = item?.link || (tweetId ? `https://x.com/ibamarief/status/${tweetId}` : "");

        if (!tweetId || !textValue || username !== "ibamarief") continue;

        accepted.push({
          id: tweetId,
          username: "ibamarief",
          text: textValue,
          created_at: createdAt ? new Date(createdAt).toISOString() : new Date().toISOString(),
          score: 0,
          severity: "LOW",
          matches: [],
          url: link,
          source: "x-syndication"
        });
      }

      console.log(`[source=x-syndication] status=healthy items=${items.length} accepted=${accepted.length}`);
      return accepted;
    } catch (error: any) {
      const reason = error?.name === "AbortError" ? "timeout" : (error?.message || "error");
      console.warn(`[source=x-syndication] status=down reason=${reason}`);
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }
}
