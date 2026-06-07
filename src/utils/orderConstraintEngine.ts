import { ProcessStep } from "../dictionary/types";

export interface OrderWarning {
  roomName: string;
  step: number;
  process_name: string;
  type: "missing_predecessor" | "order_reversed";
  message: string;
}

/**
 * 採択された工程の順序制約を論理検証するエンジン
 * @param roomName 部屋の名前
 * @param activeSteps 採択されている（除外されていない）工程ステップのリスト
 * @param allChainSteps 辞書に定義されているその仕上げのすべての工程ステップ（検証の基礎データ）
 */
export function validateOrderConstraints(
  roomName: string,
  activeSteps: ProcessStep[],
  allChainSteps: ProcessStep[]
): OrderWarning[] {
  const warnings: OrderWarning[] = [];
  const activeStepSet = new Set(activeSteps.map(s => s.step));

  // 1. 各採択工程の constraints (先行工程) が満たされているか検証
  for (const step of activeSteps) {
    if (step.constraints && step.constraints.length > 0) {
      for (const constraint of step.constraints) {
        const predStepNum = constraint.predecessor_step;
        const predStep = allChainSteps.find(s => s.step === predStepNum);
        
        if (predStep) {
          // 先行制約の場合（before / after いずれも先行工程が存在することが必要条件）
          if (!activeStepSet.has(predStepNum)) {
            warnings.push({
              roomName,
              step: step.step,
              process_name: step.process_name,
              type: "missing_predecessor",
              message: `先行工程「${predStep.process_name} (Step ${predStep.step})」が欠落しています。`
            });
          }
        }
      }
    }

    // 2. sequenceIndex (CPM順序連番) を用いた暗黙の先行関係の検証
    if (step.sequenceIndex !== undefined) {
      const mySeq = step.sequenceIndex;
      
      // 自分より小さい sequenceIndex を持つ工程を検索
      const priorSteps = allChainSteps.filter(
        s => s.sequenceIndex !== undefined && s.sequenceIndex < mySeq && s.step !== step.step
      );

      for (const prior of priorSteps) {
        // 先行すべき工程がデフォルト必須（required_by_default: true）であり、
        // かつ現在採択されていない場合は警告を出す
        if (prior.required_by_default && !activeStepSet.has(prior.step)) {
          // ただし、明示的な constraints があってそれが除外を許可している場合は例外とするが、
          // 基本的なCPMチェックとして欠落警告とする
          const alreadyWarned = warnings.some(w => w.step === step.step && w.message.includes(prior.process_name));
          if (!alreadyWarned) {
            warnings.push({
              roomName,
              step: step.step,
              process_name: step.process_name,
              type: "missing_predecessor",
              message: `クリティカルパス上の前工程「${prior.process_name} (Step ${prior.step})」が採択されていません。`
            });
          }
        }
      }
      
      // sequenceIndex の逆転チェック (順序が逆転してアクティブになっていないか)
      // 自分より大きい sequenceIndex を持つアクティブな工程の中で、step番号が自分より小さいものがある場合、
      // 施工順序とステップの定義順に矛盾がある可能性がある
      const activeReverseSteps = activeSteps.filter(
        s => s.sequenceIndex !== undefined && s.sequenceIndex > mySeq && s.step < step.step
      );
      if (activeReverseSteps.length > 0) {
        for (const revStep of activeReverseSteps) {
          const alreadyWarned = warnings.some(w => w.step === step.step && w.type === "order_reversed");
          if (!alreadyWarned) {
            warnings.push({
              roomName,
              step: step.step,
              process_name: step.process_name,
              type: "order_reversed",
              message: `施工順序の逆転警告: 「${revStep.process_name} (Seq ${revStep.sequenceIndex})」が先行していますが、ステップ順序が後方になっています。`
            });
          }
        }
      }
    }
  }

  return warnings;
}
