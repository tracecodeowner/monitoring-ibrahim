const X_API = "https://api.x.com/2";

async function xFetch(path: string) {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) throw new Error("X_BEARER_TOKEN is missing");

  const res = await fetch(`${X_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`X API ${res.status}: ${body}`);
  }
  return res.json();
}

export async function getUser(username: string) {
  return xFetch(`/users/by/username/${encodeURIComponent(username)}?user.fields=username,name`);
}

export async function getPosts(userId: string, sinceId?: string) {
  const params = new URLSearchParams({
    max_results: "100",
    "tweet.fields": "created_at,public_metrics,author_id",
    expansions: "author_id"
  });
  if (sinceId) params.set("since_id", sinceId);
  return xFetch(`/users/${userId}/tweets?${params.toString()}`);
}