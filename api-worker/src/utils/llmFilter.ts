import { ProcessStep } from '../dictionary/types';

// フロント側 src/utils/matcher.ts の GeneratedProcessItem と同形
// （Worker は静的エクスポートのフロントとコードベースが分離しているためローカル定義）
export interface GeneratedProcessItem extends ProcessStep {
  finishTriggerId: string;
  finishDisplayName: string;
  roomName: string;
  location: string;
  excludeReason?: string;
}

export interface FilterDecision {
  stepId: string;
  shouldExclude: boolean;
  reason: string;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * Fallback filter decision when OpenAI API key is missing or fails.
 * Simply passes all steps through without excluding any.
 */
function filterFallback(processList: GeneratedProcessItem[]): FilterDecision[] {
  return processList.map(item => {
    const stepId = `${item.roomName}-${item.location}-${item.finishTriggerId}-${item.step}`;
    return {
      stepId,
      shouldExclude: false,
      reason: ''
    };
  });
}

/**
 * Filter generated processes based on room text context using OpenAI Chat Completions (Structured Outputs).
 * Recommends exclusion of steps and provides architectural reasons (e.g. "別途工事のため除外", "木造のためRC処理不要").
 */
export async function filterProcessesWithLLM(
  processList: GeneratedProcessItem[],
  contextText: string,
  apiKey?: string
): Promise<FilterDecision[]> {
  if (!processList || processList.length === 0) {
    return [];
  }

  const effectiveApiKey = apiKey || (globalThis as any).process?.env?.OPENAI_API_KEY;

  if (!effectiveApiKey || !contextText || contextText.trim().length === 0) {
    return filterFallback(processList);
  }

  // Map process list to simplified objects for prompt optimization
  const simplifiedSteps = processList.map(item => {
    const stepId = `${item.roomName}-${item.location}-${item.finishTriggerId}-${item.step}`;
    return {
      stepId,
      roomName: item.roomName,
      location: item.location,
      finishName: item.finishDisplayName,
      stepNumber: item.step,
      processName: item.process_name,
      conditions: item.conditions || '無し'
    };
  });

  const jsonSchema = {
    name: "filter_processes_result",
    strict: true,
    schema: {
      type: "object",
      properties: {
        decisions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              stepId: { type: "string", description: "The stepId matching the input" },
              shouldExclude: { type: "boolean", description: "True if this step is redundant or excluded based on specifications" },
              reason: { type: "string", description: "Short architectural reason for exclusion, or empty if adopted" }
            },
            required: ["stepId", "shouldExclude", "reason"],
            additionalProperties: false
          }
        }
      },
      required: ["decisions"],
      additionalProperties: false
    }
  };

  const promptUserContent = `
【全体コンテキスト（特記・備考・仕様指示）】
"${contextText}"

【展開された工程・見積項目リスト】
${JSON.stringify(simplifiedSteps, null, 2)}

上記【全体コンテキスト】の指示に基づいて、不要、または範囲外（別途工事等）となる【展開された工程・見積項目リスト】の項目を判定してください。
特に、コンテキスト内に「下地は別途」「下地処理は含まない」「木造のためRC処理不要」などの除外を示す記載がある場合、該当する部位（床・壁・天井・巾木）のパテ処理、シーラー処理、不陸調整などの前工程を "shouldExclude": true と判定し、その明確な理由を "reason" に記述してください。
除外しない項目については "shouldExclude": false, "reason": "" としてください。
`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${effectiveApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'あなたは建築の積算・見積チェックの専門家です。提示された特記仕様テキストと自動展開された工程リストを照合し、契約範囲外や除外指示のある前工程（例: 下地処理は別途、等）を論理的に除外判定します。'
          },
          {
            role: 'user',
            content: promptUserContent
          }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: jsonSchema
        },
        temperature: 0.0
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
    if (parsedData && Array.isArray(parsedData.decisions)) {
      return parsedData.decisions;
    }

    throw new Error('Invalid JSON format returned from filter LLM');
  } catch (error) {
    console.error('[LLM Filter] OpenAI API filter call failed. Using fallback.', error);
    return filterFallback(processList);
  }
}
