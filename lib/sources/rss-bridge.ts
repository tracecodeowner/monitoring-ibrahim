import Parser from "rss-parser";
import type { MonitorPost, MonitorSource } from "@/lib/monitor";

export class RSSBridgeSource implements MonitorSource {
  name = "rss-bridge";
  url: string;

  constructor(url: string) {
    this.url = url;
  }

  async fetchLatestPosts(): Promise<MonitorPost[]> {
    const parser = new Parser({
      timeout: 15000,
      headers: { "User-Agent": "IBAM-Monitor/1.0" }
    });

    const feed = await parser.parseURL(this.url);
    const items = Array.isArray(feed.items) ? feed.items : [];
    const parsed: MonitorPost[] = [];

    for (const item of items) {
      const title = String(item.title ?? "").trim();
      const description = String(
        (item as any).description ??
        (item as any).content ??
        item.contentSnippet ??
        ""
      ).trim();

      const text = [title, description].filter(Boolean).join("\n\n").trim();
      if (!text) continue;

      const link = String(item.link ?? (item as any).guid ?? this.url);
      const timestamp = item.pubDate || (item as any).isoDate || (item as any).updated || new Date().toISOString();

      parsed.push({
        id: String((item as any).guid ?? item.link ?? `${this.url}:${title}:${timestamp}`),
        username: "ibamarief",
        text,
        created_at: new Date(timestamp).toISOString(),
        score: 0,
        severity: "LOW",
        matches: [],
        url: link,
        source: "rss-bridge"
      });
    }

    return parsed;
  }
}
