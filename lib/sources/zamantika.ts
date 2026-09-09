import type { MonitorPost, MonitorSource } from "@/lib/monitor";

export class ZamantikaSource implements MonitorSource {
  name = "Zamantika";

  async fetchLatestPosts(): Promise<MonitorPost[]> {
    const rawUrl = (process.env.ZAMANTIKA_PROFILE_API_URL || "https://zamantika.com/api/twitter/profile/ibamarief").trim();
    if (!rawUrl) throw new Error("ZAMANTIKA_PROFILE_API_URL is missing");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(rawUrl, {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        cache: "no-store",
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Zamantika HTTP ${response.status}`);
      }

      const payload = await response.json();
      const profile = payload?.profile;
      const tweets = payload?.tweets;

      if (!profile || !tweets || typeof tweets !== "object") {
        throw new Error("Zamantika payload missing profile/tweets");
      }

      const username = String(profile.screen_name || "ibamarief").toLowerCase();
      const entries = Object.entries(tweets as Record<string, any>);
      const valid = entries.filter(([tweetId, tweet]: [string, any]) => {
        const screenName = String(tweet?.core?.screen_name || "").toLowerCase();
        return screenName === username && tweetId && tweet?.full_text;
      });

      const normalized: MonitorPost[] = valid.map(([tweetId, tweet]: [string, any]) => {
        const created = tweet?.created_at ? new Date(tweet.created_at).toISOString() : new Date().toISOString();
        const text = String(tweet.full_text || "").trim();

        return {
          id: tweetId,
          username: "ibamarief",
          text,
          created_at: created,
          score: 0,
          severity: "LOW",
          matches: [],
          url: `https://x.com/ibamarief/status/${tweetId}`
        };
      });

      console.log(`[monitor][zamantika] received=${entries.length} ibamarief=${valid.length}`);
      return normalized;
    } catch (error: any) {
      const message = error?.name === "AbortError" ? "Zamantika request timed out" : (error?.message || "Zamantika fetch failed");
      console.warn(`[monitor][zamantika] failed: ${message}`);
      throw new Error(message);
    } finally {
      clearTimeout(timeout);
    }
  }
}
