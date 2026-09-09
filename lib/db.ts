import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl) throw new Error("SUPABASE_URL is missing");
if (!supabaseSecretKey) throw new Error("SUPABASE_SECRET_KEY is missing");

export const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

export async function ensureSchema() {
  const requiredTables = ["monitor_posts", "monitor_state", "push_subscriptions"];

  for (const tableName of requiredTables) {
    const columnName = tableName === "monitor_state" ? "key" : "id";
    const { error } = await supabaseAdmin.from(tableName).select(columnName).limit(1);

    if (error && error.code === "42P01") {
      throw new Error(`Supabase table "${tableName}" is missing. Run the SQL in supabase/schema.sql.`);
    }

    if (error) {
      throw new Error(`Supabase schema check failed for "${tableName}": ${error.message}`);
    }
  }
}

export async function listMonitorPosts() {
  await ensureSchema();
  const { data, error } = await supabaseAdmin
    .from("monitor_posts")
    .select("id, username, text, created_at, score, severity, matches, url")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return data ?? [];
}

export async function getMonitorState(key: string) {
  await ensureSchema();
  const { data, error } = await supabaseAdmin
    .from("monitor_state")
    .select("value")
    .eq("key", key)
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;
  return data?.value ?? undefined;
}

export async function setMonitorState(key: string, value: string) {
  await ensureSchema();
  const { error } = await supabaseAdmin
    .from("monitor_state")
    .upsert({ key, value }, { onConflict: "key" });

  if (error) throw error;
}

export async function hasMonitorPost(id: string) {
  await ensureSchema();
  const { data, error } = await supabaseAdmin
    .from("monitor_posts")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;
  return Boolean(data);
}

export async function insertMonitorPost(post: {
  id: string;
  username: string;
  text: string;
  created_at: string;
  score: number;
  severity: string;
  matches: string[];
  url: string;
}) {
  await ensureSchema();
  const { error } = await supabaseAdmin.from("monitor_posts").insert({
    id: post.id,
    username: post.username,
    text: post.text,
    created_at: post.created_at,
    score: post.score,
    severity: post.severity,
    matches: post.matches,
    url: post.url
  });

  if (error) throw error;
}

export async function listPushSubscriptions() {
  await ensureSchema();
  const { data, error } = await supabaseAdmin.from("push_subscriptions").select("id, subscription");
  if (error) throw error;
  return data ?? [];
}

export async function upsertPushSubscription(endpoint: string, subscription: Record<string, unknown>) {
  await ensureSchema();
  const { error } = await supabaseAdmin
    .from("push_subscriptions")
    .upsert({ endpoint, subscription }, { onConflict: "endpoint" });

  if (error) throw error;
}

export async function deletePushSubscription(id: number) {
  await ensureSchema();
  const { error } = await supabaseAdmin.from("push_subscriptions").delete().eq("id", id);
  if (error) throw error;
}