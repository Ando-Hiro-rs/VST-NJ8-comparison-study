# Analysis Scripts

このディレクトリには、テスト結果のCSVデータを分析するためのスクリプトを置きます。

## ファイル

- `basic_analysis.R` — 基本的な記述統計・プライミング効果検定・信頼性指標を算出

## 使い方

1. 受験者から取得した CSV ファイルを `data/` フォルダ (自動的に作成) に配置
2. R で以下を実行:

```r
setwd('analysis')
source('basic_analysis.R')
```

3. 結果のグラフが `output/` フォルダに保存されます

## 必要なRパッケージ

```r
install.packages(c('tidyverse', 'psych', 'lme4', 'lavaan'))
```

## データの取り扱い

`data/` ディレクトリは個人情報を含む可能性があるため、`.gitignore` で Git の追跡対象から除外されています。研究データを外部に公開する場合は、参加者IDを匿名化IDに置き換えてから公開してください。
