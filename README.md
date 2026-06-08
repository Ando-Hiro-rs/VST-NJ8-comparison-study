# VST-NJ8-comparison-study

日本人英語学習者向けの Web ベース語彙サイズ測定ツール。Hamada et al. (2021) の VST-NJ8 を、小室竜也先生のオンライン版実装を参考に、データ品質保証と機能拡張を行った改良版です。


これらの改良は、小室先生のオリジナル版を批判するものではなく、研究目的での利用に特化した拡張です。小室先生のツールへの敬意と感謝のもと、相補的に位置付けられるものです。
> ⚠ **本プロジェクトについて**
>
> 本プロジェクトは、濱田彰先生 (神戸市外国語大学　外国語学部　英米学科　教授) らが開発された
> VST-NJ8 (Hamada et al., 2021) と、小室竜也先生（東北大学　大学院国際文化研究科 JSPS特別研究員PD）がGit Hub上で開発された
> オンライン版 VST-NJ8 を参考に、独自に Web ベースで実装した
> 語彙サイズ測定ツールです。
>
> 
> 本リポジトリは開発作業の透明性のため公開していますが、
> 正式な研究公開・利用は許諾取得後となります。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 特長

- **新JACET8000ベース** — 2016年改訂版の頻度リストに準拠
- **3PL IRTスコアリング内蔵** — JACET公式 Excel Open Scoringシートのアルゴリズムを完全移植
- **シャッフル整合性保証** — 選択肢の表示順と回答記録の対応関係を厳密に保証
- **CSV出力対応** — 試行レベルデータと集計データの両方を出力
- **サーバー不要** — HTML/CSS/JavaScript のみで動作。GitHub Pages で即公開可能


## 引用文献

- Hamada, A., Iso, T., Kojima, M., Aizawa, K., Hoshino, Y., Sato, K., Sato, R., Chujo, J., & Yamauchi, Y. (2021). Development of a vocabulary size test for Japanese EFL learners using the New JACET List of 8,000 Basic Words. *JACET Journal*, *65*, 23–45.
- JACET Vocabulary Acquisition Research Group. (n.d.). VST-NJ8 scoring sheet [Excel sheet]. https://j-varg.sakura.ne.jp/vst-nj8/
- Komuro, R. (2023). Online VST-NJ8 [Web application]. https://ryuya-dot-com.github.io/OnlineVST-NJ8WithoutDontKnow/
- Ando, H. (2026). A study of the vocabulary processing speed and vocabulary size of Japanese university students [Bachelor's thesis]. Hokkaido University of Education, Sapporo.

## ライセンス

MIT License

## 制作者

安藤 嘉
