import { extractAndSaveKnowledge } from '../extractKnowledge';
import fs from 'fs/promises';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined)
}));

describe('extractKnowledge - オンラインナレッジ自動抽出＆即時反映テスト', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('APIキーがない場合、フォールバックデータが返り、かつファイル保存がトリガーされること', async () => {
    const text = "クッションフロア貼り (CFシート) 19章6節に基づき施工。下地清掃をしてから接着剤を塗布する。";
    
    // APIキーなし (undefined) で実行
    const result = await extractAndSaveKnowledge(text, undefined);
    
    expect(result.success).toBe(true);
    expect(result.data.finish_trigger).toBe("cushion_floor");
    expect(result.data.display_name).toBe("クッションフロア貼り");
    expect(result.data.process_chain.length).toBeGreaterThan(0);
    
    // CPM順序 (sequenceIndex) を持っているか
    expect(result.data.process_chain[0].sequenceIndex).toBeDefined();
    expect(result.data.process_chain[1].sequenceIndex).toBeDefined();
    
    // ファイルシステム保存の呼び出し検証
    expect(fs.mkdir).toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('cushion_floor.json'),
      expect.any(String),
      'utf-8'
    );
  });

  test('OpenAI APIが成功したと想定したモックテスト', async () => {
    const text = "11章3節 タイル貼り。下地を清掃した後、張付けモルタルを塗布し、タイルを張り付け、養生する。";
    
    // global.fetch のモック化
    const mockResponse = {
      finish_trigger: "tile_finish",
      display_name: "タイル貼り",
      common_spec_ref: "11章 3節",
      jass_ref: "JASS 19",
      process_chain: [
        {
          step: 1,
          process_name: "タイル下地清掃",
          sources: [{ type: "standard_spec", doc_id: "11章 3節" }],
          required_by_default: true,
          confidence: "standard",
          conditions: "常に必要",
          sequenceIndex: 1
        },
        {
          step: 2,
          process_name: "張付けモルタル塗布",
          sources: [{ type: "standard_spec", doc_id: "11章 3節" }],
          required_by_default: true,
          confidence: "standard",
          conditions: "常に必要",
          sequenceIndex: 2,
          constraints: [{ predecessor_step: 1, type: "after" }]
        },
        {
          step: 3,
          process_name: "タイル貼り・目地詰め",
          sources: [{ type: "standard_spec", doc_id: "11章 3節" }],
          required_by_default: true,
          confidence: "standard",
          conditions: "常に必要",
          sequenceIndex: 3,
          constraints: [{ predecessor_step: 2, type: "after" }]
        }
      ]
    };

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify(mockResponse)
            }
          }
        ]
      })
    });
    
    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    try {
      const result = await extractAndSaveKnowledge(text, "mock-api-key");
      
      expect(result.success).toBe(true);
      expect(result.data.finish_trigger).toBe("tile_finish");
      expect(result.data.process_chain[1].process_name).toBe("張付けモルタル塗布");
      
      // sequenceIndex (CPM) の検証
      expect(result.data.process_chain[1].sequenceIndex).toBe(2);
      expect(result.data.process_chain[2].constraints?.[0].predecessor_step).toBe(2);
      
      // ファイルシステム保存の呼び出し検証
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('tile_finish.json'),
        expect.any(String),
        'utf-8'
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});
