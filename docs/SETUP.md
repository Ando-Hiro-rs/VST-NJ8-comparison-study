# GitHub セットアップガイド

このドキュメントは GitHub を初めて使う方向けの導入手順です。

## 1. GitHub アカウントを作成

`https://github.com/signup` でアカウントを作成します。研究目的なら所属機関のメールアドレスを使うと信頼性が高まります。

## 2. リポジトリを作成

1. GitHub にログインし、右上の `+` → `New repository` をクリック
2. 以下の項目を入力します:
   - **Repository name**: `NeoCELP-VST-NJ8` (または任意の名前)
   - **Description**: `日本人英語学習者向けの総合的語彙力測定システム`
   - **Public** を選択 (研究公開のため)
   - **Add a README file** は **チェックしない** (このプロジェクトに既にあるため)
   - **Add .gitignore** は **None** のまま
   - **License** も **None** のまま
3. `Create repository` ボタンをクリック

## 3. ローカルからリポジトリにプッシュ

このプロジェクトのフォルダで以下のコマンドを実行します。

```bash
cd NeoCELP-VST-NJ8
git init
git add .
git commit -m "Initial commit: NeoCELP & NeoVST-NJ8 v1.0"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/NeoCELP-VST-NJ8.git
git push -u origin main
```

`YOUR-USERNAME` は自分のGitHubユーザー名に置き換えてください。

初回の `git push` では認証を求められます。GitHubのパスワードではなく、**個人アクセストークン (Personal Access Token)** を使う必要があります。

### 個人アクセストークンの取得方法

1. GitHub右上のプロフィール画像 → `Settings`
2. 左メニューの一番下 `Developer settings`
3. `Personal access tokens` → `Tokens (classic)` → `Generate new token (classic)`
4. `Note` に `NeoCELP-VST development` などと記入
5. `Expiration` は `90 days` 推奨
6. `Scopes` で `repo` 全体にチェック
7. `Generate token` → 表示されたトークンをコピー (二度と表示されないので注意)
8. `git push` のパスワード入力で、このトークンを貼り付け

## 4. GitHub Pages を有効化 (Webで公開)

1. リポジトリページの上部メニュー `Settings`
2. 左メニュー `Pages`
3. **Source** で `GitHub Actions` を選択
4. リポジトリのトップに戻り、`Actions` タブで自動デプロイの進行状況を確認
5. 数分後、`https://YOUR-USERNAME.github.io/NeoCELP-VST-NJ8/` でアクセス可能になります

このプロジェクトには `.github/workflows/deploy.yml` が含まれているので、`main` ブランチに変更をプッシュすると自動的に GitHub Pages にデプロイされます。

## 5. 編集ワークフロー

ファイルを編集した後の基本的な流れです。

```bash
git add .
git commit -m "変更内容を簡潔に書く"
git push
```

数分後、GitHub Pages 上のサイトも自動更新されます。

## 6. README の編集

`README.md` 内の `YOUR-USERNAME` を実際のユーザー名に置き換えるのを忘れずに。これによりリポジトリ内のリンクが正しく機能します。

`CITATION.cff` の `[Your Name]` と `[Your Affiliation]` も自分の情報に書き換えてください。

## 7. 開発の進め方

機能追加や修正をするときは、ブランチを切ると安全です。

```bash
git checkout -b feature/new-feature
```

変更をコミットしてプッシュした後、GitHub上で `Pull Request` を作成すると、メインブランチへのマージ前に変更内容を確認できます。

一人で開発する場合は `main` ブランチに直接コミットしても構いません。

## トラブルシューティング

**問題: `git push` でエラー (`Permission denied`)**

→ 個人アクセストークンが正しくない、または期限切れの可能性。新しいトークンを生成して再試行。

**問題: GitHub Pages が表示されない**

→ `Settings → Pages` で Source が `GitHub Actions` になっているか確認。`Actions` タブでデプロイがエラーになっていないか確認。

**問題: index.html を開いてもデータが読み込まれない**

→ ブラウザでファイルを直接開くと `file://` プロトコルになり、JSONのfetch がブロックされます。ローカルテストでは `python3 -m http.server 8000` でローカルサーバーを立ててから `http://localhost:8000` でアクセスしてください。
