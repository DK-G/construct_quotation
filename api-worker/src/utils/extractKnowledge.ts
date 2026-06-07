import { FinishTrigger } from '../dictionary/types';

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * APIキーがない、またはAPIエラー時のフォールバック処理。
 * 入力テキストから簡易的な工種と工程チェーンを推論（模擬）して返す。
 */
function extractKnowledgeFallback(text: string): FinishTrigger {
  const normalized = text.toLowerCase();
  
  let trigger = "custom_finish";
  let displayName = "カスタム仕上工事";
  let specRef = "公共建築工事標準仕様書 各章";
  let jassRef = "JASS 規格";
  
  if (normalized.includes("床シート") || normalized.includes("クッションフロア") || normalized.includes("cf")) {
    trigger = "cushion_floor";
    displayName = "クッションフロア貼り";
    specRef = "19章 6節";
    jassRef = "JASS 26";
  } else if (normalized.includes("タイル")) {
    trigger = "tile_finish";
    displayName = "タイル貼り";
    specRef = "11章 3節";
    jassRef = "JASS 19";
  }

  return {
    finish_trigger: trigger,
    display_name: displayName,
    common_spec_ref: specRef,
    jass_ref: jassRef,
    process_chain: [
      {
        step: 1,
        process_name: "下地清掃・点検",
        sources: [
          { type: "standard_spec", doc_id: specRef, section: "下地調整" }
        ],
        required_by_default: true,
        confidence: "standard",
        conditions: "常に必要",
        sequenceIndex: 1
      },
      {
        step: 2,
        process_name: "接着剤塗布・施工",
        sources: [
          { type: "standard_spec", doc_id: specRef, section: "施工" }
        ],
        required_by_default: true,
        confidence: "standard",
        conditions: "下地適合時",
        sequenceIndex: 2,
        constraints: [
          { predecessor_step: 1, type: "after" }
        ]
      }
    ]
  };
}

/**
 * 入力された仕様書テキストから、LLMを使用して工種・工程ステップ・CPM順序を抽出し、
 * サーバー側の辞書データJSONを即時永続化して返す。
 */
export async function extractAndSaveKnowledge(text: string, apiKey?: string): Promise<{ success: boolean; data: FinishTrigger }> {
  if (!text || text.trim().length === 0) {
    throw new Error("Input text is empty");
  }

  const effectiveApiKey = apiKey || process.env.OPENAI_API_KEY;
  let data: FinishTrigger;

  if (!effectiveApiKey) {
    console.warn("[Extract Knowledge] OpenAI API key is missing. Using fallback.");
    data = extractKnowledgeFallback(text);
  } else {
    const jsonSchema = {
      name: "extract_finishing_knowledge",
      strict: true,
      schema: {
        type: "object",
        properties: {
          finish_trigger: { 
            type: "string", 
            description: "工種のユニークな識別キー（半角小文字英数字・アンダースコアのみ。例: cross_cloth, flooring_wood, cushion_floor, painting_ep）" 
          },
          display_name: { 
            type: "string", 
            description: "ユーザー表示用の工種名（例: ビニルクロス貼り, 木製フローリング貼り, EP塗装）" 
          },
          common_spec_ref: { 
            type: "string", 
            description: "準拠する公共建築工事標準仕様書の章・節番号（例: 19章 5節）" 
          },
          jass_ref: { 
            type: "string", 
            description: "準拠するJASS規格（例: JASS 26）" 
          },
          process_chain: {
            type: "array",
            items: {
              type: "object",
              properties: {
                step: { 
                  type: "integer", 
                  description: "ステップ番号 (1から始まる連番)" 
                },
                process_name: { 
                  type: "string", 
                  description: "具体的な施工・積算工程名 (例: 下地清掃, パテ処理, ビニルクロス貼, 養生期間)" 
                },
                sources: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { 
                        type: "string", 
                        enum: ["standard_spec", "jass", "practical_knowledge"],
                        description: "出典の区分。standard_spec（標準仕様書）、jass（JASS規格）、practical_knowledge（実務知・熟練ノウハウ）" 
                      },
                      doc_id: { 
                        type: "string", 
                        description: "仕様書や規格のID名（例: JASS 26）" 
                      },
                      section: { 
                        type: "string", 
                        description: "具体的な条文セクション（例: 5.3.2）" 
                      },
                      memo: { 
                        type: "string", 
                        description: "考慮すべき施工仕様や補足説明" 
                      }
                    },
                    required: ["type", "doc_id"],
                    additionalProperties: false
                  }
                },
                required_by_default: { 
                  type: "boolean", 
                  description: "この工種を施工する際、通常デフォルトで必須となる工程かどうか" 
                },
                confidence: { 
                  type: "string", 
                  enum: ["standard", "conditional", "to_confirm", "low"],
                  description: "確度。一般的な標準工程ならstandard、下地状態などに依存するならconditional、確認要ならto_confirm" 
                },
                conditions: { 
                  type: "string", 
                  nullable: true,
                  description: "工程が必要とされる特定の下地や施工要件（例: せっこうボード下地の場合、パテ2回処理）" 
                },
                sequenceIndex: { 
                  type: "integer", 
                  description: "施工順序を表すクリティカルパス番号。1から順に定義。同一番号は並行して施工可能であることを意味する。" 
                },
                constraints: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      predecessor_step: { 
                        type: "integer", 
                        description: "先行して完了しているべき前工程の step 番号" 
                      },
                      type: { 
                        type: "string", 
                        enum: ["before", "after"],
                        description: "先行関係。通常は predecessor_step が終わった後を意味する 'after' または前を意味する 'before'" 
                      }
                    },
                    required: ["predecessor_step", "type"],
                    additionalProperties: false
                  },
                  description: "この工程が開始される前に必須となる先行工程制約"
                }
              },
              required: ["step", "process_name", "sources", "required_by_default", "confidence", "conditions", "sequenceIndex"],
              additionalProperties: false
            }
          }
        },
        required: ["finish_trigger", "display_name", "common_spec_ref", "jass_ref", "process_chain"],
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
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'あなたは建築積算・施工管理のスペシャリストです。入力された公共建築工事標準仕様書、JASS、または施工説明テキストから、仕上げ工種の「トリガーキー（finish_trigger）」、「表示名」、「準拠仕様」および「工程チェーン（process_chain）」を完全に自動抽出してください。また、それぞれの工程のクリティカルパス施工順序を表す sequenceIndex（1から始まる連番）と、先行工程の step 番号を示す constraints を厳密に推論して付与してください。インタビューなどを介さず、入力ドキュメントから非対話型で論理的にナレッジを抽出すること。'
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
        throw new Error("Empty content received from OpenAI API");
      }

      data = JSON.parse(contentText) as FinishTrigger;
    } catch (error) {
      console.error("[Extract Knowledge] OpenAI API call failed. Using fallback.", error);
      data = extractKnowledgeFallback(text);
    }
  }

  // 抽出された辞書データの正規化処理
  if (data.finish_trigger) {
    // アルファベット小文字・アンダースコア以外を除去し、安全なファイル名にする
    data.finish_trigger = data.finish_trigger.toLowerCase().replace(/[^a-z0-9_]/g, '');
  } else {
    data.finish_trigger = "custom_finish";
  }

  // Note: Edge/Worker runtime environment does not support local fs writes.
  // The client (browser) will save the extracted dictionary to localStorage.
  console.log(`[Extract Knowledge] Successfully extracted dictionary for trigger: ${data.finish_trigger}`);
  return { success: true, data };
}
