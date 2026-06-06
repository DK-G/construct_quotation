import * as fs from 'fs';
import * as path from 'path';
import { calculateMetrics, TestCase } from './evaluator';
import { FinishTrigger } from '../dictionary/types';

const dataDir = path.join(__dirname, '../dictionary/data');
const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));

console.log("=== Loaded Dictionaries ===");
const dictionaries: Record<string, FinishTrigger> = {};

files.forEach(file => {
  const filePath = path.join(dataDir, file);
  const data: FinishTrigger = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  dictionaries[data.finish_trigger] = data;
  console.log(`- ${data.display_name} (${data.finish_trigger}): ${data.process_chain.length} steps`);
});
console.log("===========================\n");

// Define test cases for multiple finishes
const testCases: TestCase[] = [
  {
    id: "TC-001: Cross (Perfect Match)",
    inputTrigger: "cross_cloth",
    expectedProcesses: dictionaries["cross_cloth"]?.process_chain.map(p => p.process_name) || [],
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
    id: "TC-002: Flooring (Missing Items)",
    inputTrigger: "wood_flooring",
    expectedProcesses: dictionaries["wood_flooring"]?.process_chain.map(p => p.process_name) || [],
    actualProcesses: [
      "下地清掃・点検（不陸調整）",
      "床用接着剤（ウレタン系等）塗布",
      "フローリング材割付け・敷き込み・釘打ち留め（ステープル等）"
    ]
  },
  {
    id: "TC-003: Painting (Perfect Match with Extra)",
    inputTrigger: "painting_ep_sop",
    expectedProcesses: dictionaries["painting_ep_sop"]?.process_chain.map(p => p.process_name) || [],
    actualProcesses: [
      "養生（非塗装面のマスキング・マスカー保護）",
      "素地調整（木部・鉄部・ボード等のケレン・清掃）",
      "パテ処理（凹凸・継ぎ目・ビス頭平滑化）",
      "下塗り（シーラー・サビ止め塗料塗布）",
      "中塗り（第1回上塗り）",
      "上塗り（仕上げ塗り）",
      "養生撤去および清掃・タッチアップ",
      "廃塗料・空缶・資材 of 適正処分", // This will be different to show a false positive
      "不要な追加作業"
    ]
  }
];

testCases.forEach(tc => {
  // Let's standardise the actual list to match "廃塗料・空缶・資材の適正処分" instead of "of"
  if (tc.id === "TC-003: Painting (Perfect Match with Extra)") {
    tc.actualProcesses[7] = "廃塗料・空缶・資材の適正処分";
  }
  const result = calculateMetrics(tc.expectedProcesses, tc.actualProcesses);
  console.log(`Test Case: ${tc.id}`);
  console.log(`- Expected: ${tc.expectedProcesses.length} items, Actual: ${tc.actualProcesses.length} items`);
  console.log(`- True Positives: ${result.tp}`);
  console.log(`- False Negatives (Missing): ${result.fn}`);
  console.log(`- False Positives (Over):    ${result.fp}`);
  console.log(`- Recall (Sensitivity):      ${(result.recall * 100).toFixed(1)}%`);
  console.log(`- Precision:                 ${(result.precision * 100).toFixed(1)}%\n`);
});
