## v1.5.3

- **Mihomo(Meta) 内核升级至 v1.19.27**

### 🐞 修复问题

- 修复 release 构建在未配置 Apple 签名证书时 macOS 打包失败的问题。
- 修复 Linux ARM release 构建本地 service 时缺少交叉编译 linker 的问题。
- 移除 Winget 自动提交步骤，避免未配置 `WINGET_TOKEN` 时导致 release 流程误报失败。
- 修复新 Rust/Clippy 工具链下的 lint 阻塞，确保发布前检查可正常通过。

<details>
<summary><strong> 🚀 优化改进 </strong></summary>

- 优化 Clash Ultra 自有 updater 发布流程，保持 `update.json` 与 `update-proxy.json` 自动生成和上传。
- 确认默认主题为深色模式，并保持应用品牌显示为 Clash Ultra。

</details>
