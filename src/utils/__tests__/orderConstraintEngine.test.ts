import { validateOrderConstraints, OrderWarning } from "../orderConstraintEngine";
import { ProcessStep } from "../../dictionary/types";

describe("orderConstraintEngine - CPM & 順序制約検証テスト", () => {
  // テスト用モック工程チェーン
  // 1: 下地清掃 (Seq 1)
  // 2: パテ処理 (Seq 2, Predecessor: 1)
  // 3: クロス貼 (Seq 3, Predecessor: 2)
  const mockAllSteps: ProcessStep[] = [
    {
      step: 1,
      process_name: "下地清掃",
      sources: [],
      required_by_default: true,
      confidence: "standard",
      conditions: null,
      sequenceIndex: 1
    },
    {
      step: 2,
      process_name: "パテ処理",
      sources: [],
      required_by_default: true,
      confidence: "standard",
      conditions: null,
      sequenceIndex: 2,
      constraints: [
        { predecessor_step: 1, type: "after" }
      ]
    },
    {
      step: 3,
      process_name: "クロス貼",
      sources: [],
      required_by_default: true,
      confidence: "standard",
      conditions: null,
      sequenceIndex: 3,
      constraints: [
        { predecessor_step: 2, type: "after" }
      ]
    }
  ];

  test("すべての工程が順序通り採択されている場合、警告は発生しないこと", () => {
    const activeSteps = [...mockAllSteps];
    const warnings = validateOrderConstraints("リビング", activeSteps, mockAllSteps);
    expect(warnings.length).toBe(0);
  });

  test("先行工程 (下地清掃) が欠落している場合、警告が発生すること", () => {
    // パテ処理とクロス貼のみ採択（下地清掃を除外）
    const activeSteps = mockAllSteps.filter(s => s.step !== 1);
    const warnings = validateOrderConstraints("リビング", activeSteps, mockAllSteps);

    expect(warnings.length).toBeGreaterThan(0);
    
    // パテ処理に対する「下地清掃の欠落」警告が含まれるか
    const missingClean = warnings.find(w => w.step === 2 && w.type === "missing_predecessor");
    expect(missingClean).toBeDefined();
    expect(missingClean?.message).toContain("下地清掃");
  });

  test("中間工程 (パテ処理) が欠落している場合、後続工程で警告が発生すること", () => {
    // 下地清掃とクロス貼のみ採択（パテ処理を除外）
    const activeSteps = mockAllSteps.filter(s => s.step !== 2);
    const warnings = validateOrderConstraints("リビング", activeSteps, mockAllSteps);

    expect(warnings.length).toBeGreaterThan(0);
    
    // クロス貼に対する「パテ処理の欠落」警告が含まれるか
    const missingPate = warnings.find(w => w.step === 3 && w.type === "missing_predecessor");
    expect(missingPate).toBeDefined();
    expect(missingPate?.message).toContain("パテ処理");
  });

  test("逆転チェック - sequenceIndexが逆転している場合に警告が発生すること", () => {
    // 逆転テスト用のダミー
    // step 1: Seq 2 (後工程)
    // step 2: Seq 1 (前工程)
    const reverseSteps: ProcessStep[] = [
      {
        step: 1,
        process_name: "後工程のはずの処理",
        sources: [],
        required_by_default: true,
        confidence: "standard",
        conditions: null,
        sequenceIndex: 2
      },
      {
        step: 2,
        process_name: "前工程のはずの処理",
        sources: [],
        required_by_default: true,
        confidence: "standard",
        conditions: null,
        sequenceIndex: 1
      }
    ];

    const warnings = validateOrderConstraints("洗面室", reverseSteps, reverseSteps);
    expect(warnings.length).toBeGreaterThan(0);
    
    const reverseWarning = warnings.find(w => w.type === "order_reversed");
    expect(reverseWarning).toBeDefined();
    expect(reverseWarning?.message).toContain("逆転警告");
  });
});
