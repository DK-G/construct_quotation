import { FinishTrigger, ConfidenceLevel } from '../dictionary/types';

const CONFIDENCE_LEVELS: ConfidenceLevel[] = ['standard', 'conditional', 'to_confirm', 'low'];
const SOURCE_TYPES = ['standard_spec', 'jass', 'practical_knowledge'];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * /update-dictionary で受け取った辞書JSONが FinishTrigger スキーマを満たすか検証する。
 * D1 へ永続化する前の必須チェック（不正データでマスタを壊さないため）。
 */
export function validateFinishTrigger(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['dictionary はオブジェクトである必要があります'] };
  }

  const dict = input as Partial<FinishTrigger>;

  if (!dict.finish_trigger || typeof dict.finish_trigger !== 'string') {
    errors.push('finish_trigger は必須の文字列です');
  } else if (!/^[a-z0-9_]+$/i.test(dict.finish_trigger)) {
    errors.push('finish_trigger は英数字とアンダースコアのみ使用できます');
  }

  if (!dict.display_name || typeof dict.display_name !== 'string') {
    errors.push('display_name は必須の文字列です');
  }

  if (!Array.isArray(dict.process_chain) || dict.process_chain.length === 0) {
    errors.push('process_chain は1件以上の配列である必要があります');
  } else {
    dict.process_chain.forEach((step, i) => {
      const label = `process_chain[${i}]`;
      if (!step || typeof step !== 'object') {
        errors.push(`${label} はオブジェクトである必要があります`);
        return;
      }
      if (typeof step.step !== 'number') {
        errors.push(`${label}.step は数値が必要です`);
      }
      if (!step.process_name || typeof step.process_name !== 'string') {
        errors.push(`${label}.process_name は必須の文字列です`);
      }
      if (typeof step.required_by_default !== 'boolean') {
        errors.push(`${label}.required_by_default は真偽値が必要です`);
      }
      if (!CONFIDENCE_LEVELS.includes(step.confidence as ConfidenceLevel)) {
        errors.push(`${label}.confidence は ${CONFIDENCE_LEVELS.join('/')} のいずれかが必要です`);
      }
      if (!Array.isArray(step.sources)) {
        errors.push(`${label}.sources は配列が必要です`);
      } else {
        step.sources.forEach((src, j) => {
          if (!src || typeof src !== 'object' || !SOURCE_TYPES.includes(src.type)) {
            errors.push(`${label}.sources[${j}].type は ${SOURCE_TYPES.join('/')} のいずれかが必要です`);
          }
        });
      }
    });
  }

  return { valid: errors.length === 0, errors };
}
