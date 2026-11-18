# 王子の城下町🌙 クリスマス妄想デート展

noteの記事サムネイルをクリスマスツリーのオーナメントとして表示し、タップすると原文のnoteに移動する**静的Webサイト**です。GitHubが記事の収集・保存を担当し、Cloudflare Pagesが公開を担当します。既存のハロウィンサイトとは独立して動作します。

## 仕組み

1. 参加者がハッシュタグを付けてnoteに投稿、または主催者が専用マガジンに収録。
2. GitHub Actionsが3時間ごとにnoteのRSSを取得（記事URL・タイトル・作者・見出し画像のみ）。
3. 同じURLは1記事にまとめ、`data/ornaments.json`に**蓄積**。取得失敗時は過去の記事を消しません。
4. Cloudflare PagesがGitHubへのJSON更新を検知してサイトを再デプロイ。
5. ツリーのサムネイル画像を押すと、元記事が新しいタブで開きます。

## 初期設定（重要）

`config.json` を編集してください。

- `hashtag`：仮設定は `クリスマス妄想デート展`。**正式なハッシュタグを3人で決めたら変更**します。タグRSSはnote公式に安定動作が保証されたAPIではありません。2026年のnote検索仕様変更もあり、取得不能・漏れの可能性があります。
- `magazine_rss_urls`：専用マガジンのURL末尾 `/rss` を入れる。例 `https://note.com/<noteID>/m/<magazineID>/rss`。**こちらを主な収集経路にすることを推奨**。
- `manual_articles`：収集漏れの作品を手動追加できます。`url`、`title`、`author`、必要なら `thumbnail` を設定します。
- `exclude_urls`：掲載を取り下げる記事URLの一覧（データから削除）。
- `picks`：3人の紹介枠の例 `{"url":"https://note.com/creator/n/n1234", "by":"らて"}`。賞ではなく「気になる作品」の印です。

### 例

```json
{
  "site_title": "王子の城下町🌙 クリスマス妄想デート展",
  "hashtag": "クリスマス妄想デート展",
  "magazine_rss_urls": ["https://note.com/NOTE_ID/m/mXXXXXXXX/rss"],
  "manual_articles": [{"url":"https://note.com/someone/n/nabc123", "title":"雪の日の約束", "author":"参加者"}],
  "exclude_urls": [],
  "picks": [{"url":"https://note.com/someone/n/nabc123", "by":"咲和"}],
  "max_articles": 200
}
```

※ 上のURLはダミー。設定なしの状態でもツリーは表示しますが、記事は0件です。

## GitHub Actions

このフォルダと合わせて、リポジトリ直下の `.github/workflows/christmas-tree-sync.yml` を配置してください。

- `schedule`: UTC 0,3,6,9,12,15,18,21時（日本時間 9,12,15,18,21,0,3,6時）。
- `workflow_dispatch`: GitHubのActions画面から手動実行できます。
- 書き込み権限 `contents: write` が必要です。
- フィードが全て失敗した場合は**失敗終了し、JSONを上書きしない**設計です。
- 本番用URL設定前に必ず手動実行で検証してください。

## Cloudflare Pagesへのデプロイ

新しいCloudflare Pagesプロジェクトを作り、既存の `trick_or_treat` Workerとは分けます。

- 接続元：GitHub `neronote100/trick_or_treat`（このプロジェクトの公開ブランチ）
- Root directory：`christmas-tree`
- Framework：`None`
- Build command：空欄（または `exit 0`）
- Build output directory：`.`（root directoryを `christmas-tree` にした場合）

接続先の設定UIによっては出力ディレクトリを `christmas-tree` としてRoot directoryを空欄にする方法も使えます。`index.html`がデプロイ成果物の直下にあることを確認してください。既存Cloudflare設定やトークンの再利用・上書きはしません。

## ローカル動作確認

```bash
python3 -m unittest discover -s tests -v
python3 -m http.server 8000
# http://localhost:8000/
```

RSS収集を行う場合：

```bash
python3 scripts/collect.py
```

## 運営上の注意

- 投稿者の明示的な企画参加意思を募集記事に記載し、投稿した作品の**タイトル・作者・サムネイル・リンクが外部の公開サイトに表示される**ことを案内してください。
- 公開された記事の情報のみを扱います。本文の転載、ログイン情報、コメント内容の収集はしません。
- 削除・掲載辞退の申し出には `exclude_urls` で対応可能です。
- RSSは通常最新25件のみ。大量投稿で取りこぼす場合は、短い収集間隔・マガジン管理・手動追加で補完してください。
- 作品のサムネイルは画像URLを参照します。画像が閲覧不可の場合は星印にフォールバックします。
- 企画終了後はGitHub Actionsのスケジュールを停止しても、蓄積した作品とサイトはそのまま残せます。
