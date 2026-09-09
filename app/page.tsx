 "use client";

import { useEffect, useMemo, useState } from "react";

type Severity = "LOW" | "MEDIUM" | "HIGH";

type Post = {
  id: string;
  username: string;
  text: string;
  created_at: string;
  score: number;
  severity: Severity;
  matches: string[];
  url: string;
};

const severityRank: Record<Severity, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [query, setQuery] = useState("");
  const [pushReady, setPushReady] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/posts", {
      cache: "no-store",
      headers: {
        "x-dashboard-password": password
      }
    });
    if (res.ok) setPosts(await res.json());
    setLoading(false);
  }

  async function syncNow() {
    const res = await fetch("/api/cron/trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dashboard-password": password
      },
      body: JSON.stringify({ password })
    });

    if (res.ok) await load();
    else {
      const payload = await res.json().catch(() => ({}));
      alert(payload.error || "Sync failed. Check the dashboard password or cron configuration.");
    }
  }

  async function enablePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("This browser does not support Web Push.");
      return;
    }
    const reg = await navigator.serviceWorker.register("/sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const keyRes = await fetch("/api/push/subscribe?key=public");
    const { publicKey } = await keyRes.json();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub, password })
    });
    setPushReady(true);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((post) => {
      if (!q) return true;
      const searchText = `${post.text} ${post.matches.join(" ")}`.toLowerCase();
      return searchText.includes(q);
    });
  }, [posts, query]);

  const sortedPosts = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [filtered]
  );

  const latest = useMemo(
    () => posts.reduce<Post | null>((current, post) => {
      if (!current) return post;
      return new Date(post.created_at).getTime() > new Date(current.created_at).getTime() ? post : current;
    }, null),
    [posts]
  );

  const high = posts.filter((p) => p.severity === "HIGH").length;
  const medium = posts.filter((p) => p.severity === "MEDIUM").length;
  const low = posts.filter((p) => p.severity === "LOW").length;
  const active = latest && Date.now() - new Date(latest.created_at).getTime() < 1000 * 60 * 60;
  const lastSyncLabel = latest ? formatTimestamp(latest.created_at) : "Awaiting first sync";

  const topContext = useMemo(() => {
    const tally = new Map<string, number>();
    posts.forEach((post) => {
      post.matches.forEach((match) => tally.set(match, (tally.get(match) || 0) + 1));
    });

    return [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [posts]);

  return (
    <main className="monitor-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="eyebrow">THREAT FEED // ACCOUNT MONITOR</div>
          <div className="brand-row">
            <div className="brand-mark">@</div>
            <div className="brand-name">ibamarief</div>
            <span className={`status-pill ${active ? "online" : "idle"}`}>
              <span className="signal-dot" />
              {active ? "MONITORING" : "STANDBY"}
            </span>
          </div>
        </div>

        <div className="topbar-actions">
          <button className="ghost-button" onClick={syncNow}>Sync now</button>
          <button className="primary-button" onClick={enablePush}>{pushReady ? "Alerts enabled" : "Enable phone alerts"}</button>
        </div>
      </header>

      <section className="overview-grid">
        <div className="stat-tile panel-surface tile-emphasis">
          <div className="tile-label">Status</div>
          <div className="tile-metric">{active ? "ACTIVE" : "DEGRADED"}</div>
          <div className="tile-subtitle">{active ? "Signals are being monitored" : "Waiting for next cycle"}</div>
        </div>

        <div className="stat-tile panel-surface">
          <div className="tile-label">Account</div>
          <div className="tile-metric accent">@ibamarief</div>
          <div className="tile-subtitle">Target identity</div>
        </div>

        <div className="stat-tile panel-surface">
          <div className="tile-label">Last sync</div>
          <div className="tile-metric mono">{lastSyncLabel}</div>
          <div className="tile-subtitle">Latest recorded update</div>
        </div>

        <div className="stat-tile panel-surface severity-tile high">
          <div className="tile-label">High alerts</div>
          <div className="tile-metric">{high}</div>
          <div className="tile-subtitle">Priority incidents</div>
        </div>
      </section>

      <section className="command-panel panel-surface">
        <div className="command-row">
          <label className="field field-search">
            <span className="field-label">Filter</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search post text or keyword..."
              aria-label="Filter monitored posts"
            />
          </label>

          <label className="field field-password">
            <span className="field-label">Dashboard access</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              aria-label="Dashboard password"
            />
          </label>

          <div className="inline-actions">
            <button className="ghost-button" onClick={load}>Refresh</button>
            <button className="ghost-button" onClick={() => setQuery("")}>Clear</button>
          </div>
        </div>
      </section>

      <div className="workspace-grid">
        <section className="panel-surface main-panel">
          <div className="panel-header">
            <div>
              <div className="eyebrow">SIGNAL FEED</div>
              <h2>Recent activity</h2>
            </div>
            <div className="panel-info">{filtered.length} records</div>
          </div>

          {loading ? (
            <div className="empty-state">Loading signal archive…</div>
          ) : sortedPosts.length === 0 ? (
            <div className="empty-state">No posts match the current filter. Refresh the feed or widen the search criteria.</div>
          ) : (
            <div className="signal-list">
              {sortedPosts.map((post) => (
                <article className={`signal-post severity-${post.severity.toLowerCase()}`} key={post.id}>
                  <div className="signal-row">
                    <div className="signal-meta-left">
                      <span className="severity-badge">
                        <span className="severity-dot" />
                        {post.severity}
                      </span>
                      <span className="relevance-badge">REL {post.score}</span>
                    </div>
                    <a className="post-link" href={post.url} target="_blank" rel="noreferrer">
                      Open post ↗
                    </a>
                  </div>

                  <div className="signal-body">
                    <p>{post.text}</p>
                  </div>

                  <div className="signal-tags">
                    {post.matches.length > 0 ? (
                      post.matches.map((match) => <span key={`${post.id}-${match}`} className="tag">{match}</span>)
                    ) : (
                      <span className="tag dull">No keyword matches</span>
                    )}
                  </div>

                  <div className="signal-footer">
                    <span>@{post.username}</span>
                    <span>{formatTimestamp(post.created_at)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="side-stack">
          <div className="panel-surface side-panel">
            <div className="eyebrow">INTELLIGENCE</div>
            <h3>Alert summary</h3>
            <ul className="summary-list">
              <li>
                <span>High</span>
                <strong>{high}</strong>
              </li>
              <li>
                <span>Medium</span>
                <strong>{medium}</strong>
              </li>
              <li>
                <span>Low</span>
                <strong>{low}</strong>
              </li>
            </ul>
          </div>

          <div className="panel-surface side-panel">
            <div className="eyebrow">TOP CONTEXT</div>
            <h3>Matched keywords</h3>
            <div className="context-stack">
              {topContext.length === 0 ? (
                <div className="context-empty">No keyword activity yet.</div>
              ) : (
                topContext.map(([label, count]) => (
                  <div key={label} className="context-row">
                    <span>{label}</span>
                    <strong>{count}</strong>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="panel-surface side-panel">
            <div className="eyebrow">NOTIFICATION</div>
            <h3>Phone push</h3>
            <div className="notification-status">{pushReady ? "Enabled and active" : "Awaiting browser permission"}</div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function formatTimestamp(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric"
  });
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}