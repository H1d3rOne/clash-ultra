# 二次开发变更整理

本文档用于整理 Clash Ultra 当前二次开发改动，方便后续继续开发、排查问题和交接。

## 1. 菜单与页面结构

### 左侧菜单

- 新增 `代理` 菜单页，路由为 `/ports`，用于承载新的代理模式管理。
- 原 `代理` 菜单显示名改为 `节点`，仍用于展示节点组和节点列表。
- `节点` 与 `订阅` 菜单位置已调整。
- `测试` 页面保留原解锁/可用性测试能力，并扩展为可选运行入口测试。

相关文件：

- `src/pages/_routers.tsx`
- `src/pages/_layout/hooks/use-nav-menu-order.ts`
- `src/locales/*/layout.json`
- `src/pages/ports.tsx`

## 2. 代理模式重构

### 三种代理模式

新的 `代理` 页中统一展示三种模式：

1. `系统代理`
   - 迁移原项目系统代理入口能力。
   - 使用原来的系统代理端口配置和开关逻辑。

2. `端口代理`
   - 新增能力。
   - 支持创建多个独立端口入口。
   - 每个端口代理可以单独开启/关闭。
   - 支持总开关批量开启/关闭已配置的端口代理。

3. `虚拟网卡代理`
   - 对应首页原 `虚拟网卡模式 / TUN`。
   - 使用原项目 TUN 开关逻辑。

### 互斥关系

- `系统代理`、`端口代理`、`虚拟网卡代理` 三者实际运行时互斥。
- 开启端口代理时，会关闭系统代理和 TUN。
- 开启系统代理或 TUN 时，会关闭端口代理。
- 页签切换只代表正在查看，不直接切换运行模式；只有开关动作才改变实际代理模式。

相关文件：

- `src/pages/ports.tsx`
- `src/components/home/proxy-tun-card.tsx`
- `src-tauri/src/config/app_config.rs`
- `src-tauri/src/feat/config.rs`

## 3. 端口代理功能

### 基本配置

每个端口代理支持：

- 名称
- 类型：`mixed` / `http` / `socks`
- 监听地址
- 端口
- UDP 开关（HTTP 类型除外）
- 路由策略：`规则` / `全局` / `直连`
- 绑定订阅
- 开启/关闭状态
- 独立链式代理配置
- 独立代理组选择状态

端口代理配置保存在 应用配置中：

```yaml
port_proxies:
  - id: ...
    name: ...
    type: mixed
    listen: 127.0.0.1
    port: 10001
    routeMode: rule
    enabled: true
    subscriptionUid: ...
    subscriptionName: ...
    nodeGroup: ...
    proxy: ...
    chain:
      enabled: false
      nodes: []
    selected:
      - name: 订阅名(端口代理名称) - 节点选择
        now: 订阅名 - 美国01
```

对应类型：

- `IVergePortProxy`
- `IVergePortProxyChain`

相关文件：

- `src-tauri/src/config/app_config.rs`
- `src/pages/ports.tsx`
- `src/types/global.d.ts`

### UI 行为

- 点击 `添加` 弹出新建端口代理对话框。
- 添加后立即保存，不再需要额外点击保存按钮。
- 每个端口代理以卡片/下拉栏展示。
- 卡片展示：名称、端口、类型、订阅、最近命中的节点组和节点、链式代理状态。
- 每个端口代理卡片内提供 `规则 / 全局 / 直连` 切换；该切换只影响当前端口。
- 新建/编辑端口代理对话框也可以设置默认路由策略。
- 展开卡片后展示节点组与节点，样式尽量与 `节点` 页面保持一致。
- 选中端口代理卡片后，再点击 `链式代理`，配置的是当前选中的端口代理链路。
- 端口代理已连接链式代理时，链式代理优先接管该端口流量，卡片内 `规则 / 全局 / 直连` 切换禁用，断开链式代理后恢复。

### 运行时生成

启用端口代理后，运行配置会生成 Mihomo `listeners`：

```yaml
listeners:
  - name: 示例端口代理
    type: mixed
    listen: 127.0.0.1
    port: 10001
    rule: port-proxy-xxx
```

核心逻辑：

- 没有开启链式代理时，根据端口自己的 `routeMode` 生成 listener：
  - `rule`：listener 使用 `rule` 指向端口专属 `sub-rules`，按订阅 rules / sub-rules 分流。
  - `global`：listener 使用 `proxy` 指向该端口绑定订阅的目标代理组/节点，该端口全部流量走代理，不再经过 rules。
  - `direct`：listener 使用 `proxy: DIRECT`，只让当前端口直连，不切换 Mihomo 顶层直连模式。
- 开启端口级链式代理：listener 使用 `proxy` 直接指向链式出口节点，进入该端口的流量走全局链式出口，不再走订阅 rules，且优先级高于 `routeMode`。
- 端口代理的运行监听地址跟随设置里的 `允许局域网连接`：
  - `allow-lan=true`：端口代理 listener 监听 `0.0.0.0`，允许局域网设备访问；
  - `allow-lan=false`：端口代理 listener 监听 `127.0.0.1`；
  - 设置变化后会重新生成 listeners 并重启核心，新增端口代理也会自动遵循该全局开关。
- 修改端口代理开关、端口、订阅、链式配置时，会重新生成运行配置并重启/刷新核心，确保端口真正打开或关闭。

相关文件：

- `src-tauri/src/config/config.rs`
- `src-tauri/src/config/runtime.rs`
- `src-tauri/src/feat/config.rs`
- `src/pages/ports.tsx`

## 4. 多订阅运行模型

### 概念区分

- `订阅库`
  - 所有已添加的 remote/local/script/merge 配置。
  - 只表示数据源，不代表一定参与运行。

- `启用订阅池`
  - 存储在 `enabled_profile_uids`。
  - 代表这些订阅可以被系统代理、端口代理、虚拟网卡代理选择。
  - 也用于节点页顶部订阅切换和首页订阅轮播。
  - 可为空。
  - 启用不等于运行，只是进入“可选池”。

- `代理入口运行订阅`
  - 系统代理：选择一个启用订阅作为运行订阅。
  - 虚拟网卡代理：选择一个启用订阅作为运行订阅。
  - 端口代理：每个端口代理选择一个启用订阅；多个端口代理可同时引用同一个订阅，也可引用不同订阅。

- `当前运行订阅实例`
  - 用户侧真正应该看到的是“当前有哪些入口实例正在使用哪些订阅”。
  - 系统代理 / TUN 模式下通常只有一个实例。
  - 端口代理模式下可以有多个实例，例如：

    ```text
    A订阅(工作端口)
    A订阅(游戏端口)
    B订阅(下载端口)
    ```

- `最终运行配置`
  - Mihomo 最终仍只加载一个完整 YAML。
  - 二开逻辑会根据当前代理模式和入口实例，把所需订阅、规则、节点组、listener、sub-rules 合成为这一个运行配置。

- `profiles.current`
  - 早期单订阅时代的兼容字段。
  - 二开后不再把它作为用户侧“当前订阅 / 主配置订阅”概念展示。
  - 短期兼容实现中，系统代理 / TUN 开启或切换订阅时会把所选订阅同步到 `profiles.current`，让原有 `enhance()` 流程继续生成该订阅的基础运行配置。
  - 长期建议把 `enhance()` 改造成可接收运行订阅 UID，彻底摆脱固定读取 `profiles.current` 的限制。

### 多订阅处理

- 节点页顶部增加启用订阅选项卡。
- 切换订阅选项卡后，只显示该订阅下的节点组和节点；当端口代理产生端口级运行实例时，也展示 `订阅名(端口代理名称)` 视图。
- 系统代理 / 虚拟网卡代理在代理页选择一个启用订阅后再开启。
- 端口代理添加/编辑时可选择启用订阅中的某一个订阅。
- 启用订阅本身不等于全部都直接参与运行，只有被当前模式或端口代理引用时才进入最终运行配置。
- 端口代理自己的代理组选择状态保存在对应的 `port_proxies[].selected` 中，不再依赖用户侧“当前订阅”。

相关文件：

- `src/pages/profiles.tsx`
- `src/pages/proxies.tsx`
- `src/components/proxy/proxy-groups.tsx`
- `src/components/proxy/use-render-list.ts`
- `src-tauri/src/config/config.rs`
- `src-tauri/src/config/app_config.rs`

## 5. 端口代理规则隔离

### 设计目标

多个端口代理可以绑定不同订阅，且不同端口之间链路相互独立，不能把节点组、规则、节点混在一起。

### 实现方式

- 每个端口代理生成一个独立的 listener。
- 每个 listener 指向独立 `sub-rules`。
- 端口代理绑定的订阅规则会复制成该 listener 专属规则。
- 如果订阅本身带有 `sub-rules`，会复制为端口专属 `sub-rules`，并改写 `SUB-RULE` 引用，避免多个端口共享同名子规则。
- 如果端口代理引用了尚未出现在基础运行配置中的订阅，会把该订阅的：
  - `proxies`
  - `proxy-groups`
  - `proxy-providers`
  - `rule-providers`
  合并进最终运行配置。

### 名称前缀

为避免多个订阅中的节点组、节点、provider 同名冲突，跨订阅合并时会加订阅前缀：

```text
订阅名 - 原名称
```

例如：

```text
布丁猫 - 节点选择
嘉豪CLOUD - 节点选择
```

如果同一个订阅被多个端口代理同时使用，则每个端口代理会额外生成端口级代理组副本：

```text
订阅名(端口代理名称) - 原代理组名
```

例如：

```text
iKuuu_V2(工作端口) - 节点选择
iKuuu_V2(游戏端口) - 节点选择
```

这样每个端口代理拥有独立的 `select` 状态，可以在同一订阅、同一代理组下选择不同节点。真实节点和 provider 不按端口复制，只复用订阅级名称，避免生成大量重复节点。

相关函数：

- `make_subscription_scoped_name`
- `make_port_proxy_scope_prefix`
- `merge_port_scoped_proxy_groups`
- `merge_prefixed_subscription`
- `rewrite_rule_targets`

相关文件：

- `src-tauri/src/config/config.rs`

## 6. 默认规则模板

### 背景

有些 remote 订阅或 local 节点配置只有节点，没有规则。为了让系统代理、TUN、端口代理都能通过规则路径工作，新增默认规则模板能力。

### 默认行为

当导入或读取到的配置没有 `rules` 时，自动补齐：

- `proxy-groups`
- `rules`
- 必要的 `rule-providers`

最小模板示例：

```yaml
proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - __ALL_PROXIES__
    use:
      - __ALL_PROXY_PROVIDERS__
rules:
  - MATCH,节点选择
```

占位符：

- `__ALL_PROXIES__`：展开为待补规则配置中的全部节点。
- `__ALL_PROXY_PROVIDERS__`：展开为待补规则配置中的全部 proxy provider。

### 内置模板

当前内置多种模板：

- 基础模板
- 开源推荐模板
- 标准分流 - 手动选择
- 标准分流 - 手动 + 自动
- 标准分流 - 自动测速
- 标准分流 - 故障转移
- 标准分流 - 负载均衡

这些模板的差异主要在命中 `节点选择` 后如何选节点：

- `select`：手动选节点。
- `手动 + 自动`：`rules` 仍然命中 `节点选择`；`自动选择` 是 `节点选择` 里的一个候选代理组，选择它后再由 `url-test` 自动挑选节点。
- `url-test`：按延迟自动选。
- `fallback`：按顺序故障转移。
- `load-balance`：负载均衡。

### 模板管理

- 内置模板只读。
- 支持新增、编辑、删除自定义模板。
- 选择模板后需要保存才会写入配置并生效。
- 连接页、测试页可以把域名/IP/进程规则添加到当前启用的规则模板中，并选择加入哪个代理组策略。

相关文件：

- `src/utils/default-rule-template.ts`
- `src/components/setting/mods/default-rule-template-viewer.tsx`
- `src/components/setting/setting-app-advanced.tsx`
- `src-tauri/src/utils/subscription.rs`
- `src-tauri/src/enhance/mod.rs`
- `src-tauri/src/config/prfitem.rs`

## 7. 链式代理

### 原链式代理

原项目链式代理基于 Mihomo `dialer-proxy`：

```text
浏览器 -> 入站端口 -> 节点 A -> 节点 B -> 节点 C -> 目标网站
```

原链式代理主要面向系统代理当前入口，属于单条全局链。

### 二开后的端口级链式代理

端口代理支持端口级链式代理：

- 每个端口代理可以配置自己的链式节点列表。
- 一个端口代理开启链式代理后，该端口的所有流量直接走链式出口。
- 端口链式代理与该端口绑定，不影响其他端口代理。
- 链式代理使用端口作为入站，但不先经过端口代理订阅 rules。
- 在 `代理` 页切换到端口代理页签时，顶部 `链式代理` 按钮会打开右侧链式配置面板，并作用于当前选中的端口代理。
- 端口代理为 `直连` 模式时不配置链式代理；需要先切换到 `规则` 或 `全局` 模式。

示例：

```text
浏览器 -> 10001 -> A -> B -> C -> 目标网站
浏览器 -> 10002 -> D -> E -> 目标网站
```

相关文件：

- `src/pages/ports.tsx`
- `src/components/proxy/proxy-chain.tsx`
- `src-tauri/src/config/config.rs`
- `src-tauri/src/config/runtime.rs`

## 8. 剪贴板导入节点/订阅

### 支持导入内容

剪贴板导入按钮位于订阅页。

支持：

- 远程订阅 URL：`http(s)://...`
- `clash://` / `clash-ultra://` 中携带的订阅 URL
- Clash/Mihomo YAML
- Base64 V2Ray 订阅
- sing-box JSON
- 单行或多行节点 URI

支持的 URI 协议包括：

- `ss`
- `ssr`
- `vmess`
- `vless`
- `trojan`
- `anytls`
- `hysteria` / `hy`
- `hysteria2` / `hy2`
- `tuic`
- `wireguard` / `wg`
- `http` / `https`
- `socks` / `socks5`

### 导入类型

- 剪贴板是远程订阅 URL：按 `remote` 订阅导入，支持更新。
- 剪贴板是节点或完整配置：创建 `local` 配置。
- 同一个订阅重复导入时支持共存，并自动改名避免重名。
- 导入成功后会加入启用订阅池；为了兼容原项目流程，导入完成后仍可能同步一次 `profiles.current`。

相关文件：

- `src/pages/profiles.tsx`
- `src/utils/uri-parser/*`
- `src-tauri/src/cmd/profile.rs`
- `src-tauri/src/config/prfitem.rs`
- `src-tauri/src/utils/subscription.rs`

## 9. 节点页增强

### 多订阅切换

- 启用多个订阅后，节点页顶部展示订阅选项卡。
- 切换订阅后，下方只展示该订阅的节点组和节点。
- 节点页顶部不再承载 `规则 / 全局 / 直连 / 链式代理` 控制；这些入口统一放在 `代理` 页，避免节点浏览页和运行入口配置混在一起。
- 端口代理运行视图只负责展示/切换该端口的端口级代理组状态，端口自己的 `规则 / 全局 / 直连` 和链式代理仍在 `代理` 页端口卡片内配置。

### 节点多选

节点卡片支持类似系统文件选择的多选行为：

- 单击：选择当前节点并清空之前多选。
- `Ctrl` / `Command` + 单击：增减选中节点。
- `Shift` + 单击：连续范围选择。
- 被多选的节点卡片高亮。
- 不使用复选框。

### 右键菜单

节点右键菜单支持：

- 测试延迟
- 测试速度
- 导出到剪贴板
- 删除节点

如果当前已有多个节点被选中，右键菜单作用于已选节点。

相关文件：

- `src/components/proxy/proxy-groups.tsx`
- `src/components/proxy/proxy-render.tsx`
- `src/components/proxy/proxy-item.tsx`
- `src/components/proxy/proxy-item-mini.tsx`

## 10. 延迟测试与测速

### 延迟测试

- 延迟测试恢复使用 Mihomo 原生 delay API。
- 支持单节点和批量节点延迟测试。
- 测试目标使用默认延迟测试 URL，可在设置中配置。

### 下载测速

新增下载测速能力：

- 后端为每个待测速节点创建临时 listener。
- 通过临时 listener 下载测速 URL 数据。
- 计算下载速度并回传前端。
- 支持批量测速、并发控制、超时控制、备用测速源回退。
- 处理部分测速源错误的 `Content-Encoding` 响应，避免解码失败。

设置项：

- `default_speed_test`
- `default_speed_test_concurrency`
- `default_speed_test_timeout`

相关文件：

- `src-tauri/src/feat/clash.rs`
- `src/services/speed.ts`
- `src/hooks/use-proxy-speed-state.ts`
- `src/components/proxy/proxy-head.tsx`
- `src/components/proxy/proxy-item.tsx`
- `src/components/proxy/proxy-speed-error-dialog.tsx`

## 11. 测试页增强

### 测试入口选择

测试页新增运行入口选择：

- 系统网络
- 当前开启的端口代理

选择端口代理时，测试流量会通过该端口代理入口发起。

### 自定义测试项

- 支持添加自定义测试项。
- 支持编辑名称和地址。
- 支持删除。
- 内置测试项也支持右键编辑/删除逻辑，删除内置项会记录隐藏状态。
- 单个测试项可以重复测试，状态会随测试刷新。

### 规则模板联动

测试项右键菜单支持把域名加入默认规则模板，并选择目标代理组策略。

### 测试项视觉状态

- 测试项卡片在浅色/深色默认主题下分别优化状态色和结果色，避免 `待测试 / 测试中 / 成功 / 失败` 在卡片背景上不明显。
- 深色模式下测试卡片的白色高光改为更柔和的散射/羽化效果，避免局部扫光过亮。
- 测试页动效需要与浅色模式保持一致；深色模式只调整亮度、透明度和背景质感，不应直接移除动效。

相关文件：

- `src/pages/unlock.tsx`
- `src/components/test/test-box.tsx`
- `src/components/test/test-item.tsx`
- `src/pages/_layout/hooks/use-custom-theme.ts`
- `src-tauri/src/cmd/media_unlock_checker/*`
- `src/utils/default-rule-template.ts`

## 12. 连接页增强

连接页右键菜单新增把连接信息加入默认规则模板：

- 主机名：`DOMAIN`
- 目标 IP：`IP-CIDR` / `IP-CIDR6`
- 进程名：`PROCESS-NAME`
- 进程路径：`PROCESS-PATH`

添加时需要选择加入哪个代理组策略。

相关文件：

- `src/pages/connections.tsx`
- `src/components/connection/*`
- `src/utils/default-rule-template.ts`

## 13. 首页调整

### 订阅卡轮播

- 首页订阅卡不再只展示早期单订阅字段 `profiles.current`。
- 改为展示所有已启用订阅。
- 多个启用订阅时自动轮播。

### 当前代理卡轮播

- 端口代理模式下，当前代理卡展示已开启端口代理。
- 多个端口代理时自动轮播。
- 卡片标题显示端口代理名称。

### 卡片命名

- `网络设置` 改为 `代理模式`。
- `代理模式卡` 改为 `分流规则卡`。
- 规则模式文案调整为 `规则分流`。

### 首页卡片排版约束

- 首页卡片尺寸以当前代理卡、IP 信息卡为统一基准；首页设置里勾选其它卡片后，也不应该改变同一栅格内卡片的整体尺寸。
- 调整卡片视觉时优先修改卡片内部 header、图标、光影、留白和内容密度，不要挤占 `FluxStage` 的空间，不要改变首页外围布局尺寸。
- `home-enhanced-card__ambient` 作为纯内部装饰层，高度应保持为 `0`，避免它参与布局把卡片撑高。
- 当首页只显示两个卡片时，不应因为卡片 header 或底部间距过大导致出现滚动条。

相关文件：

- `src/pages/home.tsx`
- `src/components/home/enhanced-card.tsx`
- `src/components/home/home-profile-card.tsx`
- `src/components/home/current-proxy-card.tsx`
- `src/components/home/proxy-tun-card.tsx`
- `src/locales/zh/home.json`

## 14. 主题与 UI 二开

### 主题预设

新增/扩展多套主题预设，例如：

- 默认主题
- 液态玻璃
- 日系漫画
- 赛博朋克
- 其他实验风格主题

主题预设目标不只是改颜色，也包括组件边框、阴影、背景、卡片质感、菜单和节点卡片状态等样式。

### 默认主题模式

- 新安装、配置缺失或配置异常时，默认主题模式为 `dark`。
- 用户显式选择 `light` 时继续使用浅色模式。
- 用户显式选择 `system` 时仍跟随系统浅色/深色，不强制改成深色。
- 前端预加载、Tauri 窗口初始化脚本、后端默认配置和设置页主题切换器需要保持同一个默认值，避免启动时先闪浅色再切深色，或设置页选中态与实际主题不一致。

相关文件：

- `src-tauri/src/config/app_config.rs`
- `src-tauri/src/utils/resolve/window.rs`
- `src-tauri/src/utils/resolve/window_script.rs`
- `src/services/preload.ts`
- `src/components/setting/mods/theme-mode-switch.tsx`

### 注意事项

- 主题只应该影响界面样式，不应该影响核心代理功能。
- 下拉框、弹窗、右键菜单宽度需要避免被全局主题样式撑满应用宽度。
- 需要保证浅色、深色、系统模式有明显差异。
- 节点选中态、按钮状态、文字颜色在所有主题下都要可读。

### 默认主题运行时视觉优化

- 默认主题的浅色/深色基础风格通过 `use-custom-theme.ts` 注入运行时 CSS，统一页面背景、卡片、按钮、开关、Tabs、节点卡、测试卡、解锁页和代理页的视觉质感。
- 默认深色模式应避免明显条纹线；背景以柔和渐变、低透明度光晕和羽化高光为主。
- 浅色模式与深色模式的卡片/节点/测试页动效保持一致；深色模式只降低亮度和透明度，不应因为模式不同而缺失动效。
- 深色模式开关组件需要强化启用/未启用区分：轨道、拇指、内发光和 checked 态颜色都要有可见差异。
- `DEFAULT_FRESH_MINT_PERSONALITY_CSS`、`TEST_PAGE_DARK_SURFACE_CSS`、`UNLOCK_PAGE_DARK_FEATHER_CSS`、`PROXIES_PAGE_DARK_SHINE_CSS`、`DEFAULT_CARD_MOTION_SYNC_CSS` 等运行时 CSS 负责默认主题的细节补强。

### 默认主题文字可读性兜底

- 运行时同步维护以下文字变量：
  - `--text-primary`
  - `--text-secondary`
  - `--text-disabled`
  - `--text-inverse`
- `TEXT_CONTRAST_GUARD_CSS` 放在运行时样式末尾，作为普通文本可读性兜底：
  - 浅色模式避免白字/浅色字落在浅背景上不可读；
  - 深色模式避免黑字/深色字落在深背景上不可读；
  - 覆盖 Typography、列表、表格、输入框、菜单、Chip、placeholder、disabled 等常规文本；
  - 不覆盖 `error` / `success` / `warning` / `info` 等语义状态色。
- 后续修改主题时，普通文本应优先使用主题语义变量，不要在组件内硬编码 `#fff` / `#000`。

### UI 轻量优化开关

- 轻量模式设置中新增 `enable_ui_lightweight_optimizations`，默认开启。
- 该开关只影响前端刷新频率、动效密度和连接数据展示方式，不改变 Mihomo 运行模式、订阅合并或端口代理生成逻辑。
- 开启后，页面不可见时暂停/降低高频刷新，首页卡片、FluxStage、Dock 流量胶囊和端口代理页连接视图会优先使用轻量摘要数据。
- 连接数据轻量化目标是减少无流量或后台状态下 WebView 的内存和 CPU 波动；需要完整连接明细时可关闭该开关，回到原始 `connections` 数据流。
- UI 轻量优化与“立即进入轻量模式 / 自动进入轻量模式”是两层概念：前者是常驻的前端性能策略，后者是窗口关闭后进入更低资源占用的应用状态。

相关文件：

- `src/components/setting/mods/lite-mode-viewer.tsx`
- `src/hooks/use-connection-data.ts`
- `src/providers/app-data-provider.tsx`
- `src/services/query-client.ts`
- `src/components/home/clash-info-card.tsx`
- `src/components/home/current-proxy-card.tsx`
- `src/components/home/flux/flux-stage.tsx`
- `src/components/layout/dock-traffic.tsx`
- `src/pages/ports.tsx`

相关文件：

- `src/components/setting/mods/theme-presets.ts`
- `src/components/setting/mods/theme-viewer.tsx`
- `src/components/setting/mods/theme-mode-switch.tsx`
- `src/pages/_layout/hooks/use-custom-theme.ts`
- `src/assets/styles/index.scss`
- `src/assets/styles/layout.scss`
- `src/components/proxy/proxy-item.tsx`
- `src/components/proxy/proxy-item-mini.tsx`
- `src/pages/profiles.tsx`

## 15. Flux / Dock UI 实验

当前分支还有一组 UI 重构实验：

- Flux glass 首页舞台背景。
- macOS 风格 Dock 导航。
- 页面切换圆盘动画。
- 默认窗口尺寸调整。
- 图标替换为猫形图标。
- 左上角 `New` 更新提示在所有模式下保持红色，并收窄按钮宽度。
- Dock 鱼眼放大需要保持图标清晰，避免放大后模糊。
- FluxStage 线上运动元素由普通圆点改为数据包图标。
- 内核球猫眼增加眨眼动画，当前周期约 `5.4s`，并遵守 `prefers-reduced-motion`。

### FluxStage 节点玻璃球

- FluxStage 每个节点增加透明玻璃 / 水晶 / 琥珀 3D 质感，通过内部高光、折射层、内阴影和 hover 上浮实现。
- 只修改节点内部视觉表现，不改变 FluxStage 外围容器尺寸、节点尺寸和节点布局位置。
- 节点外轮廓必须保持正圆：
  - `borderRadius: 50%`
  - `aspectRatio: 1 / 1`
  - `flex: 0 0 auto`
- 不要用不规则圆角或椭圆渐变改变节点外形；水滴、玻璃、琥珀效果应由内部圆形高光和折射层完成。

相关文件：

- `src/components/home/flux/*`
- `src/components/layout/dock-item.tsx`
- `src/components/layout/dock-traffic.tsx`
- `src/components/layout/update-button.tsx`
- `src/pages/_layout.tsx`
- `src/assets/styles/layout.scss`
- `src-tauri/icons/icon.icns`
- `src/assets/image/icon_dark.svg`
- `src/assets/image/icon_light.svg`

## 16. 后端配置字段汇总

新增或扩展的 应用配置字段主要有：

```rust
pub theme_preset: Option<String>;
pub default_speed_test: Option<String>;
pub default_speed_test_concurrency: Option<u8>;
pub default_speed_test_timeout: Option<u64>;
pub test_list: Option<Vec<IVergeTestItem>>;
pub port_proxies: Option<Vec<IVergePortProxy>>;
pub enabled_profile_uids: Option<Vec<String>>;
pub system_proxy_profile_uid: Option<String>;
pub tun_proxy_profile_uid: Option<String>;
pub default_rule_template: Option<String>;
pub default_rule_template_key: Option<String>;
pub rule_template_items: Option<Vec<IRuleTemplateItem>>;
pub enable_auto_light_weight_mode: Option<bool>;
pub auto_light_weight_minutes: Option<u64>;
pub enable_ui_lightweight_optimizations: Option<bool>;
```

字段说明：

- `enabled_profile_uids`：订阅启用池，只表示可被代理入口选择。
- `system_proxy_profile_uid`：系统代理入口选择的运行订阅 UID。
- `tun_proxy_profile_uid`：虚拟网卡代理入口选择的运行订阅 UID。
- `port_proxies[].subscriptionUid`：端口代理入口选择的运行订阅 UID。
- `port_proxies[].routeMode`：端口代理自己的路由策略，可为 `rule` / `global` / `direct`，只影响当前 listener，不修改 Mihomo 顶层 `mode`。
- `port_proxies[].selected`：端口代理自己的代理组选择状态，`name` / `now` 使用运行时端口级名称，避免污染订阅自身的 `profiles.current.selected`。
- `enable_auto_light_weight_mode` / `auto_light_weight_minutes`：窗口关闭后自动进入轻量模式的开关与延迟。
- `enable_ui_lightweight_optimizations`：UI 轻量优化开关，默认 `true`，控制前端高频刷新、连接数据摘要和部分非必要动效，不影响代理核心功能。

相关文件：

- `src-tauri/src/config/app_config.rs`
- `src/types/global.d.ts`

## 17. 运行逻辑重点

### Mihomo 最终仍只有一个运行配置

无论启用多少订阅、开启多少端口代理，最终交给 Mihomo 的仍是一个完整 YAML 运行配置。

二开逻辑是在生成这个最终 YAML 时：

1. 先根据当前实际运行模式确定入口实例：
   - 系统代理：`system_proxy_profile_uid` 对应的一个订阅。
   - 虚拟网卡代理：`tun_proxy_profile_uid` 对应的一个订阅。
   - 端口代理：所有已开启 `port_proxies` 各自绑定的订阅。
2. 系统代理 / TUN 当前仍通过把入口选择同步到 `profiles.current` 走原 `enhance()` 兼容路径。
3. 端口代理根据开启的端口代理加载其绑定订阅。
4. 跨订阅合并时给节点组、节点、provider 加 `订阅名 - 原名称` 前缀。
5. 同一订阅被多个端口代理引用时，再为代理组生成端口级副本：`订阅名(端口代理名称) - 原代理组名`。
6. 为每个端口代理生成独立 listener。
7. 为每个 listener 生成独立 sub-rule。
8. 如端口代理开启链式代理，则 listener 直接指向端口级链式出口。
9. 端口级代理组的 `now` 从该端口代理自己的 `selected` 恢复；旧数据才回退读取兼容层 `profiles.current.selected`。

### 规则模式关系

- 系统代理 / TUN：仍可以使用 Mihomo 顶层 `rule` / `global` / `direct` 模式。
- 端口代理运行时：Mihomo 顶层 `mode` 会保持/强制为 `rule`，避免托盘、快捷键或其它入口把内核切到 `global` / `direct` 后绕过端口 listener 的专属规则。
- 端口代理自己的 `规则 / 全局 / 直连` 不再依赖 Mihomo 顶层 `mode`，而是写入 `port_proxies[].routeMode` 后在生成 listener 时生效：
  - `rule`：当前端口走 listener `rule` / `sub-rules`；
  - `global`：当前端口 listener 直接 `proxy` 到该端口的目标代理组/节点；
  - `direct`：当前端口 listener 直接 `proxy: DIRECT`。
- 端口级链式代理：本质是该端口的全局链式出口，不再经过订阅 rules，并且优先级高于 `routeMode`。

### UI 轻量优化运行规则

UI 轻量优化是前端运行时策略，重点控制数据订阅和渲染压力：

- `use-connection-data.ts` 在轻量策略下优先提供摘要数据，避免无流量时仍持续推动完整连接大对象渲染。
- 首页当前代理卡、FluxStage 和端口代理页会按页面可见性控制连接数据订阅；页面不可见时暂停或降频。
- Dock 流量胶囊在空闲状态下复用最近一次样本，并降低内存/流量指标刷新频率。
- `app-data-provider.tsx` 和 `query-client.ts` 调整缓存、轮询、`staleTime` / `gcTime`，减少后台常驻查询压力。
- 如果需要排查连接明细丢失、实时性不足或动态图表不刷新，先确认设置页轻量模式中的“启用界面轻量优化”是否开启。

## 18. 已知注意点与后续建议

1. `sub-rules`、`listeners.rule` 依赖 Mihomo 内核支持，打包时需要确保内核版本支持。
2. 多订阅合并时要严格避免把运行时加前缀后的节点组写回原订阅文件。
3. 端口代理关闭后必须确认运行配置中对应 listener 被移除，并确保核心释放端口。
4. 主题样式不要写过宽的全局选择器，避免影响 MUI Select/Menu/Dialog 宽度。
5. 节点删除/导出/导入需要保持协议解析和 YAML 序列化一致，否则导出的节点可能无法再次导入。
6. 默认规则模板修改后，需要重新应用运行配置才能影响端口代理和无规则订阅。
7. 端口代理模式下如果访问被直连，优先检查：
   - 端口代理绑定的订阅是否正确；
   - 端口代理自己的 `routeMode` 是否为 `direct`；
   - 该订阅 rules 是否命中 DIRECT；
   - 是否开启了端口级链式代理；
   - 运行配置里 listener 是 `rule` 还是 `proxy`；
   - 合并后的规则目标是否被正确加前缀。
8. 端口代理开启时 Mihomo 顶层 `mode` 应保持为 `rule`；端口自己的 `全局/直连` 通过 listener `proxy` 实现，不要把顶层模式切到 `global/direct`。
9. 默认主题文字颜色应通过主题变量和 `TEXT_CONTRAST_GUARD_CSS` 保证可读，避免在组件内硬编码普通文本白色/黑色。
10. FluxStage 节点后续做 3D/水滴/玻璃效果时，只能改内部高光和折射层，不要改变节点外轮廓或外围布局尺寸。
11. 运行时注入 CSS 的顺序很重要；兜底可读性样式应保持在较后位置，避免被 Emotion/MUI 动态样式覆盖。
12. 视觉优化优先改组件内部层（阴影、渐变、图标、文字层级、hover/active 状态），不要随意改页面外层容器尺寸，否则会破坏首页/FluxStage/Dock 的整体排版。
13. 默认主题模式现在以深色为缺省值；不要只改前端或只改后端的默认值，否则可能导致启动背景、React 初始主题和设置页选中态不一致。
14. 本地构建不需要 updater 签名，应使用 `pnpm run build:local` / `pnpm run build:fast:local`；正式 release 构建才使用 `pnpm build` 并配置 `TAURI_SIGNING_PRIVATE_KEY`。
15. 生产构建后的前端 WebView 在系统中可能显示为 `tauri://localhost`，它相当于开发模式下 `localhost:3300` 的打包前端，不代表外部网站或额外服务。
16. 订阅页“导入”按钮只要求文字颜色与旁边“新建”按钮一致，浅色/深色模式都不要额外改按钮背景，避免破坏现有按钮层级。
17. UI 轻量优化默认开启；新增高频数据面板、动画或轮询请求时，需要接入页面可见性和 `enable_ui_lightweight_optimizations`，避免空闲状态内存持续上涨。

## 19. 常用检查命令

前端检查：

```bash
./node_modules/.bin/biome format --write <changed-files>
./node_modules/.bin/tsc --noEmit --pretty false
pnpm exec eslint -c eslint.config.ts <changed-files>
pnpm exec tsc --noEmit --pretty false
```

后端检查：

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

本地生产构建（不生成 updater 签名产物）：

```bash
source ~/.nvm/nvm.sh
nvm use 22.23.0
pnpm run build:local
open "target/release/bundle/macos/Clash Ultra.app"
```

`build` / `build:fast` / `build:local` / `build:fast:local` 都会通过 pnpm lifecycle 自动先执行 `scripts/prebuild.mjs`，从本地 `crates/clash-ultra-service-ipc` 构建 service 三件套并复制到打包资源目录。

快速本地构建：

```bash
source ~/.nvm/nvm.sh
nvm use 22.23.0
pnpm run build:fast:local
open "target/fast-release/bundle/macos/Clash Ultra.app"
```

正式发布构建：

```bash
source ~/.nvm/nvm.sh
nvm use 22.23.0
export TAURI_SIGNING_PRIVATE_KEY=...
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=...
pnpm build
```

查看运行配置相关问题时，重点检查生成后的：

```yaml
listeners:
sub-rules:
proxies:
proxy-groups:
rule-providers:
rules:
```

## 20. 同一订阅多端口代理的端口级运行视图

已确认采用“前端端口运行视图 + 后端端口级代理组隔离”的组合方案。

### 目标

当多个端口代理选择同一个订阅时，每个端口代理都应该拥有独立的代理组选择状态，避免出现：

```text
10001 和 10002 都绑定 A 订阅，但二者共享 A 订阅里的同一个 select 代理组当前节点
```

最终效果：

```text
10001 -> A订阅(工作端口) - 节点选择 -> 美国01
10002 -> A订阅(游戏端口) - 节点选择 -> 日本01
```

### 前端显示规则

节点页面顶部订阅/运行视图按运行入口动态生成。

显示规则：

```text
同一订阅只被一个端口代理引用：订阅名
同一订阅被多个端口代理引用：订阅名(端口代理名称)
```

例如：

```text
A订阅
B订阅(工作端口)
B订阅(ChatGPT端口)
```

规则：

- 一个开启并绑定订阅的端口代理 = 一个端口代理运行视图。
- 端口代理运行视图只在端口代理模式实际生效时展示；系统代理 / 虚拟网卡模式下，不用端口代理视图遮蔽对应订阅。
- 同一订阅只被一个端口代理引用时，页签显示订阅名；同一订阅被多个端口代理引用时，才显示多个同名订阅的端口视图，并用端口代理名称区分。
- 节点页页签顺序按订阅页的订阅顺序展开；被端口代理使用的订阅不会统一追加到最后。
- 端口视图只展示运行配置中该端口代理自己的 scoped proxy-groups。
- 已被开启端口代理引用的订阅，不再额外显示一个原订阅视图，避免出现 `A订阅` 与 `A订阅(端口代理)` 重复。
- 未被开启端口代理引用的启用订阅，仍显示原订阅视图，展示订阅本身的节点组。
- 端口代理运行视图里，运行时真实代理组名仍保留 `订阅名(端口代理名称) - 原代理组名`，但节点页展示层会去掉运行前缀，只显示原代理组名；所有 API 调用、测速、选择、定位仍使用真实名称。

### 后端生成规则

Mihomo 最终仍只加载一个完整运行配置。端口代理模式下，生成运行配置时按：

```text
端口代理 ID + 订阅 UID
```

生成端口级代理组副本。

命名格式：

```text
订阅名(端口代理名称) - 原代理组名
```

处理原则：

- `proxy-groups`：生成端口级副本，用于隔离 select/url-test/fallback 等组状态。
- `rules` / `sub-rules`：每个 listener 使用自己的 sub-rule，并把规则目标改写到端口级 proxy-groups。
- `proxies` / `proxy-providers`：继续复用订阅级前缀后的真实节点/provider，避免重复复制大量节点配置。
- `rule-providers`：继续复用订阅级前缀后的 provider，并改写 `RULE-SET` 引用。
- 端口级链式代理仍是 listener 直接指向链式出口，不先经过订阅 rules。

### 选择状态

端口运行视图里的节点选择通过 Mihomo API 写到端口级代理组，例如：

```text
A订阅(工作端口) - 节点选择 -> 美国01
A订阅(游戏端口) - 节点选择 -> 日本01
```

这样 Mihomo 会认为它们是两个不同代理组，选择状态互不影响。

当前持久化策略把端口级选择状态保存到对应 `port_proxies[].selected`，保存的 groupName 是运行时端口级 group 名，避免污染订阅自身的 `profiles.current.selected` 兼容状态。

## 21. 项目品牌化与运行产物命名

当前二次开发项目的用户可见品牌已统一为：

```text
显示名：Clash Ultra
包名/slug：clash-ultra
Bundle Identifier：app.clash-ultra.desktop
默认数据目录名：clash-ultra
开发服务端口：3300
```

主要改动范围：

- Tauri 应用名、包标识、发布产物名改为 `Clash Ultra` / `clash-ultra`。
- Rust workspace 内部自研 crate 已改为 `clash-ultra-*` / `tauri-plugin-clash-ultra-sysinfo`。
- Linux desktop 模板改为 `src-tauri/packages/linux/clash-ultra.desktop`。
- Windows/macOS/Linux 打包配置中的应用标识已统一为 `app.clash-ultra.desktop`。
- README、Issue 模板、CI 发布标题、安装包/便携包命名已替换为 Clash Ultra。
- 开发特性名从 `verge-dev` 改为 `ultra-dev`，脚本临时目录从 `node_modules/.verge` 改为 `node_modules/.ultra`。
- 开发前端端口从 `3000` 改为 `3300`，对应 `vite.config.mts`、`tauri.conf.json` 的 `devUrl`、开发环境 CORS 白名单和 Dev Container 端口转发。
- 应用数据目录从 `app.clash-ultra.desktop` 调整为更独立的 `clash-ultra`；开发模式为 `clash-ultra-dev`。首次启动时会把当前分支旧数据目录 `app.clash-ultra.desktop` / `app.clash-ultra.desktop.dev` 迁移到新目录。
- Deep Link 同时保留通用 `clash://` 兼容入口和独立 `clash-ultra://` 入口；Windows 注册表、Linux desktop MimeType 和 Linux `mimeapps.list` 初始化都覆盖两个 scheme。
- Linux deb/rpm 打包配置不再声明与自身 `clash-ultra` 冲突或替换，避免独立包自冲突。
- Windows 安装器只结束 Clash Ultra 自己的服务和 `ultra-mihomo*` 进程，不再结束通用 `clash-meta*` 进程，避免误伤其他应用。
- Windows 安装器只处理 Clash Ultra 自己的运行进程、服务、快捷方式、注册表和自动启动任务；安装/更新阶段不删除应用数据目录。卸载时只有用户勾选删除应用数据才移除 `clash-ultra` / 早期 `app.clash-ultra.desktop` 数据目录。
- Windows 便携包脚本优先打包 Tauri 产物 `Clash Ultra.exe`，并兼容旧的 `clash-ultra.exe` 文件名。
- 默认深色主题仍通过配置模板 `theme_mode: dark` 生效。

### 应用配置与前端运行标识

为了减少运行时和 DevTools 中的旧项目痕迹：

- 应用级配置文件统一为 `ultra.yaml`。
- 不再自动迁移旧上游配置文件名；首次启动只读取 Clash Ultra 当前配置文件，避免继续保留旧项目兼容包袱。
- 主题预注入全局变量、HTML 根节点数据属性、前端内部事件通道、自定义主题 style 节点、调试开关缓存均统一使用 `ultra` / `ULTRA` 命名。
- 前端应用配置 Hook 路径改为 `src/hooks/use-app-config.ts`，Tauri 命令改为 `get_ultra_config` / `patch_ultra_config`。
- Rust 应用配置模块文件改为 `src-tauri/src/config/app_config.rs` / `src-tauri/src/cmd/app_config.rs`，生成到 Mihomo 配置中的端口代理扩展字段使用 `x-ultra-port-proxy-*`。

### Mihomo sidecar 命名

为了减少原项目痕迹，应用内置 Mihomo sidecar 名称已从旧名称迁移为：

```text
ultra-mihomo
ultra-mihomo-alpha
```

相关位置：

- `src-tauri/tauri.conf.json`
- `src-tauri/tauri.linux.conf.json`
- `scripts/prebuild.mjs`
- `scripts/portable.mjs`
- `scripts/portable-fixed-webview2.mjs`
- `src-tauri/src/config/app_config.rs`
- `src/components/setting/mods/clash-core-viewer.tsx`
- `src-tauri/src/enhance/chain.rs`
- `src-tauri/src/utils/dirs.rs`

当前策略：

- 只接受 Clash Ultra 当前核心名：`ultra-mihomo` / `ultra-mihomo-alpha`。
- 无效或缺失的 `clash_core` 会自动回退到 `ultra-mihomo`。
- 本地 socket/pipe 使用 `ultra-mihomo.sock` / `\\.\pipe\ultra-mihomo`，避免继续生成旧命名运行痕迹。

### Service sidecar 独立命名

为避免 Clash Ultra 与原应用同时运行时共用同一个系统服务，服务端 IPC crate 已本地化为：

- crate：`crates/clash-ultra-service-ipc`
- Rust 依赖：`clash-ultra-service-ipc`
- 二进制：
  - `clash-ultra-service`
  - `clash-ultra-service-install`
  - `clash-ultra-service-uninstall`
- Windows 服务名：`clash_ultra_service`
- Unix IPC：`/tmp/clash-ultra/clash-ultra-service.sock`
- Windows pipe：`\\.\pipe\clash-ultra-service`
- macOS launchd id：`app.clash-ultra.desktop.service`
- Linux systemd：`clash-ultra-service.service`
- 安装环境变量：`CLASH_ULTRA_SERVICE_GID`

`scripts/prebuild.mjs` 不再下载上游 service release，而是从本地 crate 构建上述二进制后复制到 `src-tauri/resources` 或 Linux sidecar 目录。安装/卸载脚本只处理 Clash Ultra 自己的服务，不主动删除原应用的服务。Linux 打包路径兼容 Tauri externalBin 的 target-triple 后缀，运行时会同时查找无后缀和 `-{target_triple}` 后缀的 service install/uninstall 二进制；Linux service installer 内部也会同时兼容无后缀与 target-triple 后缀的 service 主程序，deb/rpm 的 post-install / pre-remove 脚本同样兼容两种文件名。

交互策略：

- Release 包内置 `clash-ultra-service`、`clash-ultra-service-install`、`clash-ultra-service-uninstall`。
- 安装应用时不强制注册系统服务，避免安装器阶段触发额外权限、安全拦截或平台差异问题。
- 服务安装/卸载交互保持原项目逻辑：应用启动、开启 TUN、托盘菜单或快捷键入口都不会自动提权安装服务。
- 如果当前既不是管理员运行、服务也不可用，TUN / 虚拟网卡入口保持不可用；用户需要在设置页高级维护入口手动点击“安装服务”。
- 启动时如果读取到当前配置中的 `enable_tun_mode: true`，但当前没有管理员权限且服务不可用，会按原项目逻辑自动关闭 TUN 并保存配置，避免反复启动失败。
- 托盘里的 TUN 菜单项会根据管理员权限或 service 可用状态启用/禁用，保持与原项目一致。
- 与原项目的差异仅在服务二进制来源和命名：原项目从上游下载 service IPC release，Clash Ultra 改为从本地 `crates/clash-ultra-service-ipc` 构建独立命名的 service。

### 暂时保留的上游痕迹

以下内容暂时不强行改名，避免破坏依赖或历史记录可追溯性：

- 上游 Git 依赖 URL：`tauri-plugin-mihomo`、`sysproxy-rs`、`clash-verge-logger`。
- 历史更新日志 `docs/Changelog.history.md` 中的旧项目记录。

已清理用户可见 README/docs 中的旧项目致谢条目、上游推广段落、发布通知中的旧推广域名，以及托盘/页面版本字段中的 `vergeVersion` 内部 key，统一改为 `appVersion`；设置页 i18n 分组从 `settings.components.verge` 改为 `settings.components.app`。旧上游配置文件名和旧核心名迁移兼容已移除。
