# HEARTFUL TREE — 無料の外部定期起動
Cloudflare Workers Free の Cron Trigger で 30 分ごと (毎時17分・47分 UTC/JSTの分は同じ) に GitHub Actions を起動する。既存の Python 収集、データファイル、本番 Pages URL は変更しない。GitHub の既存 cron はバックアップとして維持。直近25分以内に正常終了した場合・実行中の場合は起動しない。公開 HTTP エンドポイントは不要。

## Cloudflare の設定（初回のみ）
1. GitHub の fine-grained personal access token を作成。対象を neronote100/trick_or_treat のみに限定、Repository permissions > Actions: Read and write のみ（Metadata read は自動）。有効期限は企画終了後まで。トークンをチャットやソースコードに貼らない。
2. Cloudflare Workers & Pages で新規 Worker `heartful-tree-scheduler` を作る。既存の Pages / trick-or-treat Worker は触らない。GitHub からインポートする場合は root directory `heartful-tree-scheduler`、deploy command `npx wrangler deploy`、production branch main。Build watch paths は heartful-tree-scheduler/** に限定する（可能な場合）。
3. 新 Worker の Settings > Variables and Secrets に暗号化 Secret `GITHUB_ACTIONS_TOKEN` を登録してデプロイ。
4. Triggers > Cron Triggers に `17,47 * * * *` が登録されていることを確認。Wrangler 設定で自動登録されていれば追加しない。
5. Worker Logs と GitHub Actions の workflow_dispatch の実行履歴を照合。Pages の最新 JSON も確認する。

ダッシュボードのコードエディタで作る場合は worker.mjs をそのまま貼り、Secret と Cron Trigger を手動登録する。

## 料金
公開リポジトリの標準 GitHub-hosted runner、Workers Free の軽量な API 呼び出しだけを使用。30分ごとで48トリガー/日。Pages は既存の変更時コミット方式を維持するため、実行回数＝ビルド回数ではない。ただし大量の新着が継続した場合や他のプロジェクトが同時ビルドする場合は月間500ビルドの上限に注意。旧 Pages の自動ビルドは停止を推奨。無料枠を超える課金プランへの変更は行わない。

## ローカルテスト
node --test heartful-tree-scheduler/worker.test.mjs
