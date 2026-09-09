import Parser from "rss-parser";
import type { MonitorPost, MonitorSource } from "@/lib/monitor";

export type RSSFetchOptions = {
  fetcher?: typeof fetch;
};

export class RSSSource implements MonitorSource {
  name: string;
  url: string;
  fetcher: typeof fetch;

  constructor(url: string, options: RSSFetchOptions = {}) {
    this.url = url;
    this.fetcher = options.fetcher ?? fetch;
    try {
      this.name = new URL(url).hostname || "RSS feed";
    } catch {
      this.name = "RSS feed";
    }
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
      const summary = [
        item.contentSnippet,
        (item as any).content,
        (item as any).summary,
        (item as any).description,
        (item as any)["content:encoded"]
      ]
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .join("\n\n");

      const text = [title, summary].filter(Boolean).join("\n\n").trim();
      const link = String(item.link ?? (item as any).guid ?? this.url);
      const timestamp = item.pubDate || (item as any).isoDate || (item as any).updated || new Date().toISOString();

      if (!text) continue;

      parsed.push({
        id: String((item as any).guid ?? (item as any).id ?? link ?? `${this.url}:${title}:${timestamp}`),
        username: this.name,
        text,
        created_at: new Date(timestamp).toISOString(),
        score: 0,
        severity: "LOW",
        matches: [],
        url: link,
        source: "rss"
      });
    }

    return parsed;
  }
}

export class RSSMonitorSource extends RSSSource {}
