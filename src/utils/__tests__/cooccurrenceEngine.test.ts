import { checkCooccurrence } from '../cooccurrenceEngine';
import { GeneratedProcessItem } from '../matcher';

const mockProcessList: GeneratedProcessItem[] = [
  {
    step: 1,
    process_name: '下地清掃・点検（不陸調整）',
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
    process_name: '床用接着剤（ウレタン系等）塗布',
    sources: [],
    required_by_default: true,
    confidence: 'standard',
    conditions: null,
    finishTriggerId: 'wood_flooring',
    finishDisplayName: 'フローリング',
    roomName: 'リビング',
    location: '床'
  }
];

describe('cooccurrenceEngine', () => {
  it('should return no alerts for empty inputs', () => {
    expect(checkCooccurrence([], new Set())).toEqual([]);
  });

  it('should return no alerts when all required steps are present and active', () => {
    const alerts = checkCooccurrence(mockProcessList, new Set());
    expect(alerts.length).toBe(0);
  });

  it('should generate an alert when a required step is excluded', () => {
    // Exclude step 1 (下地清掃)
    const excluded = new Set(['リビング-床-wood_flooring-1']);
    const alerts = checkCooccurrence(mockProcessList, excluded);

    expect(alerts.length).toBe(1);
    expect(alerts[0].ruleId).toBe('RULE-CF-001');
    expect(alerts[0].roomName).toBe('リビング');
    expect(alerts[0].location).toBe('床');
    expect(alerts[0].requiredProcessName).toBe('下地清掃・点検（不陸調整）');
    expect(alerts[0].alertMessage).toContain('フローリング仕上げが指定されていますが');
  });

  it('should generate multiple alerts when multiple required steps are excluded', () => {
    // Exclude both steps
    const excluded = new Set([
      'リビング-床-wood_flooring-1',
      'リビング-床-wood_flooring-2'
    ]);
    const alerts = checkCooccurrence(mockProcessList, excluded);

    expect(alerts.length).toBe(2);
    expect(alerts.map(a => a.ruleId)).toContain('RULE-CF-001');
    expect(alerts.map(a => a.ruleId)).toContain('RULE-CF-002');
  });
});
