# Project AGENTS.md for construct_quotation

このリポジトリは「見積項目出し_高精度化」プロジェクトの本体です。

## エージェント開発ルール

1. 実装作業は `d:\dev\worktrees\construct_quotation\<task-name>\` で行ってください。
2. 作業前に必ず [見積項目出し_高精度化_計画書.md](見積項目出し_高精度化_計画書.md) を確認してください。
3. `task.md` は各作業用 worktree のルートに配置し、進行状況を管理してください。

## 実行環境の分離 (Runtime Isolation) ルール

このプロジェクトでは、`node_modules` の容量肥大化を防ぐため、レポジトリ共通の共有ディレクトリに実体を置き、ワークツリーからは Junction リンクを設定します。

* **正しい Junction のパス構造:**
  - ワークツリー側: `D:\dev\worktrees\construct_quotation\<task-name>\node_modules`
  - 共有実体側: `D:\dev\shared\node_modules\construct_quotation\repo\node_modules` (※パスに `<task-name>` は含めません)
* **セットアップの自動化:**
  自動セットアップ用の PowerShell スクリプト [setup-node-modules.ps1](file:///D:/dev/worktrees/construct_quotation/phase-0-1/setup-node-modules.ps1) を用意しています。新規ワークツリー起動時は、まずこのスクリプトを実行して環境を整えてから `yarn install` を実行してください。

