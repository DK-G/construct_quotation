-- D1 schema for construct-quotation-api
-- Apply with:
--   npx wrangler d1 execute construct-quotation-db --remote --file=./schema.sql
-- (use --local instead of --remote for `wrangler dev` local development)

-- フィードバックイベント（エクスポート操作1回 = 1イベント）
CREATE TABLE IF NOT EXISTS feedback_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  action_type TEXT NOT NULL,
  context_text TEXT,
  total_steps INTEGER NOT NULL DEFAULT 0,
  excluded_count INTEGER NOT NULL DEFAULT 0
);

-- イベント内の工程ごとの採用・除外詳細（辞書還流の分析単位）
CREATE TABLE IF NOT EXISTS feedback_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES feedback_events(id),
  finish_trigger TEXT NOT NULL,
  finish_display_name TEXT,
  process_name TEXT NOT NULL,
  step INTEGER,
  confidence TEXT,
  is_excluded INTEGER NOT NULL DEFAULT 0,
  exclude_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedback_details_trigger_process
  ON feedback_details (finish_trigger, process_name);

-- 管理画面から永続化されたマスタ辞書（静的JSONのオーバーライド）
CREATE TABLE IF NOT EXISTS dictionaries (
  finish_trigger TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
