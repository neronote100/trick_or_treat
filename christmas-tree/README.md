# 🎄 王子の城下町 — クリスマスの森 2026

参加者のnote記事を**企画ごとのクリスマスツリーにオーナメントとして飾る**、Cloudflare Pages + Pages Functions + D1 の独立したサイト。タップで元記事へ遷移します。**旧ハロウィンサイト/Workerは変更しません**。

## 実装済み

- 4つの独立ツリー：💌届けないラブレター / 💕好きの告白 / 🎁クリスマスカード / 🎅全国のサンタさん。各企画の募集開始・主催者表示・タイトルは `config.json` で調整。
- ツリーごとに公開作品数を集計し、**0・8・20・40作品**で4段階に植え替え。段階は `stage_thresholds` で調整可能。過去作品は消さない。
- サムネイル画像を金縁の円形オーナメントに自動加工して表示。最大75個ずつページを切り替えて全件閲覧可能。タップでnote記事を新規タブ表示。
- note記事URL1つでエントリー、同一作者の投稿数制限なし。同じ記事の同じツリーへの重複登録はD1で防止。別企画への登録は別件扱い。
- 参加者は「自分の作品または許諾を得た作品」「サムネイル等の公開掲載」への同意チェック。TurnstileでBot対策。
- **承認してから公開**。管理画面 `/admin.html` で確認、承認、掲載取り消し、おすすめ表示、タイトル/画像修正。
- ハッシュタグは発見・周知の補助。**検索で見つかっただけの記事は自動掲載しない**。記事URL本人登録方式を掲載の基準とする。

## 公開への手順（Cloudflareの操作が必要）

1. GitHubのPRをレビューしてマージ（準備段階ではdraftを維持）。
2. Cloudflare ダッシュボードで新しい **Pages** プロジェクトを作成し、GitHub `neronote100/trick_or_treat` と接続。**既存の `trick_or_treat` Workerに上書きしないこと。**
3. ビルド設定：**Root directory** `christmas-tree`、**Build command** `npm run build`、**Build output directory** `dist`、フレームワークなし。Functionsは `christmas-tree/functions` に置いてあり、公開される静的ファイルとは分離。
4. Cloudflare D1で新しいデータベース `christmas-ornaments-2026` を作る。`migrations/0001_init.sql` を実行する。CLI例（`christmas-tree` ディレクトリから）：
   ```sh
   npx wrangler d1 execute christmas-ornaments-2026 --remote --file=migrations/0001_init.sql
   ```
5. Pagesプロジェクトの **Settings → Bindings** でD1 binding `ORNAMENTS_DB` を上記DBへ設定（ProductionとPreview、それぞれ必要なら設定）。
6. Pagesの **Variables and Secrets** に `ADMIN_TOKEN`（ランダムな24文字以上の強い秘密値）と `TURNSTILE_SECRET`（Cloudflare Turnstileの秘密鍵）を**Secret**として設定。`REGISTRATION_OPEN` は通常は `false`、開始日に `true` にする。`OPEN_PROJECTS` は登録を許可するIDをカンマ区切り（例：`letter`）。環境ごとに設定。
7. Cloudflare Turnstileを作成し、公開可能な **sitekey** を `config.json` の `turnstile_site_key` に設定。開始時に `event_open: true` とし、参加募集する `projects[].accepting: true` に変更。**画面の開始スイッチとサーバーの開始スイッチの両方が必要**。
8. 受付開始前にテストURL（note公開記事）で送信→ `/admin.html` で承認→ツリー表示→取消の一連を確認。テスト記事は公開前に非掲載へ戻す。

### デプロイ上の注意
- 現時点では**Cloudflareへの接続・D1作成・本番動作確認は未完了**。コードがGitHubにあることと公開済みは別です。
- Turnstileが未設定ならフォームは無効。サーバーは `TURNSTILE_SECRET` または `REGISTRATION_OPEN` 未設定時に受け付けません。
- `OPEN_PROJECTS` はサーバーで許可する企画を制限するため、開始する企画と同じ値にしてください。
- `ADMIN_TOKEN` はコミット・URL・Discordの公開チャンネル等に書かないこと。管理画面では入力するがブラウザ保存しません。
- noteのOGメタ情報取得はベストエフォート。サイト都合で取得できない場合は「記事タイトル確認中」で保留になり、管理者が記事を確認してタイトル/画像を補正します。
- CDN画像は元記事の画像URLを参照する方式。画像に外部アクセス制限がある場合は星の代替アイコンに切り替えます。

## サムネイルをオーナメントにする
サイトは縦横の画像を円形にマスクし、金縁・吊り輪を重ねます。**参加者に画像生成を強制しません**。希望者には [thumbnail-prompt.md](thumbnail-prompt.md) を配れます。既存画像も参加可能です。

## 参加者情報・権利
- 記事全文、noteログイン情報、メールアドレスは収集しません。
- 応募時の明示的な掲載同意をDBへ日時とともに保存。掲載内容はタイトル・作者名・OG画像・記事URLのみ。
- 作品は管理者が公開ボタンを押すまでは表示されません。削除・取り下げは管理画面から非掲載に変更できます。
- 著作権・肖像権・個人情報・有料記事などの応募条件は企画告知側で合わせて明示してください。らてさん側のフェス独自ルールと相互掲載する場合は事前にすり合わせてください。
- 「参加者数」はnote OG metadata内の作者表記による参考集計。正確なnoteアカウントIDによる本人認証は行っていません。

## RSS収集（任意の候補発掘）
旧 `scripts/collect.py` は任意で使える候補抽出器ですが、サイトの公開ツリーのデータソースでは**ありません**。ハッシュタグ自動取得は漏れがあり、応募・掲載同意と見なしてはいけません。GitHub Actionsの自動定期スケジュールは停止し、必要時だけ手動実行します。

## 開発・テスト

```sh
cd christmas-tree
npm test
npm run build
python3 -m unittest discover -s tests -v
# API付きローカル実行には Wrangler と D1 binding が必要
```

`dist` は生成物でGit管理対象外。Pagesは `dist` のみを静的公開し、`functions` はCloudflare側で実行されます。
