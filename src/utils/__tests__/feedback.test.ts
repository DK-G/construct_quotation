import { buildFeedbackDetails, getProcessItemId } from '../feedback';
import { GeneratedProcessItem } from '../matcher';

const makeItem = (overrides: Partial<GeneratedProcessItem> = {}): GeneratedProcessItem => ({
  step: 1,
  process_name: '素地調整・ボード確認',
  sources: [{ type: 'standard_spec', doc_id: '標準仕様書 19章', section: '19.2' }],
  required_by_default: true,
  confidence: 'standard',
  conditions: null,
  finishTriggerId: 'cross_cloth',
  finishDisplayName: 'ビニルクロス貼り',
  roomName: 'LDK',
  location: '壁',
  ...overrides,
});

describe('getProcessItemId', () => {
  it('部屋名・部位・工種ID・工程番号からUIと同一規則のIDを生成する', () => {
    expect(getProcessItemId(makeItem())).toBe('LDK-壁-cross_cloth-1');
  });
});

describe('buildFeedbackDetails', () => {
  it('除外IDセットに含まれる工程を isExcluded として変換する', () => {
    const items = [
      makeItem({ step: 1 }),
      makeItem({ step: 2, process_name: 'ジョイント処理', excludeReason: '特記により不要' }),
    ];
    const excluded = new Set<string>(['LDK-壁-cross_cloth-2']);

    const details = buildFeedbackDetails(items, excluded);

    expect(details).toHaveLength(2);
    expect(details[0]).toMatchObject({
      finishTriggerId: 'cross_cloth',
      finishDisplayName: 'ビニルクロス貼り',
      processName: '素地調整・ボード確認',
      step: 1,
      confidence: 'standard',
      isExcluded: false,
      excludeReason: null,
    });
    expect(details[1]).toMatchObject({
      processName: 'ジョイント処理',
      isExcluded: true,
      excludeReason: '特記により不要',
    });
  });

  it('空の工程リストでは空配列を返す', () => {
    expect(buildFeedbackDetails([], new Set())).toEqual([]);
  });
});
