# spec.md

> このファイルはAI向けの開発仕様書。READMEとは別物。  
> 新しいセッション開始時はこのファイルを最初に読み込ませること。

-----

## 1. コンセプト

- **概要**: 建築見積における「項目出し（見積項目の抽出）」を高精度化するためのシステム。ユーザーが入力したテキスト（自由プロンプト）や室仕上表・建具表（Excelファイル）から、施工手順（前工程）を自動展開し、必須工程の計上漏れや欠落を自動検知して警告する。
- **設計思想 / 譲れない核**: 
  - **Recall（再現率）最優先**: 見積項目の漏れ（施工するのに請求漏れすることによる損失）を防ぐため、漏れ検出を最大化（過剰検出は許容）する。
  - **例外キュー（Human-in-the-loop）設計**: 完全自動化は目指さず、確度（標準/要確認等）によってUI上でアコーディオン表示し、人間が確認すべき箇所だけに時間を集中させ効率化を図る。
  - **数量・図面解析の完全スコープ外**: CAD/PDF図面やBIMの解析、幾何的な数量計算（㎡やm、本数など）は一切行わず、テキスト情報の項目と施工手順の「整合性チェック」に100%特化する。
- **現在のフェーズ**: Phase 2〜5 のコア機能実装完了（DECISION_LOG 決定8: テキスト/Excel パース・共起警告・フィードバック還流）、Cloudflare D1 移行完了（決定10）。残作業は roadmap Phase 6（2層ベクトル RAG・CPM 工程順序制約エンジン）。※実装本体は worktree 側にあり、この repos 直下クローンからは進捗が見えない点に注意。

-----

## 2. 技術スタック

| 領域 | 採用技術 | バージョン | 選定理由 |
|---|---|---|---|
| フロントエンド | Next.js (React) | 14+ | インタラクティブなチェックリストUI（アコーディオン表示、例外キュー）の構築が容易なため |
| スタイリング | Vanilla CSS / CSS Modules | - | CSSの制御性とパフォーマンスを担保するため（ユーザー指示がない限りTailwindCSSは不使用） |
| バックエンド | Node.js (Next.js App Router) | 20+ | フロントエンドと一体開発が可能で、軽量なAPIサービスを提供できるため |
| Excelファイル解析 | `xlsx` (SheetJS) または `exceljs` | - | クライアント側またはサーバー側で安全・迅速にExcel（仕上げ表・建具表）をパースするため |
| LLM・AI API | Gemini 1.5 Pro / Claude 3.5 Sonnet | - | 仕上げテキストからの事実抽出、および前工程展開の整合性判定（非該当根拠の探索）に使用 |

-----

## 3. アーキテクチャ

### ディレクトリ構成案

```text
/construct_quotation
  /src
    /app
      /api
        /parse-excel     # Excelアップロード・パースAPI
        /generate-chain  # チェーン展開・LLM判定API
      page.tsx           # メインUI（見積項目チェック画面）
    /components
      /checklist         # チェックリスト表示・アコーディオンUI
      /uploader          # Excelドラッグ＆ドロップコンポーネント
    /dictionary
      /data              # 工程チェーン辞書データ（JSON/YAML）
        cross.json       # クロス貼り工程定義
        flooring.json    # フローリング工種定義
      schema.ts          # 辞書データのバリデーション用スキーマ
    /utils
      excelParser.ts     # Excelパース処理
      llmClient.ts       # Gemini/Claude API連携ヘルパー
```

-----

## 4. データモデル（工程チェーン辞書スキーマ）

辞書データは、仕上トリガー（仕上げ種別）ごとに以下の構造（JSON/YAML）で定義する。

```typescript
interface ReferenceSource {
  type: "standard_spec" | "jass" | "practical_knowledge";
  doc_id: string;               // 出典ドキュメント識別子 (例: "JASS 26", "PRACTICAL_FATHER")
  section?: string;             // 章・節・表番号等の詳細位置 (例: "5節 5.3.2")
  memo?: string;                // 実務知や特記情報に関する補足メモ
}

interface ProcessStep {
  step: number;                 // 施工工程順序（1始まり）
  process_name: string;         // 工程名
  sources: ReferenceSource[];   // 根拠となる出典情報のリスト（複数紐付け対応）
  required_by_default: boolean; // デフォルトで常時発生するかどうか
  confidence: "standard" | "conditional" | "to_confirm" | "low"; // 確度ラベル
  conditions: string | null;    // 発生条件（LLMによる文脈判定用、またはマッピング条件）
}

interface FinishTrigger {
  finish_trigger: string;       // 仕上判定キー（例: "cross"）
  display_name: string;         // UI用表示名（例: "クロス貼り"）
  common_spec_ref: string;      // 公共建築工事標準仕様書参照先
  jass_ref: string;             // JASS規格参照先
  process_chain: ProcessStep[]; // 展開する工程チェーン
}
```

-----

## 5. 制約・禁止事項 ★最重要

- **数量計算コードの混入禁止**: 本システムにおいて、面積・長さ・体積などの数量算出や単価計算機能は実装しないこと。工程・項目の「ある／ない」の論理判定と警告に絞る。
- **図面読取機能の混入禁止**: CAD/PDFなどの図面ファイルをアップロード・画像処理するロジックを含めないこと。対象ファイルはExcel（構造化データ）またはプレーンテキストのみとする。
- **条文テキストの再配布禁止**: 著作権および配信許諾に配慮し、標準仕様書やJASSの条文テキストそのものをデータベースに格納・出力しないこと。出典の参照コード（JASS◯章◯節等）にとどめる。

-----

## 6. 検証ツール (Validation Tools)

コード品質維持のため、本プロジェクトでは以下の検証ツールを適用する。

- ESLint
- Prettier
- TypeScript
- Jest (API及び辞書展開ロジックの単体テスト)
