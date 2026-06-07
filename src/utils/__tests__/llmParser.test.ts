import { parseTextWithLLM } from '../llmParser';

describe('llmParser', () => {
  let originalFetch: typeof global.fetch;
  let originalApiKey: string | undefined;

  beforeAll(() => {
    originalFetch = global.fetch;
    originalApiKey = process.env.OPENAI_API_KEY;
  });

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey !== undefined) {
      process.env.OPENAI_API_KEY = originalApiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    jest.restoreAllMocks();
  });

  it('should return empty list for empty or whitespace-only input', async () => {
    const res1 = await parseTextWithLLM('');
    expect(res1).toEqual([]);

    const res2 = await parseTextWithLLM('   ');
    expect(res2).toEqual([]);
  });

  it('should fallback to regex parsing when API key is missing', async () => {
    // API key is explicitly undefined/not provided
    const text = 'リビングはフローリング、壁はクロス、天井もクロス仕上げとする。和室は畳。';
    const result = await parseTextWithLLM(text, undefined);

    expect(result.length).toBe(1);
    expect(result[0].roomName).toBe('リビング'); // Matches リビング
    expect(result[0].floor).toBe('フローリング');
    expect(result[0].wall).toBe('ビニルクロス');
    expect(result[0].ceiling).toBe('ビニルクロス');
    expect(result[0].remarks).toContain('【静的フォールバック抽出】');
  });

  it('should parse structured data using OpenAI API when key is provided', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              rooms: [
                {
                  roomName: 'リビング',
                  floor: 'オーク無垢フローリング',
                  baseboard: '木製巾木',
                  wall: 'ビニルクロス',
                  ceiling: 'EP塗装',
                  remarks: '下地調整要'
                }
              ]
            })
          }
        }
      ]
    };

    // Mock fetch for OpenAI call
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })
    ) as any;

    const result = await parseTextWithLLM('some text specification', 'mock-api-key');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.length).toBe(1);
    expect(result[0].roomName).toBe('リビング');
    expect(result[0].floor).toBe('オーク無垢フローリング');
    expect(result[0].wall).toBe('ビニルクロス');
    expect(result[0].ceiling).toBe('EP塗装');
    expect(result[0].remarks).toBe('下地調整要');
  });

  it('should fallback to regex parsing when OpenAI API returns an error', async () => {
    // Mock fetch to simulate API failure
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error')
      })
    ) as any;

    // Trigger parser
    const text = '和室は畳、壁はクロス。';
    const result = await parseTextWithLLM(text, 'mock-api-key');

    // Should not throw, should log warning and return fallback values
    expect(result.length).toBe(1);
    expect(result[0].roomName).toBe('和室'); // Matches 和室
    expect(result[0].remarks).toContain('【静的フォールバック抽出】');
  });
});
