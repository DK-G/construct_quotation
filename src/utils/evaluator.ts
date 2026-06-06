import { FinishTrigger, ProcessStep } from "../dictionary/types";

export interface TestCase {
  id: string;
  inputTrigger: string;
  expectedProcesses: string[]; // List of expected process_name
  actualProcesses: string[];   // List of processes returned by our model/algorithm
}

export interface EvalMetrics {
  recall: number;
  precision: number;
  tp: number; // True Positives
  fn: number; // False Negatives
  fp: number; // False Positives
}

/**
 * Calculates Recall and Precision for a single test case.
 * Recall = TP / (TP + FN)
 * Precision = TP / (TP + FP)
 */
export function calculateMetrics(expected: string[], actual: string[]): EvalMetrics {
  const expectedSet = new Set(expected.map(s => s.trim().toLowerCase()));
  const actualSet = new Set(actual.map(s => s.trim().toLowerCase()));

  let tp = 0;
  let fp = 0;
  let fn = 0;

  // Count True Positives and False Negatives
  expectedSet.forEach(item => {
    if (actualSet.has(item)) {
      tp++;
    } else {
      fn++;
    }
  });

  // Count False Positives
  actualSet.forEach(item => {
    if (!expectedSet.has(item)) {
      fp++;
    }
  });

  const recall = tp + fn > 0 ? tp / (tp + fn) : 1.0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1.0;

  return {
    recall,
    precision,
    tp,
    fn,
    fp
  };
}

/**
 * Aggregates metrics over multiple test cases.
 */
export function calculateAverageMetrics(testCases: TestCase[]): EvalMetrics {
  let totalTp = 0;
  let totalFn = 0;
  let totalFp = 0;

  testCases.forEach(tc => {
    const metrics = calculateMetrics(tc.expectedProcesses, tc.actualProcesses);
    totalTp += metrics.tp;
    totalFn += metrics.fn;
    totalFp += metrics.fp;
  });

  const recall = totalTp + totalFn > 0 ? totalTp / (totalTp + totalFn) : 1.0;
  const precision = totalTp + totalFp > 0 ? totalTp / (totalTp + totalFp) : 1.0;

  return {
    recall,
    precision,
    tp: totalTp,
    fn: totalFn,
    fp: totalFp
  };
}
