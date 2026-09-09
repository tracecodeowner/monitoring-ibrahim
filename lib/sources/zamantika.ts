import type { MonitorPost, MonitorSource } from "@/lib/monitor";

export class ZamantikaSource implements MonitorSource {
  name = "Zamantika";

  async fetchLatestPosts(): Promise<MonitorPost[]> {
    const rawUrl = (process.env.ZAMANTIKA_PROFILE_API_URL || "https://zamantika.com/api/twitter/profile/ibamarief").trim();
    if (!rawUrl) throw new Error("ZAMANTIKA_PROFILE_API_URL is missing");

    const customCookie = process.env.ZAMANTIKA_COOKIE || "";
    const customUserAgent = process.env.ZAMANTIKA_USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const headers: Record<string, string> = {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Referer": "https://zamantika.com/",
        "Origin": "https://zamantika.com",
        "User-Agent": customUserAgent,
        "Sec-Ch-Ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
      };

      if (customCookie) {
        headers["Cookie"] = customCookie;
      }

      const response = await fetch(rawUrl, {
        method: "GET",
        headers,
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