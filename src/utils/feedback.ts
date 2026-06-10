import { GeneratedProcessItem } from './matcher';

/**
 * フィードバックAPIへ送る、工程ごとの採用・除外詳細。
 * Worker 側で D1 (feedback_details) に永続化され、辞書メンテの還流データとなる。
 */
export interface FeedbackDetail {
  finishTriggerId: string;
  finishDisplayName: string;
  processName: string;
  step: number;
  confidence: string;
  isExcluded: boolean;
  excludeReason: string | null;
}

/** UI 上の工程行を一意に識別するID（除外チェックの管理キーと同一規則） */
export function getProcessItemId(item: GeneratedProcessItem): string {
  return `${item.roomName}-${item.location}-${item.finishTriggerId}-${item.step}`;
}

/**
 * 生成された工程リストと除外IDセットから、フィードバック詳細の配列を構築する。
 */
export function buildFeedbackDetails(
  processList: GeneratedProcessItem[],
  excludedIds: Set<string>
): FeedbackDetail[] {
  return processList.map(item => ({
    finishTriggerId: item.finishTriggerId,
    finishDisplayName: item.finishDisplayName,
    processName: item.process_name,
    step: item.step,
    confidence: item.confidence,
    isExcluded: excludedIds.has(getProcessItemId(item)),
    excludeReason: item.excludeReason || null,
  }));
}
