-- IBAM Monitor schema for Supabase
-- Run this in the Supabase SQL editor after creating the project.

CREATE TABLE IF NOT EXISTS monitor_posts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  severity TEXT NOT NULL DEFAULT 'LOW' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH')),
  matches JSONB NOT NULL DEFAULT '[]'::jsonb,
  url TEXT NOT NULL,
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monitor_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  endpoint TEXT UNIQUE NOT NULL,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monitor_posts_created_at
  ON monitor_posts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_monitor_posts_severity
  ON monitor_posts (severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_monitor_posts_score
  ON monitor_posts (score DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_monitor_state_key
  ON monitor_state (key);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint
  ON push_subscriptions (endpoint);
