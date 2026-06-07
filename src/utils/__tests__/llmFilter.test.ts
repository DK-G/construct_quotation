import { filterProcessesWithLLM } from '../llmFilter';
import { GeneratedProcessItem } from '../matcher';

const mockProcessList: GeneratedProcessItem[] = [
  {
    step: 1,
    process_name: '下地清掃',
    sources: [],
    required_by_default: true,
    confidence: 'standard',
    conditions: null,
    finishTriggerId: 'wood_flooring',
    finishDisplayName: 'フローリング',
    roomName: 'リビング',
    location: '床'
  },
  {
    step: 2,
    process_name: '床下地合板調整',
    sources: [],
    required_by_default: false,
    confidence: 'conditional',
    conditions: '合板下地の場合',
    finishTriggerId: 'wood_flooring',
    finishDisplayName: 'フローリング',
    roomName: 'リビング',
    location: '床'
  }
];

describe('llmFilter', () => {
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

  it('should return empty list for empty processList input', async () => {
    const res = await filterProcessesWithLLM([], 'context text');
    expect(res).toEqual([]);
  });

  it('should fallback to pass-through when API key is missing', async () => {
    const decisions = await filterProcessesWithLLM(mockProcessList, '下地は別途', undefined);

    expect(decisions.length).toBe(2);
    expect(decisions[0].shouldExclude).toBe(false);
    expect(decisions[1].shouldExclude).toBe(false);
  });

  it('should filter processes using OpenAI API when key and context are provided', async () => {
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              decisions: [
                {
                  stepId: 'リビング-床-wood_flooring-1',
                  shouldExclude: false,
                  reason: ''
                },
                {
                  stepId: 'リビング-床-wood_flooring-2',
                  shouldExclude: true,
                  reason: '下地合板の調整は別途工事の指示があるため'
                }
              ]
            })
          }
        }
      ]
    };

    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })
    ) as any;

    const decisions = await filterProcessesWithLLM(
      mockProcessList,
      '床下地の合板調整は別途とする。',
      'mock-api-key'
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(decisions.length).toBe(2);
    expect(decisions[0].stepId).toBe('リビング-床-wood_flooring-1');
    expect(decisions[0].shouldExclude).toBe(false);
    expect(decisions[1].stepId).toBe('リビング-床-wood_flooring-2');
    expect(decisions[1].shouldExclude).toBe(true);
    expect(decisions[1].reason).toBe('下地合板の調整は別途工事の指示があるため');
  });

  it('should fallback to pass-through when OpenAI API returns an error', async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error')
      })
    ) as any;

    const decisions = await filterProcessesWithLLM(
      mockProcessList,
      '下地は別途',
      'mock-api-key'
    );

    expect(decisions.length).toBe(2);
    expect(decisions[0].shouldExclude).toBe(false);
    expect(decisions[1].shouldExclude).toBe(false);
  });
});
