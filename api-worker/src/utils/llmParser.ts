import { ParsedRoom } from './excelParser';

/**
 * Interface for OpenAI API response format matching Structured Outputs.
 */
interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * Fallback parser when OpenAI API key is missing or fails.
 * Scans the raw text for common finish terms to generate a mock single room.
 */
function parseTextFallback(text: string): ParsedRoom[] {
  const normalized = text.toLowerCase();
  
  // Extract simple finish keywords from the entire text
  let floor = '';
  if (normalized.includes('フローリング') || normalized.includes('木床') || normalized.includes('複合フローリング')) {
    floor = 'フローリング';
  } else if (normalized.includes('クッションフロア') || normalized.includes('cf')) {
    floor = 'クッションフロア';
  } else if (normalized.includes('タイル')) {
    floor = 'タイル貼り';
  }

  let wall = '';
  if (normalized.includes('クロス') || normalized.includes('壁紙') || normalized.includes('ビニルクロス')) {
    wall = 'ビニルクロス';
  } else if (normalized.includes('塗装') || normalized.includes('ep') || normalized.includes('sop')) {
    wall = '塗装仕上げ';
  }

  let ceiling = '';
  if (normalized.includes('クロス') || normalized.includes('壁紙') || normalized.includes('ビニルクロス')) {
    ceiling = 'ビニルクロス';
  } else if (normalized.includes('塗装') || normalized.includes('ep') || normalized.includes('sop')) {
    ceiling = 'EP塗装';
  }

  let baseboard = '';
  if (normalized.includes('巾木') || normalized.includes('はばき')) {
    baseboard = 'ソフト巾木';
  }

  // Attempt to guess room name or default to '指定テキスト室'
  let roomName = '指定テキスト室';
  const roomNameMatch = text.match(/(玄関|ホール|リビング|ldk|和室|洋室|洗面|脱衣|トイレ|浴室|廊下)/i);
  if (roomNameMatch) {
    roomName = roomNameMatch[0];
  }

  return [{
    roomName,
    floor,
    baseboard,
    wall,
    ceiling,
    remarks: '【静的フォールバック抽出】' + text.substring(0, 100)
  }];
}

/**
 * Parses free text finishing specification using OpenAI Chat Completions API (Structured Outputs).
 * Safely falls back to local static regex matching if API key is not present or API call fails.
 */
export async function parseTextWithLLM(text: string, apiKey?: string): Promise<ParsedRoom[]> {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const effectiveApiKey = apiKey || process.env.OPENAI_API_KEY;

  if (!effectiveApiKey) {
    console.warn('[LLM Parser] OpenAI API key is missing. Using static parser fallback.');
    return parseTextFallback(text);
  }

  const jsonSchema = {
    name: "parsed_finishing_schedule",
    strict: true,
    schema: {
      type: "object",
      properties: {
        rooms: {
          type: "array",
          items: {
            type: "object",
            properties: {
              roomName: { type: "string", description: "Name of the room, e.g. リビング, 和室, 玄関" },
              floor: { type: "string", description: "Floor finishing specification, e.g. 複合フローリング, クッションフロア" },
              baseboard: { type: "string", description: "Baseboard finishing specification, e.g. 木製巾木 H=60, ソフト巾木" },
              wall: { type: "string", description: "Wall finishing specification, e.g. ビニルクロス貼り, EP塗装" },
              ceiling: { type: "string", description: "Ceiling finishing specification, e.g. ビニルクロス貼り, SOP塗装" },
              remarks: { type: "string", description: "Special notes or remarks related to finishes in this room" }
            },
            required: ["roomName", "floor", "baseboard", "wall", "ceiling", "remarks"],
            additionalProperties: false
          }
        }
      },
      required: ["rooms"],
      additionalProperties: false
    }
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${effectiveApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Lightweight, fast, and structured-output capable
        messages: [
          {
            role: 'system',
            content: 'あなたは建築の積算・見積の専門家です。提示されたテキスト（特記仕様書、指示書、または部屋仕上げの記述）から、部屋ごとの仕上げ仕様（床、巾木、壁、天井、特記・備考）を抽出し、正確なJSONオブジェクトとして整理してください。テキストに明示的な指定がない部位は、空文字（""）にしてください。'
          },
          {
            role: 'user',
            content: text
          }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: jsonSchema
        },
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as OpenAIResponse;
    const contentText = result.choices[0]?.message?.content;

    if (!contentText) {
      throw new Error('Empty message content received from OpenAI API');
    }

    const parsedData = JSON.parse(contentText);
    if (parsedData && Array.isArray(parsedData.rooms)) {
      return parsedData.rooms;
    }

    throw new Error('Invalid JSON format returned from LLM');
  } catch (error) {
    console.error('[LLM Parser] OpenAI API call failed. Falling back to static parser.', error);
    return parseTextFallback(text);
  }
}
