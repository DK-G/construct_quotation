import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { extractAndSaveKnowledge } from './utils/extractKnowledge';
import { filterProcessesWithLLM } from './utils/llmFilter';
import { parseTextWithLLM } from './utils/llmParser';

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
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for API clients
app.use('/*', cors({
  origin: '*', // We can restrict this to https://omneralab.com if needed
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'X-Admin-Key', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
}));

// 1. GET /get-dictionaries
app.get('/get-dictionaries', (c) => {
  const dictionaries: Record<string, any> = {
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

  // Ensure each dictionary has a finish_trigger matching its key
  const responseDicts: Record<string, any> = {};
  for (const [key, val] of Object.entries(dictionaries)) {
    const trigger = val.finish_trigger || key;
    responseDicts[trigger] = val;
  }

  return c.json({ dictionaries: responseDicts });
});

// 2. POST /extract-knowledge (Protected by X-Admin-Key)
app.post('/extract-knowledge', async (c) => {
  try {
    const adminKey = c.env.ADMIN_KEY;
    const requestKey = c.req.header('X-Admin-Key');

    // Simple Admin key verification
    if (!adminKey || requestKey !== adminKey) {
      return c.json({ error: 'Unauthorized: Invalid admin key' }, 401);
    }

    const body = await c.req.json();
    const { text } = body;

    if (!text || typeof text !== 'string') {
      return c.json({ error: 'Input text is required and must be a string' }, 400);
    }

    const apiKey = c.env.OPENAI_API_KEY;
    const result = await extractAndSaveKnowledge(text, apiKey);

    return c.json(result);
  } catch (error: any) {
    console.error('[Worker API extract-knowledge] Error occurred:', error);
    return c.json({ error: error.message || 'Internal Server Error' }, 500);
  }
});

// 3. POST /filter-processes
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

// 4. POST /parse-text
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

// 5. POST /feedback (Stateless logging)
app.post('/feedback', async (c) => {
  try {
    const body = await c.req.json();
    const { actionType, processList, excludedIndices, contextText } = body;

    console.log('[Feedback Log Received]:', JSON.stringify({
      timestamp: new Date().toISOString(),
      actionType,
      contextText,
      totalSteps: processList?.length || 0,
      excludedCount: excludedIndices?.length || 0,
    }));

    // In a stateless edge environment, we simply log it to stdout
    return c.json({ success: true, loggedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error('[Worker API feedback] Error occurred:', error);
    return c.json({ error: error.message || 'Internal Server Error' }, 500);
  }
});

export default app;
