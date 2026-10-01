# v2-omg 功能变更

分支：`v2-omg`（基于上游 `v2`）
状态：已实现（待界面验证）

本文档记录本分支相对上游 `v2` 的功能变更，随分支一并提交。后续本分支的新变更也追加到这里。

## 1. 垂直标签列表新增「按项目分组」

### 背景

「设置 → 通用 → 标签」可以把标签布局切换为垂直（桌面端显示在左侧栏，移动端在抽屉里）。本次新增可选的按项目分组视图：会话不再是一条条平铺的标签，而是归入各自的项目目录。

### 设置项

- 新增 `appearance.groupTabsByProject`（布尔，默认关闭）。
- 仅在 `tabLayout === "vertical"` 时显示「按项目分组」开关。

### 交互

开启后，垂直会话列表：

- 会话行不再显示「首字母 + 颜色」的方形项目头像。
- 分组标题为「目录图标 + 目录名 + 竖向省略号菜单」，整行可点击收起/展开该目录的会话。
- 收起态用 `folder`，展开态用 `folder-opened`（VS Code Codicons，MIT，四角改为锐角）；标题默认用会话的非激活样式，hover/pressed 复用会话标签的 overlay 效果。
- 收起状态持久化（与标签顺序同一存储，同一窗口内共享，刷新/重启后保留）。
- 分组内的会话行缩进一级：缩进做在行内 padding（`ps-7`）上，背景/hover/激活高亮仍是整行宽度，水平与非分组模式不受影响。
- 每个项目分组标题右侧有竖向省略号菜单：编辑 / 会话 / 关闭。
- 分组标题支持拖动排序。

菜单行为：

- 编辑：打开该项目的编辑页（`settings.openProject`）。
- 会话：进入主页并选中该项目。
- 关闭：与主页项目列表的「关闭」一致：项目移出列表并进入「最近关闭」，其会话标签保留。

### 已确认决策

| #   | 决策               | 结论                                             |
| --- | ------------------ | ------------------------------------------------ |
| 1   | 「关闭」语义       | 复用主页行为，仅关闭项目，保留会话标签           |
| 2   | 拖动排序的持久化   | 复用主页项目顺序（同一份持久化，主页顺序同步）   |
| 3   | 未在项目列表的会话 | 按所在目录合成分组，排在已添加项目之后           |
| 4   | 移动端抽屉         | 同样生效                                         |
| 5   | 折叠状态           | 持久化，随 `tabs.*` 存储按窗口保存               |
| 6   | 分组图标与样式     | 去掉字母+颜色头像；收起/展开用锐角化的 codicon folder / folder-opened |
| 7   | 目录菜单的「关闭」 | 只关闭该目录下的会话标签，不移除项目             |

### 实现

- 设置模型：`packages/app/src/settings/model.tsx`。
- 设置 UI：`packages/app/src/settings/general/general.tsx`；搜索目录：`packages/app/src/settings/search-catalog.ts`；文案：`packages/app/src/runtime/i18n/en.ts` 加英文源串，`zh.ts` 按本分支要求同步中文（见第 3 节）。
- 分组计算（纯函数）：`packages/app/src/shell/titlebar/tab-groups.ts`
  - 归属解析：草稿用 `directory`；会话用会话信息、pending 草稿目录或持久化目录；
  - 分组顺序：server 顺序 → 项目列表顺序 → 未知目录追加；
  - `projectMoveIndex` 把「可见分组的拖放位置」换算为全量项目索引后再调用 `projects.move`。
- 列表渲染与拖拽：
  - `packages/app/src/shell/titlebar/tab-strip.tsx` 只负责扁平列表（水平 + 垂直非分组），启用分组时渲染 `project-tab-list.tsx`；
  - `packages/app/src/shell/titlebar/project-tab-list.tsx` 用两层独立 `DragDropProvider`：外层只注册项目标题（拖完按 `projectMoveIndex` 换算全量索引后 `projects.move`），每个项目内部再套一个 provider 只注册该组会话（组内 `arrayMove` + `mergeVisibleTabOrder` 合回全局顺序）。两个排序轴互相不可见，项目可排序、会话不会被拖出项目；
  - 会话行组件抽到 `packages/app/src/shell/titlebar/tab-entry.tsx`（扁平与分组共用，带 `indent`）；
  - 收起的目录不参与可见标签序列，`mod+1..9` 与 Ctrl+Tab 循环会跳过其会话。
- 分组标题组件：`packages/app/src/shell/titlebar/project-tab-group.tsx`（目录图标开合态、整行折叠开关、菜单；「关闭」逐个关闭该组会话标签，不移除项目）。
- 折叠状态持久化：`packages/app/src/shell/tabs/schema.ts` 新增 `GroupCollapse`，`packages/app/src/shell/tabs/tabs.tsx` 用 `Persist.window("tabs.groups")` 保存并暴露 `groupCollapsed` / `toggleGroupCollapsed`。
- 会话行头像隐藏：`packages/app/src/shell/titlebar/tab-nav.tsx` 新增 `hideProjectAvatar`。
- 移动抽屉里分组标题与会话行保持同样的 44px 触控高度：`packages/app/src/shell/titlebar/titlebar.css`。
- 图标：`packages/ui/src/icons/icon/icon.tsx` 新增 `outline-dots-vertical`；`folder` 与新增的 `folder-opened` 取自 VS Code Codicons（MIT），并把圆角改为锐角（脚本将每段圆角替换为相邻边的交点）。

### 测试

- `packages/app/src/shell/titlebar/tab-groups.test.ts`：归属解析、分组顺序、移动索引换算。
- `packages/app/src/settings/model.test.ts`：默认值与旧数据迁移断言更新。
- 手工验证：桌面 dev 下切换垂直/分组、折叠/展开目录并刷新确认状态保留、标题 hover、会话缩进、拖动项目、菜单三个动作、水平模式回退、移动端抽屉。

验证记录：

- `packages/app`：`bun test src/shell/titlebar src/shell/tabs src/settings` 全部通过（103 项）。
- `packages/app`：`bun typecheck` 中 `src/**` 无错误；剩余报错只来自 `component-tests/**` 与 `../storybook/playwright/**`
  （本次按最小范围安装依赖，未安装 storybook workspace 的 `@playwright/test`，属环境依赖缺口，与改动无关）。
- `packages/desktop`：`bun typecheck` 中无 desktop 源码错误。
- `oxlint` 对改动目录 0 警告 0 错误。

## 2. 桌面端关闭自动更新

结论：关闭后不再检查更新、不再出现任何更新提示；发布包同样不内置更新源。

### 实现

- `packages/desktop/src/main/constants.ts`：`UPDATER_ENABLED = false`（本分支固定关闭；以后要恢复只改这一行）。
- `packages/desktop/electron-builder.config.ts`：移除 beta/prod 的 `publish` 配置，打包不再生成 `app-update.yml` 更新源文件（artifact 命名、签名、dmg/zip 目标不受影响；electron-updater 依赖保留但运行时已失效）。
- 设置页整个「更新」区块（含 Release notes 开关）在更新器禁用时隐藏：`packages/app/src/settings/general/general.tsx`。
- What's New 弹窗与 opencode.ai/changelog.json 拉取在更新器禁用时一并停用：`packages/app/src/shell/updates/highlights.tsx`。
- 设置搜索中的「检查更新」「Release notes」条目随更新器状态隐藏：`packages/app/src/settings/search-index.ts`、`search.tsx`。
- 更新器平台不创建后，启动检查、10 分钟轮询、标题栏更新按钮、原生对话框、菜单项均不会生效；命令面板的检查更新命令本就 `hidden`，无需改动。

## 3. 中文文案补充与术语修正

按本分支要求（上游规范是翻译另行评审，此处有意提前落地）：

新增键的中文：

- `settings.appearance.row.tabs.groupByProject.title` → 「按项目分组」
- `settings.appearance.row.tabs.groupByProject.description` → 「将会话标签归入各自的项目目录」
- `tab.group.sessions` → 「会话」
- `tab.group.collapse` / `tab.group.expand` → 「收起项目会话」/「展开项目会话」

顺带修正既有误译（简体 `zh.ts`）：

- `settings.timeline.category.shell`：「壳牌」→「命令」
- `session.background.moveRunning`：「移至背景」→「移至后台」（⇧B 提示上的实际文案）
- `session.background.shell.one` / `.other`：「{{count}}个shell」「{{count}}个贝壳」→ 统一「{{count}} 个 Shell」

繁体 `zht.ts` 未改：台湾用语「背景執行」本身正确。

## 4. 提供商管理与自定义提供商表单增强

### 服务端：配置文件写入 provider

- `packages/schema/src/config.ts`：`Config.Patch` 新增可选 `provider` 字段（`Record<providerID, 条目 | null>`，值为 opencode.json 的 v1 文件结构，`null` 表示删除该提供商）；`shell` 改为可选，只在传入时修改，避免客户端只写 provider 时误删 shell 设置。
- `packages/core/src/config.ts`：`Config.update` 按 `["provider", providerID]` 逐条 JSONC 编辑（新增/覆盖/删除），保留注释与无关内容；每次编辑基于当前文本顺序应用（jsonc-parser 拒绝同一对象上的并发编辑）。写入最高优先级**全局**配置文件后触发 reload。
- 已知限制：写入的是全局配置文件；若同名提供商定义在项目级配置中，项目级仍会覆盖全局的编辑结果。
- 客户端已重新生成（`packages/client` `bun run generate`）。
- 测试：`packages/core/test/config/config.test.ts` 覆盖新增/删除/注释保留/重载投影。

### 自定义提供商表单（新增与编辑复用同一弹窗）

- 协议格式选项：Compatible（`@ai-sdk/openai-compatible`，聊天补全）与 Response（`@ai-sdk/openai`，Responses API）。
- 模型行可展开（model-id 左侧箭头）：展开后分「Token 限制」（上下文默认 200000、输出默认 16000）与「模型属性」两块；模型属性为 `属性名 + JSON 值` 行，默认三行 `options = {"reasoningEffort":"high"}`、`modalities = {"input":["text"],"output":["text"]}`、`variants = {"high":{"reasoningEffort":"high"}}`，支持 `+` 新增、默认行可删除/修改，JSON 值非法内联报错；序列化时每行按 `模型[属性名] = JSON 值` 原样写入模型顶层（`limit` 恒写 context/output）。
- 同名提供商拒绝：保存时 providerID 与「运行中提供商列表 + 配置文件中的提供商」任一冲突即拒绝提交并内联提示（`provider.custom.error.providerID.exists`）；编辑模式下 ID 只读且排除自身。
- 编辑模式：从 `config.get()` 文档反解预填（`aisdk:` 前缀 → 协议、`settings.baseURL`/`apiKey`/`env`、模型 limit/settings/capabilities/variants），API 密钥回显（`{env:VAR}` 引用原样显示）。
- 保存：`config.update({ provider: { [id]: entry } })`，成功后失效并重取 provider/model 数据 + toast。
- 文案：en 新增源串、zh 同步中文；其余语言按上游惯例回退英文。

### 提供商列表 hover 菜单

- 「配置」与「自定义」徽标的提供商行（均来自配置文件定义）hover 显示竖向省略号菜单：编辑 / 移除（复用标题栏分组菜单的 `hover-reveal` 模式）。
- 编辑：连接提供商弹窗直接进入自定义表单编辑态；移除：确认对话框后从配置文件删除该提供商并刷新列表。
- 环境 / API 密钥 / 账号类型的行行为不变。

## 5. 左右布局下内容页顶部支持窗口拖动

- 左右布局（`appearance.tabLayout: "vertical"`）会隐藏全宽标题栏，此前唯一的拖动区是 macOS 侧边栏顶部的 28px spacer，主页 / 设置 / 会话页顶部无法拖动窗口。
- `packages/app/src/shell/shell.tsx`：`<main>` 内新增一条覆盖顶部 8px 间隙（`--shell-top-inset`）的 `data-tauri-drag-region` 拖动条，绝对定位、`z-50`，不遮挡卡片内容、无视觉变化；仅竖排布局且非 Windows 桌面时渲染（Windows 保留标题栏自身拖动区）。
- 顺带发现（未改）：Linux 竖排布局下侧边栏 spacer 仅 macOS 渲染，整个窗口没有可拖区域。

## 变更文件清单

| 文件                                                       | 变更                                     |
| ---------------------------------------------------------- | ---------------------------------------- |
| `packages/app/src/shell/shell.tsx`                         | 竖排布局下内容页顶部间隙作为窗口拖动区   |
| `packages/app/src/settings/model.tsx`                      | 新增 `appearance.groupTabsByProject`     |
| `packages/app/src/settings/model.test.ts`                  | 默认值断言更新                           |
| `packages/app/src/settings/general/general.tsx`            | 新增分组开关；更新器禁用时隐藏整个更新区块 |
| `packages/app/src/settings/search-catalog.ts`              | 新增设置搜索项                           |
| `packages/app/src/settings/search-index.ts` / `search.tsx` | 更新器禁用时隐藏更新相关搜索条目         |
| `packages/app/src/runtime/i18n/en.ts`                      | 新增英文文案                             |
| `packages/app/src/runtime/i18n/zh.ts`                      | 新增中文文案并修正 shell / 背景 术语     |
| `packages/app/src/shell/tabs/schema.ts`                    | 新增 `GroupCollapse` 持久化结构          |
| `packages/app/src/shell/tabs/tabs.tsx`                     | 折叠状态持久化与 `groupCollapsed` API    |
| `packages/app/src/shell/titlebar/tab-groups.ts`            | 新增：分组与排序换算                     |
| `packages/app/src/shell/titlebar/tab-groups.test.ts`       | 新增：单元测试                           |
| `packages/app/src/shell/titlebar/tab-strip.tsx`            | 只负责扁平列表；分组时渲染新组件         |
| `packages/app/src/shell/titlebar/project-tab-list.tsx`     | 新增：分组列表与两层隔离拖拽             |
| `packages/app/src/shell/titlebar/tab-entry.tsx`            | 新增：扁平/分组共用的会话行组件          |
| `packages/app/src/shell/titlebar/project-tab-group.tsx`    | 新增：可折叠分组标题与菜单               |
| `packages/app/src/shell/titlebar/tab-nav.tsx`              | 会话行可隐藏头像、支持缩进               |
| `packages/app/src/shell/titlebar/titlebar.css`             | 移动抽屉里分组标题的触控高度             |
| `packages/app/src/shell/updates/highlights.tsx`            | 更新器禁用时停用 What's New 弹窗         |
| `packages/app/src/providers/credentials/form.ts`           | 协议格式、模型展开配置、校验、编辑预填   |
| `packages/app/src/providers/credentials/form.test.ts`      | 测试随表单能力更新                       |
| `packages/app/src/providers/credentials/dialog.tsx`        | 配置读写接入（同名拒绝、编辑、保存落盘） |
| `packages/app/src/providers/connect/dialog.tsx`            | 连接弹窗控制器支持编辑模式               |
| `packages/app/src/settings/providers/providers.tsx`        | 配置/自定义行 hover 菜单与移除确认       |
| `packages/ui/src/icons/icon/icon.tsx`                      | 新增 `outline-dots-vertical` / `folder-opened`，`folder` 改用锐角 codicon |
| `packages/schema/src/config.ts`                            | `Config.Patch` 支持 provider 增删        |
| `packages/core/src/config.ts`                              | `Config.update` 应用 provider 补丁       |
| `packages/core/test/config/config.test.ts`                 | provider patch 测试                      |
| `packages/client/src/**`（生成文件）                       | 随协议变更重新生成                       |
| `packages/desktop/src/main/constants.ts`                   | `UPDATER_ENABLED` 固定关闭               |
| `packages/desktop/electron-builder.config.ts`              | 移除 beta/prod publish，不再生成 app-update.yml |

## 6. 合并上游 v2.0.17 / v2.0.18

- **版本号随官方走**：合并官方 release 提交后，根与所有 workspace 的 `version` 均为 `2.0.18`（2.0.16 → 2.0.18），fork 不再单独维护版本号。
- 合并官方 tag `v2.0.18`（内容含 v2.0.17）：相对 fork 基线 `c1f50659a7` 共 65 个上游提交。`upstream/v2` 分支 tip 另有 4 个未发布提交（含 TUI MCP 模型选择修复），本次不取，留给下次同步。
- 上游主要内容：app 队列提示词撤销回输入框、提供商账号切换、会话项目图标解析统一；ai 媒体客户端统一重构与一批厂商/媒体修复；core Console 托管 MCP、工具名放宽、shell 信号上报；tui OpenTUI 0.5.12、大 diff 虚拟化、fs.watch 防崩；codemode WeakMap/WeakSet 与 test262 支持等。
- 唯一需要手工整合的文件：`packages/app/src/settings/providers/providers.tsx`。
  - 双方改写了同一区域：上游新增「账号切换」菜单，fork 新增「编辑 / 移除」菜单。
  - 合并后的显示顺序为 `canManageAccounts` → `configDefined` → `canDisconnect` → 环境提示：有 credential 的提供商显示账号菜单；config / custom 提供商显示编辑/移除菜单；其余保持断开按钮或环境提示。两者天然互斥（有 credential 时 `source()` 不会是 config/custom），行为互不影响。
- `packages/app/src/runtime/i18n/en.ts`（双方各自加键）与 `packages/app/src/shell/titlebar/tab-nav.tsx`（上游仅改 `projectForSession` 调用）为自动合并。
- `packages/client` 生成文件合并后执行 `bun run generate`，无差异。
- `bun install` 同步上游依赖变更（`bun.lock` 由上游更新，fork 未改动，无冲突）。
- 后续同步策略：直接 `git merge v2.0.x`；本次采用 merge commit，未 rebase fork 提交。

验证：

- `bun run check`（根目录，lint + 全量 typecheck）通过（EXIT=0）。
- 合并结果相对 `v2.0.18` 的差异文件 = fork 功能改动的 101 个文件，无多余、无丢失。
- 包级测试与合并前对比无回归：`packages/app` 937 → 941 项（上游新增 4 项），失败项相同（1 项本地环境）；`packages/core` 40 项失败、`packages/desktop` 8 项失败在合并前后完全一致（ripgrep / shell / watcher / browser 集成等环境依赖）。

## 7. 合并上游 v2.0.19 / v2.0.20

- **版本号随官方走**：合并后根与所有 workspace 的 `version` 均为 `2.0.20`（2.0.18 → 2.0.20）。
- 分两次合并：`v2.0.19` 见 `bf43bb3293`（tag 范围内 53 个上游提交，含 release 提交）；`v2.0.20` 见 `43e9fc4448`（30 个上游提交，不含 `sync release versions for v2.0.19`——它与已合并的 v2.0.19 release 提交内容完全一致，diff 为空）。
- 上游 tag 拓扑有个坑：`v2.0.19` 的 release 提交与 v2.0.20 那条线（`sync release versions for v2.0.19`）同父于 `ca084b2430`，内容相同但**互不为祖先**。所以 `git merge v2.0.20` 的 merge base 仍是 `ca084b2430`，版本号文件会再次冲突，属预期。
- 冲突共 38 个：37 个 `package.json` 的 `version` 字段 + `bun.lock`。全部按上游 `2.0.20` 取值——fork 侧对这些文件只有版本号改动（`git diff ca084b2430 bf43bb3293` 里除 `"version"` 外无其他行），因此不存在功能改动被覆盖的问题。
- 双方都改过的源文件只有 4 个，全部自动合并：`packages/app/src/providers/connect/dialog.tsx`、`packages/app/src/runtime/i18n/en.ts`、`packages/client/src/effect/api/api.ts` 与 `packages/client` 生成文件。
  - `dialog.tsx` 是唯一需要人工确认的：上游加了 ChatGPT 引导弹窗（`chatgptWelcome` 状态、`DialogChatGPTPlanWelcome`、`onConnected(methodID)`），fork 加了自定义提供商编辑模式（`controller.editProvider`、`Edit` 分支）。合并后两者共存；`onCloseAutoFocus` 由「提前 return」改成两段独立判断，`completed` 与 `chatgptWelcome` 各自触发，语义与两侧原意一致。
- 上游主要内容：
  - **v2.0.19**：core/ai 侧请求输出 token 上限 256k 与按上下文窗口计算输出上限、prompt-cache 复用（去掉 session ID、调整指令顺序）、provider 亲和头共享、Cloudflare 环境 ID 兜底、provider 路由 ID 去重；ai 队列生成的重试/恢复/取消、ElevenLabs Scribe 转写路由、Gemini thought signature 保留、按 provider 错误码分类终止失败、xAI Responses 推理摘要；cli `--session` 指向不存在的会话时创建、auth 选择器与 MCP auth 共用分组、ctrl+c 取消认证；tui open 选择器项目去重、后台 shell 与中断命令区分、diff 查看器支持「最后一轮来源」；仓库 host 相对路径段拒绝、shell 工具环境对齐、清理死代码与转发 shim、models.dev 快照刷新。
  - **v2.0.20**：cli 新增 `auth export` / `auth import`（协议 + schema + server handler + 生成客户端）、可禁用后台服务、`run` 拒绝权限询问后继续且子代理询问/并行拒绝不再中断；core 新增 ChatGPT token-sharing OAuth 方式（`plugin/provider/chatgpt.ts`）并按更新后的合作方指南对齐、会话错误保留 provider 响应体、数据库文件权限限制为属主、Console 重新登录提示；app 新增 ChatGPT token-sharing 引导与用量上限弹窗；ai 修正 Bedrock thinking 块绑定与 redacted reasoning 收尾、Mistral thinking 元数据延迟到块末、Workers AI 经 chat template 关闭 thinking、更多 message protocol 路由启用显式缓存、provider 错误体解析与展示；tui 新会话菜单显示「最近关闭」、低活跃度错误改用 disclosure 图标；ui/session-ui/desktop 弱化 diff 词高亮（@pierre/diffs 1.5.1）、moved notice 改为时间线分隔、Electron 44.4.5、隔离 dev 服务固定端口。
- 依赖变更：`packages/core` 新增 `jose` 6.0.11（ChatGPT OAuth 校验 JWKS），`@pierre/diffs` 1.2.10 → 1.5.1，`electron` 44.4.3 → 44.4.5。
- `upstream/v2` 分支 tip 另有 15 个未发布提交（app 会话引用跳转、desktop 页内浏览器批注等），本次不取，留给下次同步。
- 后续同步策略不变：直接 `git merge v2.0.x`，采用 merge commit，不 rebase fork 提交。

验证：

- `bun install` 同步上述依赖；安装后 `bun.lock` 与合并结果逐字节一致（`git diff bun.lock` 为空）。
- `packages/client` 执行 `bun run generate`，无差异（生成文件与协议一致）。
- `bun run check`（根目录，lint + 全量 typecheck）通过：35/35 tasks successful，EXIT=0。
- 合并结果相对 `v2.0.20` 的 103 个差异文件全部落在 fork 功能改动集合内，无多余文件；fork 合并前的改动无丢失（差异仅剩按上游取值的版本号文件）。
- 包级测试（合并前后对比）：
  - `packages/app`：941 通过 / 1 跳过 / 1 失败。唯一失败 `bootstrap.test.ts > recovers project metadata after the connection to the server is dropped` 在合并前源码下同样失败（已用 `git checkout bf43bb3293 -- packages/app packages/client` 复现），属本机回环 socket 环境问题，非本次合并引入。
  - `packages/core`：5520 通过 / 41 跳过 / 46 失败 / 1 error。合并后的失败集合是合并前（51 项）的**真子集，无新增失败**；合并前多出的 5 项（`ChatGPTPlugin` 3 项、`Database file permissions` 2 项）是重建合并前状态时的假象——这三个测试文件由 v2.0.20 新增，回退源码时它们仍留在磁盘上，于是跑在被回退的实现上必然失败，在真实合并结果中全部通过。
  - 46 项失败集中在 ripgrep / search tools、pty、ShellTool 复合语法、PluginSupervisor reload、watcher、SSE、MCP 连接，全部依赖子进程、socket 或文件系统监听，与第 6 节记录的本地环境基线同类（本次未逐个追查）。

## 8. 分组侧栏独立组件化：主色文字、相对时间与溢出模糊渐隐

按项目分组开启时，左侧栏的「主页 / 新建会话 / 会话列表」整体切换为一套独立组件，不再复用上游共享的垂直布局内联代码；非分组（扁平）垂直布局与移动端抽屉保持上游原样。

### 实现

- 新组件 `packages/app/src/shell/titlebar/project-group-sidebar.tsx`：
  - `ProjectGroupSidebar` 组合三部分：`ProjectGroupSidebarHome`（主页按钮）、`ProjectGroupSidebarNewSession`（新建会话按钮）、`ProjectTabList`（既有分组列表）；主页/新建会话从 `titlebar.tsx` 的内联写法提为组件，回调（`toggleHome` / `openNewTab`）仍由 titlebar 传入。
  - 列表自带滚动容器（`overflow-y-auto` + `no-scrollbar`），上下边缘按溢出状态做两层效果：滚动节点上的 24px alpha 渐变 mask（`mask-image: linear-gradient`，与 ZCode 的 ScrollFadeViewport 同方案）+ 边缘 `backdrop-filter: blur(6px)` 且自身带渐变 mask 的模糊覆盖层（ZCode 源码实际只有透明度渐隐、没有模糊，模糊层为 fork 增强）。溢出状态由 scroll 监听 + ResizeObserver（观察滚动节点与内容节点）驱动，滚到边缘时对应侧的 mask/模糊自动消失。
  - 根节点带 `data-tab-grouped="true"`，供 CSS 限定分组侧栏样式。
- 配色：`tab-nav.css` 新增 `[data-tab-grouped="true"] [data-slot="tab-link"] { color: var(--v2-text-text-base) }`——分组侧栏内会话/草稿行常态即主色（亮色主题近黑），不再等 hover/激活；「项目(N)」标签与分组标题保持灰色。主页/新建会话按钮在新组件内直接用主色，右侧快捷键提示常态显示并缩小一号（11px）；「项目(N)」右侧的「+」图标用 `size="small"`（14px），按钮尺寸不变。
- 相对时间：分组侧栏的会话行右侧显示最后活跃时间（`session.time.updated`），小字（11px）灰色、垂直居中。所有行（含激活行）统一为 hover 才显示关闭按钮：hover/编辑/触屏时时间标签以 display 互换直接从布局移除（ZCode TaskListItem/GroupedTaskRow 同款，无任何宽度动画），标题自然延伸、关闭按钮淡入。关闭按钮的「激活行常显」规则在显示时间的行里关闭（仍作用于其他模式与草稿行）；分组内激活未 hover 的行标题渐隐带回落到 4px（上游 24px 是为常显关闭按钮留位的）。文案复用既有 `common.time.justNow` / `minutesAgo.short` / `hoursAgo.short` / `daysAgo.short`（zh：刚刚/n分钟前/n小时前/n天前），无新增翻译键；`getRelativeTime` 改为接受 `string | number`。
- 切换点：`titlebar.tsx` 垂直 Portal 内按 `settings.appearance.groupTabsByProject()` 切换 `<ProjectGroupSidebar>` 与原有内联结构（fallback）。
- 透传链：`ProjectTabList` 新增 `showSessionTime`（默认关闭，移动端抽屉的分组列表不受影响），经 `ProjectGroupTabs → TabStripEntry → SessionTabEntry → SessionTabSlot` 传入 `TabNavItem` 渲染。

### 不变

- 非分组垂直布局、水平标签栏、移动端抽屉的代码路径未动（抽屉里的分组列表继续走 `tab-strip.tsx` 的分组分支：无时间标签、无 recolor、无渐隐）。
- i18n：无新增键。

## 9. OpenCode 主题用户气泡改中性灰

上游把普通目录会话（`data-local-session`）的用户气泡做成蓝系（浅色 `blue-100` 底 + `blue-700` 亮蓝字；深色 `blue-1200` 海军蓝底 + `blue-300` 蓝字，来自上游 #46538 / #47009），观感与整体灰阶界面冲突，fork 改为中性灰：浅色 `grey-200`（#F2F2F2）底 + 正文黑字，深色 `grey-900`（#2E2E2E）底 + 正文近白字。workspace（worktree）会话的纯蓝气泡与其他 35 个内置主题的观感均保持不变。

### 实现

- 新增一对语义 token `v2-background-bg-user-message` / `v2-text-text-user-message`，按 AGENTS.md 的语义角色原则走完整 token 链：`packages/ui/src/theme/v2/mapping.ts` 提供默认值（沿用上游蓝系取值，其他主题视觉不变），`packages/ui/src/styles/tokens/theme.css` 四个静态兜底块（`:root`、注释的 OS 偏好 dark 兜底、`[data-color-scheme="light"]`、`[data-color-scheme="dark"]`）同步补齐。
- `packages/ui/src/theme/themes/oc-2.json` 在 light/dark 的 `v2Overrides` 里把这对 token 覆盖为中性灰（引用 `--v2-grey-200` / `--v2-grey-900` 与 `--v2-text-text-base`，不硬编码 hex）。
- `packages/session-ui/src/components/message-part.css`：原来按 `[data-color-scheme]` 分裂的两条 local 气泡规则合并为一条，改引新 token（变量随主题注入自动切换浅/深）；workspace 规则（`--v2-background-bg-accent` + `--v2-text-text-contrast`）未动。

### 不变

- workspace 会话气泡、mention 前缀色（`--v2-blue-500`）、默认（非 local/workspace）气泡、其余主题。

## 10. 会话标签相对时间：改用 `time.idle` + 共享 60s 刷新

### 背景

标签右侧的最后活跃时间（第 8 节引入）原取 `session.time.updated`，而它的语义是元数据/入队时间（提示词入队、改名、模型/agent/权限、移动、目录解析等都会 bump），**不含助手回复与回合结束**；实测还有老会话被目录解析等非对话写入 bump 的情况。另外 `getRelativeTime` 只在渲染时计算，文案不会随时间自己变老。

### 实现

- `packages/app/src/shell/titlebar/tab-nav.tsx`：`sessionTime()` 改为 `max(session.time.idle, 已加载消息最后一条时间)`。`time.idle` 由服务端在每轮 execution 终态投影写入（`packages/core/src/session/projector.ts` 的 `projectIdle`），重启后未加载消息的标签也有值；assistant 消息用 `time.completed ?? time.created`，其他类型用 `time.created`；两者都取不到时不渲染（`<Show>` 空）。
- 每轮结束客户端在 `session.execution.*` 终态重取 session（`packages/client/src/solid/data.ts`），标签自动跳到「刚刚」。
- 新增 `packages/app/src/shell/clock.ts`：共享 `now` 信号 + 引用计数的 60s interval（`clockNow()` / `useClock()`）。
- `packages/app/src/shell/time.ts`：`getRelativeTime(date, t, now = Date.now())` 增加可选第三参（原有调用行为不变）。
- 接入 tick：`tab-nav.tsx`（会话标签）、`packages/app/src/settings/workspaces/workspaces.tsx`（工作区最近活跃/会话时间）、`packages/app/src/shell/commands/dialog.tsx`（命令面板最近会话）。

### 不变

- 服务端、协议、数据库无改动；i18n 无新增键。
- `time.updated` 的语义与其他使用处（会话排序、workspaces/命令面板的时间来源）未动。
