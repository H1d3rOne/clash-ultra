<h1 align="center">
  <img src="../src-tauri/icons/icon.png" alt="Clash" width="128" />
  <br>
  Clash Ultra
  <br>
</h1>

<h3 align="center">
<a href="https://github.com/tauri-apps/tauri">Tauri</a> で構築された Clash Meta GUI。
</h3>

<p align="center">
  言語:
  <a href="../README.md">简体中文</a> ·
  <a href="./README_en.md">English</a> ·
  <a href="./README_es.md">Español</a> ·
  <a href="./README_ru.md">Русский</a> ·
  <a href="./README_ja.md">日本語</a> ·
  <a href="./README_ko.md">한국어</a> ·
  <a href="./README_fa.md">فارسی</a>
</p>

## プレビュー

| ダーク                                  | ライト                                   |
| --------------------------------------- | ---------------------------------------- |
| ![ダークプレビュー](./preview_dark.png) | ![ライトプレビュー](./preview_light.png) |

## インストール

[リリースページ](https://github.com/H1d3rOne/clash-ultra/releases) から、ご利用のプラットフォームに対応したインストーラーをダウンロードしてください。<br>
Windows (x64/x86)、Linux (x64/arm64)、macOS 10.15+ (Intel/Apple) をサポートしています。

#### リリースチャンネルの選び方

| チャンネル  | 説明                                                             | リンク                                                                                 |
| :---------- | :--------------------------------------------------------------- | :------------------------------------------------------------------------------------- |
| Stable      | 安定版。信頼性が高く、日常利用に最適です。                       | [Release](https://github.com/H1d3rOne/clash-ultra/releases)                 |
| Alpha (EOL) | 公開フローの検証に使用した旧テスト版。                           | [Alpha](https://github.com/H1d3rOne/clash-ultra/releases/tag/alpha)         |
| AutoBuild   | 継続的に更新されるテスト版。フィードバックや新機能検証向けです。 | [AutoBuild](https://github.com/H1d3rOne/clash-ultra/releases/tag/autobuild) |

#### インストール手順と FAQ

詳しい導入手順やトラブルシュートは [ドキュメントサイト](https://clash-ultra.github.io/clash-ultra/) を参照してください。

### Telegram チャンネル

更新情報は [@clash_ultra_app](https://t.me/clash_ultra_app) をフォローしてください。

---

## 機能

- 高性能な Rust と Tauri 2 フレームワークに基づくデスクトップアプリ
- 組み込みの [Clash.Meta (mihomo)](https://github.com/MetaCubeX/mihomo) コアを搭載し、`Alpha` チャンネルへの切り替えも可能
- テーマカラーやプロキシグループ／トレイアイコン、`CSS Injection` をカスタマイズできる洗練された UI
- 設定ファイルの管理および拡張（Merge・Script 支援）、構成シンタックスヒントを提供
- システムプロキシ制御、ガード機能、`TUN`（仮想ネットワークアダプタ）モード
- ノードとルールのビジュアルエディタ
- WebDAV による設定のバックアップと同期

### FAQ

プラットフォーム別の案内は [FAQ ページ](https://clash-ultra.github.io/clash-ultra/faq/windows.html) を参照してください。

### 寄付

[Clash Ultra の開発を支援する](https://github.com/sponsors/clash-ultra-app)

## 開発

詳細な貢献ガイドは [CONTRIBUTING.md](../CONTRIBUTING.md) をご覧ください。

**Tauri** の前提条件を整えたら、以下のコマンドで開発サーバーを起動できます:

```shell
pnpm i
pnpm run prebuild
pnpm dev
```

## コントリビューション

Issue や Pull Request を歓迎します。

## 謝辞

Clash Ultra は、以下のプロジェクトに影響を受けています。

- [tauri-apps/tauri](https://github.com/tauri-apps/tauri): Web フロントエンドで小型・高速・安全なデスクトップアプリを構築するためのフレームワーク。
- [Dreamacro/clash](https://github.com/Dreamacro/clash): Go 製のルールベーストンネル。
- [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo): Go 製のルールベーストンネル。
- [Fndroid/clash_for_windows_pkg](https://github.com/Fndroid/clash_for_windows_pkg): Windows / macOS 向けの Clash GUI。
- [vitejs/vite](https://github.com/vitejs/vite): 次世代のフロントエンドツール群。高速な開発体験を提供。

## ライセンス

GPL-3.0 ライセンス。詳細は [LICENSE](../LICENSE) を参照してください。
