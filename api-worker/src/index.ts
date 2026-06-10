import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { extractAndSaveKnowledge } from './utils/extractKnowledge';
import { filterProcessesWithLLM } from './utils/llmFilter';
import { parseTextWithLLM } from './utils/llmParser';
import { validateFinishTrigger } from './utils/validateDictionary';
import { FinishTrigger } from './dictionary/types';

// Static import of all 10 core dictionaries for Edge compatibility
import baseboard_setup from './dictionary/data/baseboard_setup.json';
import carpet_layout from './dictionary/data/carpet_layout.json';
import cross from './dictionary/data/cross.json';
import cushion_floor from './dictionary/data/cushion_floor.json';
import flooring from './dictionary/data/flooring.json';
import painting from './dictionary/data/painting.json';
import plaster_finish from './dictionary/data/plaster_finish.json';
import tatami_layout from './dictionary/data/tatami_layout.json';
import tile_finish from './dictionary/data/tile_finish.json';
import vinyl_sheet from './dictionary/data/vinyl_sheet.json';

type Bindings = {
  OPENAI_API_KEY: string;
  ADMIN_KEY: string;
  // D1 はオプショナル: バインディング未設定の環境でも API は動作する（永続化のみスキップ）
  DB?: D1Database;
};

// フィードバックの工程ごとの採用・除外詳細（フロントの buildFeedbackDetails と同形）
interface FeedbackDetail {
  finishTriggerId: string;
  finishDisplayName?: string;
  processName: string;
  step?: number;
  confidence?: string;
  isExcluded: boolean;
  excludeReason?: string | null;
}

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for API clients
app.use('/*', cors({
  origin: '*', // We can restrict this to https://omneralab.com if needed
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Admin-Key', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
}));

const STATIC_DICTIONARIES: Record<string, any> = {
  baseboard_setup,
  carpet_layout,
  cross,
  cushion_floor,
  flooring,
  painting,
  plaster_finish,
  tatami_layout,
  tile_finish,
  vinyl_sheet,
};

function isAuthorized(c: { env: Bindings; req: { header: (name: string) => string | undefined } }): boolean {
  const adminKey = c.env.ADMIN_KEY;
  return Boolean(adminKey) && c.req.header('X-Admin-Key') === adminKey;
}

/** D1 に永続化された辞書（管理画面からの登録分）を取得。DB未設定・エラー時は空を返す */
async function loadPersistedDictionaries(db?: D1Database): Promise<Record<string, FinishTrigger>> {
  if (!db) return {};
  try {
    const { results } = await db.prepare('SELECT finish_trigger, data FROM dictionaries').all<{ finish_trigger: string; data: string }>();
    const dicts: Record<string, FinishTrigger> = {};
    for (const row of results || []) {
      try {
        dicts[row.finish_trigger] = JSON.parse(row.data);
      } catch {
        console.error(`[D1] Failed to parse persisted dictionary: ${row.finish_trigger}`);
      }
    }
    return dicts;
  } catch (e) {
    console.error('[D1] Failed to load persisted dictionaries:', e);
    return {};
  }
}

/** 辞書を D1 へ upsert。成功時 true */
async function persistDictionary(db: D1Database, dict: FinishTrigger): Promise<boolean> {
  try {
    await db.prepare(
      `INSERT INTO dictionaries (finish_trigger, display_name, data, updated_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(finish_trigger) DO UPDATE SET
         display_name = excluded.display_name,
         data = excluded.data,
         updated_at = excluded.updated_at`
    ).bind(dict.finish_trigger, dict.display_name, JSON.stringify(dict), new Date().toISOString()).run();
    return true;
  } catch (e) {
    console.error('[D1] Failed to persist dictionary:', e);
    return false;
  }
}

// 1. GET /get-dictionaries (静的辞書 + D1 永続化分をマージ。D1 が優先)
app.get('/get-dictionaries', async (c) => {
  // Ensure each dictionary has a finish_trigger matching its key
  const responseDicts: Record<string, any> = {};
  for (const [key, val] of Object.entries(STATIC_DICTIONARIES)) {
    const trigger = val.finish_trigger || key;
    responseDicts[trigger] = val;
  }

  const persisted = await loadPersistedDictionaries(c.env.DB);
  for (const [trigger, dict] of Object.entries(persisted)) {
    responseDicts[trigger] = dict;
  }

  return c.json({ dictionaries: responseDicts });
});

// 2. POST /extract-knowledge (Protected by X-Admin-Key)
app.post('/extract-knowledge', async (c) => {
  try {
    if (!isAuthorized(c)) {
      return c.json({ error: 'Unauthorized: Invalid admin key' }, 401);
    }

    const body = await c.req.json();
    const { text } = body;

    if (!text || typeof text !== 'string') {
      return c.json({ error: 'Input text is required and must be a string' }, 400);
    }

    const apiKey = c.env.OPENAI_API_KEY;
    const result = await extractAndSaveKnowledge(text, apiKey);

    // 抽出に成功し D1 が利用可能なら、マスタ辞書へそのまま永続化（管理画面の「即時反映」）
    let persisted = false;
    if (result.success && result.data && c.env.DB) {
      const validation = validateFinishTrigger(result.data);
      if (validation.valid) {
        persisted = await persistDictionary(c.env.DB, result.data);
      } else {
        console.error('[extract-knowledge] Extracted data failed validation:', validation.errors);
      }
    }

    return c.json({ ...result, persisted });
  } catch (error: any) {
    console.error('[Worker API extract-knowledge] Error occurred:', error);
    return c.json({ error: error.message || 'Internal Server Error' }, 500);
  }
});

// 3. POST /update-dictionary (Protected by X-Admin-Key)
// 管理画面のプレビュー編集結果や手動作成の辞書JSONを検証のうえ D1 へ upsert する
app.post('/update-dictionary', async (c) => {
  try {
    if (!isAuthorized(c)) {
      return c.json({ error: 'Unauthorized: Invalid admin key' }, 401);
    }

    const db = c.env.DB;
    if (!db) {
      return c.json({ error: 'D1 database is not configured on this Worker (binding "DB" missing)' }, 503);
    }

    const body = await c.req.json();
    const dict = body.dictionary ?? body;

    const validation = validateFinishTrigger(dict);
    if (!validation.valid) {
      return c.json({ error: 'Invalid dictionary schema', details: validation.errors }, 400);
    }

    const ok = await persistDictionary(db, dict as FinishTrigger);
    if (!ok) {
      return c.json({ error: 'Failed to persist dictionary to D1' }, 500);
    }

    return c.json({ success: true, finish_trigger: (dict as FinishTrigger).finish_trigger, persisted: true });
  } catch (error: any) {
    console.error('[Worker API update-dictionary] Error occurred:', error);
    return c.json({ error: error.message || 'Internal Server Error' }, 500);
  }
});

// 4. POST /filter-processes
app.post('/filter-processes', async (c) => {
  try {
    const body = await c.req.json();
    const { processList, contextText } = body;

    if (!processList || !Array.isArray(processList)) {
      return c.json({ error: 'Input processList is required and must be an array' }, 400);
    }

    const apiKey = c.env.OPENAI_API_KEY;
    const decisions = await filterProcessesWithLLM(processList, contextText || '', apiKey);

    return c.json({ decisions });
  } catch (error: any) {
    console.error('[Worker API filter-processes] Error occurred:', error);
    return c.json({ error: error.message || 'Internal Server Error' }, 500);
  }
});

// 5. POST /parse-text
app.post('/parse-text', async (c) => {
  try {
    const body = await c.req.json();
    const { text } = body;

    if (!text || typeof text !== 'string') {
      return c.json({ error: 'Input text is required and must be a string' }, 400);
    }

    const apiKey = c.env.OPENAI_API_KEY;
    const rooms = await parseTextWithLLM(text, apiKey);

    return c.json({ rooms });
  } catch (error: any) {
    console.error('[Worker API parse-text] Error occurred:', error);
    return c.json({ error: error.message || 'Internal Server Error' }, 500);
  }
});

// 6. POST /feedback (D1 永続化。DB未設定時は従来どおり stdout ログのみ)
app.post('/feedback', async (c) => {
  try {
    const body = await c.req.json();
    const { actionType, processList, excludedIndices, contextText, details } = body;

    // フロントから details が来ない旧クライアントには processList + excludedIndices から導出する
    let resolvedDetails: FeedbackDetail[] = Array.isArray(details) ? details : [];
    if (resolvedDetails.length === 0 && Array.isArray(processList)) {
      const excludedSet = new Set<string>(Array.isArray(excludedIndices) ? excludedIndices : []);
      resolvedDetails = processList
        .filter((p: any) => p && p.finishTriggerId && p.process_name)
        .map((p: any) => {
          const id = `${p.roomName}-${p.location}-${p.finishTriggerId}-${p.step}`;
          return {
            finishTriggerId: p.finishTriggerId,
            finishDisplayName: p.finishDisplayName,
            processName: p.process_name,
            step: p.step,
            confidence: p.confidence,
            isExcluded: excludedSet.has(id),
            excludeReason: p.excludeReason || null,
          };
        });
    }

    const timestamp = new Date().toISOString();
    const excludedCount = resolvedDetails.filter(d => d.isExcluded).length;

    const db = c.env.DB;
    let persisted = false;
    if (db) {
      try {
        const eventResult = await db.prepare(
          `INSERT INTO feedback_events (created_at, action_type, context_text, total_steps, excluded_count)
           VALUES (?1, ?2, ?3, ?4, ?5)`
        ).bind(
          timestamp,
          String(actionType || 'unknown'),
          contextText ? String(contextText) : null,
          resolvedDetails.length,
          excludedCount
        ).run();

        const eventId = eventResult.meta.last_row_id;

        if (resolvedDetails.length > 0) {
          const stmt = db.prepare(
            `INSERT INTO feedback_details
               (event_id, finish_trigger, finish_display_name, process_name, step, confidence, is_excluded, exclude_reason)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
          );
          await db.batch(resolvedDetails.map(d => stmt.bind(
            eventId,
            String(d.finishTriggerId),
            d.finishDisplayName ? String(d.finishDisplayName) : null,
            String(d.processName),
            typeof d.step === 'number' ? d.step : null,
            d.confidence ? String(d.confidence) : null,
            d.isExcluded ? 1 : 0,
            d.excludeReason ? String(d.excludeReason) : null
          )));
        }
        persisted = true;
      } catch (dbError) {
        console.error('[Worker API feedback] D1 write failed, falling back to log:', dbError);
      }
    }

    if (!persisted) {
      console.log('[Feedback Log Received]:', JSON.stringify({
        timestamp,
        actionType,
        contextText,
        totalSteps: resolvedDetails.length || processList?.length || 0,
        excludedCount,
      }));
    }

    return c.json({ success: true, persisted, loggedAt: timestamp });
  } catch (error: any) {
    console.error('[Worker API feedback] Error occurred:', error);
    return c.json({ error: error.message || 'Internal Server Error' }, 500);
  }
});

// 7. GET /feedback/summary (Protected by X-Admin-Key)
// 工程ごとの提案回数・除外回数・除外理由を集計し、辞書メンテ箇所の洗い出しに使う
// (scripts/feedback-loop.js のリモート版データソース)
app.get('/feedback/summary', async (c) => {
  try {
    if (!isAuthorized(c)) {
      return c.json({ error: 'Unauthorized: Invalid admin key' }, 401);
    }

    const db = c.env.DB;
    if (!db) {
      return c.json({ error: 'D1 database is not configured on this Worker (binding "DB" missing)' }, 503);
    }

    const { results } = await db.prepare(
      `SELECT
         finish_trigger AS finishTriggerId,
         MAX(finish_display_name) AS finishDisplayName,
         process_name AS processName,
         COUNT(*) AS suggestedCount,
         SUM(is_excluded) AS excludedCount,
         json_group_array(exclude_reason) FILTER (WHERE exclude_reason IS NOT NULL) AS excludeReasons
       FROM feedback_details
       GROUP BY finish_trigger, process_name
       ORDER BY excludedCount DESC, suggestedCount DESC`
    ).all<any>();

    const eventCountRow = await db.prepare('SELECT COUNT(*) AS cnt FROM feedback_events').first<{ cnt: number }>();

    const summary = (results || []).map((row: any) => {
      const suggested = Number(row.suggestedCount) || 0;
      const excluded = Number(row.excludedCount) || 0;
      let reasons: string[] = [];
      try {
        reasons = JSON.parse(row.excludeReasons || '[]');
      } catch { /* keep empty */ }
      return {
        finishTriggerId: row.finishTriggerId,
        finishDisplayName: row.finishDisplayName,
        processName: row.processName,
        suggestedCount: suggested,
        excludedCount: excluded,
        exclusionRate: suggested > 0 ? Number((excluded / suggested).toFixed(3)) : 0,
        excludeReasons: reasons,
      };
    });

    return c.json({
      generatedAt: new Date().toISOString(),
      totalEvents: eventCountRow?.cnt ?? 0,
      summary,
    });
  } catch (error: any) {
    console.error('[Worker API feedback/summary] Error occurred:', error);
    return c.json({ error: error.message || 'Internal Server Error' }, 500);
  }
});

export default app;
