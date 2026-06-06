import * as fs from 'fs';
import * as path from 'path';
import { calculateMetrics, TestCase } from './evaluator';
import { FinishTrigger } from '../dictionary/types';

// Load ground truth
const crossJsonPath = path.join(__dirname, '../dictionary/data/cross.json');
const crossData: FinishTrigger = JSON.parse(fs.readFileSync(crossJsonPath, 'utf-8'));

// The ground truth: all process names in the chain
const groundTruthList = crossData.process_chain.map(p => p.process_name);

console.log("=== Ground Truth Processes (Cross) ===");
groundTruthList.forEach((p, i) => console.log(`${i + 1}. ${p}`));
console.log("======================================");

// Define test cases
const testCases: TestCase[] = [
  {
    id: "TC-001 (Perfect match)",
    inputTrigger: "cross_cloth",
    expectedProcesses: groundTruthList,
    actualProcesses: [
      "素地調整・ボード確認",
      "ジョイント処理（目地補強テープ貼り）",
      "下塗りパテ処理（目地・ビス頭・面調整）",
      "上塗りパテ処理・平滑研磨",
      "シーラー（プライマー）塗布",
      "接着剤塗布・クロス貼り",
      "コーナー部・ジョイント部ボンドコーク（ジョイントコーク）充填",
      "養生および清掃",
      "残材処分（クロス・ボンド屑等）"
    ]
  },
  {
    id: "TC-002 (Missing Important Steps - Low Recall)",
    inputTrigger: "cross_cloth",
    expectedProcesses: groundTruthList,
    actualProcesses: [
      "下塗りパテ処理（目地・ビス頭・面調整）",
      "接着剤塗布・クロス貼り"
    ]
  },
  {
    id: "TC-003 (Over-reporting/Extra Steps - High Recall, Low Precision)",
    inputTrigger: "cross_cloth",
    expectedProcesses: groundTruthList,
    actualProcesses: [
      "素地調整・ボード確認",
      "ジョイント処理（目地補強テープ貼り）",
      "下塗りパテ処理（目地・ビス頭・面調整）",
      "上塗りパテ処理・平滑研磨",
      "シーラー（プライマー）塗布",
      "接着剤塗布・クロス貼り",
      "コーナー部・ジョイント部ボンドコーク（ジョイントコーク）充填",
      "養生および清掃",
      "残材処分（クロス・ボンド屑等）",
      "余分な養生作業（無関係）",
      "追加清掃費用（無関係）"
    ]
  }
];

testCases.forEach(tc => {
  const result = calculateMetrics(tc.expectedProcesses, tc.actualProcesses);
  console.log(`\nTest Case: ${tc.id}`);
  console.log(`- Expected count: ${tc.expectedProcesses.length}`);
  console.log(`- Actual count:   ${tc.actualProcesses.length}`);
  console.log(`- True Positives: ${result.tp}`);
  console.log(`- False Negatives (Missing): ${result.fn}`);
  console.log(`- False Positives (Over):    ${result.fp}`);
  console.log(`- Recall (Sensitivity):      ${(result.recall * 100).toFixed(1)}%`);
  console.log(`- Precision:                 ${(result.precision * 100).toFixed(1)}%`);
});
