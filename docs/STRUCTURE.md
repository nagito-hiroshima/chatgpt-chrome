# ディレクトリ構成

拡張機能は、リポジトリのルート（`manifest.json` がある場所）をChromeに読み込みます。

| ディレクトリ | 用途 |
| --- | --- |
| `background/` | Service Worker・インストール時の初期設定 |
| `popup/` | ポップアップ・設定画面・初回ガイドの案内 |
| `chat/` | 学習チャット・履歴・認証・メッセージ処理 |
| `moodle/` | Moodleに挿入するAI・時間割・ログイン・課題機能 |
| `shared/` | 共通デザイン・時間割ストレージ・学科の対応表 |
| `help/` | 使い方ガイド |
| `assets/img/` | アイコンと画像。`help/` はガイド用スクリーンショット |
| `tests/` | 自動テストとテスト用画像 |
| `scripts/` | ガイド用スクリーンショットの撮影スクリプト |
| `docs/` | 開発資料 |

AI・認証の開発手順は [CHAT-SETUP.md](CHAT-SETUP.md) を参照してください。

## パスの指定

- `manifest.json` と `chrome.runtime.getURL()` は拡張機能のルートを基準にします。
- HTMLのリンク・CSSの画像・JavaScriptのimportは、そのファイルからの相対パスです。
- 保存済みデータのキーは移動前と同じです。
