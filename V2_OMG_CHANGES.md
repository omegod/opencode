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
- 分组标题为「目录图标 + 目录名 + 竖向省略号菜单 + 新建会话按钮」，整行可点击收起/展开该目录的会话。
- 收起态用 `folder`，展开态用 `folder-opened`（VS Code Codicons，MIT，四角改为锐角）；标题默认用会话的非激活样式，hover/pressed 复用会话标签的 overlay 效果。
- 收起状态持久化（与标签顺序同一存储，同一窗口内共享，刷新/重启后保留）。
- 分组内的会话行缩进一级：缩进做在行内 padding（`ps-7`）上，背景/hover/激活高亮仍是整行宽度，水平与非分组模式不受影响。
- 每个项目分组标题右侧有竖向省略号菜单：编辑 / 所有会话 / 关闭。
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

## 2. 桌面端自动更新（本节已被 §12 取代，历史记录保留）

> 本节记录早期状态（曾完全关闭更新器）。现已恢复：prod 渠道从本仓库 GitHub Releases 自动更新，见 [§12](#12-桌面端自动更新指向-fork-releases)。

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
- `tab.group.sessions` → 「所有会话」（en 源 `Sessions` → `All Sessions`）
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
| `packages/desktop/src/main/constants.ts`                   | `UPDATER_ENABLED` 仅 prod 渠道开启（见 §12） |
| `packages/desktop/scripts/make-latest-mac-yml.ts`          | 新增备用：手动补生成 `dist/latest-mac.yml`（见 §12） |
| `packages/desktop/electron-builder.config.ts`              | prod 配 github publish（omegod/opencode），生成 app-update.yml（见 §12） |

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

## 11. OpenCode2 亮色内容页背景改 `#fafafa`

### 背景

OpenCode2（`oc-2-translucent`）亮色下 `v2-background-bg-base` 指向 `v2-grey-50`（纯白 `#fff`），会话内容卡片整块纯白，太亮。ZCode 亮色（`ZCode/packages/ui/src/styles.css`）内容背景为 `neutral-50 = #fafafa`，纯白只留给卡片/输入框/浮层。

### 实现

- `packages/ui/src/theme/themes/oc-2-translucent.json`：亮色 `v2-background-bg-base` 改为 `var(--v2-grey-100)`（`#fafafa`），与 ZCode 默认亮色内容背景一致。
- 引用该 token 的内容面（会话框、新会话、side-panel、review、composer 等）自动跟随；卡片与 shell 同色后靠现有圆角 + `elevation-raised` 投影区分。

### 不变

- 仅 `oc-2-translucent` 亮色；暗色、`oc-2`、其他主题不动。
- 根背景（`context.tsx`、index.html fallback）本来就是 `#fafafa`；artifact iframe 的 `bg-white` 是文档画布，保留。

## 12. 桌面端自动更新指向 fork Releases

### 背景

第 2 节曾把桌面更新器完全关闭（`UPDATER_ENABLED = false` + 移除 publish）。现在恢复：prod 渠道从本仓库（`omegod/opencode`）的 GitHub Releases 自动更新；dev/beta/本地运行仍不检查（它们没有 publish 配置、打不出 `app-update.yml`）。

### 机制（已验证 electron-updater 6.8.9 源码）

- 运行时门控（v2.0.22 合并后）：上游 `packages/gui-extensions/src/updater/main.ts` 用 `app.packaged && app.channel !== "dev"` 决定是否加载更新器；fork 原 `UPDATER_ENABLED` 常量已随合并删除。对 fork 实际发布的渠道行为不变：prod 打包启用；dev/本地不打包、不启用。
- `packages/desktop/electron-builder.config.ts`：prod 配 `publish: { provider: "github", owner: "omegod", repo: "opencode", channel: "latest" }`。打包（即使 `--publish never`）也会生成：包内 `Contents/Resources/app-update.yml`（更新源，标准机制）+ `dist/latest-mac.yml`（渠道清单）。注意 `publish` 必须显式存在：直接删掉 electron-builder 会回退读根 `package.json` 的 `repository` 字段（指向上游 `anomalyco/opencode`）并照样嵌入一个指错地方的 `app-update.yml`。
- `packages/desktop/scripts/make-latest-mac-yml.ts`：备用脚本，手动补生成与 electron-builder 同格式的 `dist/latest-mac.yml`（正常打包已自动生成，不用每次跑；校验或补发时用）。
- 检查流程：启动 + 每 10 分钟轮询。先读 `releases.atom`，再取 `releases/latest`（GitHub 按**创建时间**、排除 prerelease/draft 的最新 release，与 semver 无关），从 `releases/download/<tag>/latest-mac.yml` 读版本号与文件清单，再按 `latest-mac.yml` 版本与当前版本比较（相等则无更新；不等则提示，`allowDowngrade = true` 使降级也提示）。
- macOS 安装经 Squirrel.Mac：下载 zip（sha512 校验）→ 用户确认 → 退出时替换。签名必须与已安装包一致（始终用同一 `RedixDevCert`，有效期到 2036）。
- 用户确认制：`autoDownload = false`，先提示再下载、下载完再提示重启；设置页「更新」区块与 What's New 随更新器状态自动出现（`highlights.tsx` 拉的是 `opencode.ai/changelog.json`，显示上游更新说明，属已知 cosmetic 差异）。

### 版本号约定

- fork 发布用 `<上游版本>-fork.<N>` 后缀：`2.0.21` → `2.0.21-fork.1` → `2.0.21-fork.2`；合并上游 `2.0.22` 后用 `2.0.22-fork.1`（主版本占优，单调递增成立）。
- 当前 store 安装的 `2.0.21` 包内无 `app-update.yml`，永远不会自动检查，需要**最后手动安装一次**带更新器的包，之后进入自动更新。
- 版本号不在仓库里递增：`packages/desktop/package.json` 保持 `2.0.21`（`bun.lock` 不动），打包时用 `-c.extraMetadata.version=<版本>` 注入（electron-builder 的 `extraMetadata` 在 `AppInfo` 构造前 merge，Info.plist、`latest-mac.yml`、asar 内 package.json、`app.getVersion()` 全都一致）。`OPENCODE_VERSION` 环境变量同步传同一值（renderer sentry 标签用）。

### 发版资产清单（每个 GitHub Release 必备）

1. tag 即版本号（如 `v2.0.21-fork.1`），release **不要勾 prerelease/draft**（否则 `releases/latest` 取不到，更新器报 `ERR_UPDATER_CHANNEL_FILE_NOT_FOUND`）。
2. 附件必须包含 `dist/latest-mac.yml`（打包自动生成；`make-latest-mac-yml.ts` 可手动补生成/校验）+ `opencode-desktop-mac-arm64.zip` + `opencode-desktop-mac-arm64.zip.blockmap`（差分下载用；缺 blockmap 回退全量，一般直接一起传）。dmg 供手动安装，可附带。
3. `latest-mac.yml` 的版本号/sha512 必须与**同一次构建**的 zip 严格对应：一次构建、原样上传，不要重新打包。
4. 新 release 按创建时间成为 `latest`：发版顺序保持版本单调递增；不要事后给旧版本建 release（会把它变成 latest 导致回滚提示）。

### 不变 / 范围外

- CLI 更新器（`packages/cli/src/services/updater.ts`）硬编码 `opencode.ai`，本次不动；终端用 fork CLI 如被提示官方更新，可配 `"update": "disable"`（或 `OPENCODE_DISABLE_AUTOUPDATE`）屏蔽。
- 打包仍用 `electron-builder.local.ts`（`RedixDevCert` 自签、`hardenedRuntime: false`、`notarize: false`），签名身份不变是自动更新的前提。

## 13. 分组组件修复：批量关闭会话与添加项目弹层挂载闪烁

1. 关闭分组后组内会话不会全部关闭。
   - 根因：分组头「关闭」原先循环 `onClose(tab)` → `closeTab(index)`，而 solid-js 客户端构建的 `startTransition` 在微任务执行（`Promise.resolve().then`），同步循环中按未更新的 store 捕获的 index 在后续 `splice` 时全部错位：后执行的删除会删错相邻标签或越界 no-op（实测关闭一组会留下部分组内标签，并可能误关其他项目的标签）。
   - 修复：`packages/app/src/shell/tabs/tabs.tsx` 新增 `closeTabs(targets)` 批量动作，在**单次** `startTransition` + `produce` 内按 `tabKey` 从尾到头删除；导航只算一次（锚点为第一个被删位置，取删除后的 `tabs[anchor] ?? tabs[anchor-1]`）；统一入「最近关闭」栈、清理 memory/info/panes/草稿持久化。`project-tab-list.tsx` 把 `tabs.closeTabs` 传给分组头，`project-tab-group.tsx` 的「关闭」改为一次批量调用。
2. 切换到按项目分组时，添加项目按钮的弹出层闪烁出现。
   - 根因：`ProjectGroupAdd` 用 `forceMount` 让菜单常驻（`tab-nav.css` 在 `data-closed` 上播关闭动画并以 `forwards` 隐藏）。但元素挂载时就带 `data-closed`，该关闭动画同样会在挂载时播放且起始帧是 `opacity: 1`，于是每次分组列表挂载都会闪现整个弹层再淡出 150ms。
   - 修复：`project-group-add.tsx` 用 `onOpenChange` 记录是否打开过，并在 `Menu.Content` 输出 `data-opened`；`tab-nav.css` 拆成两条规则——首次打开前 `animation: none; visibility: hidden`（不播关闭动画，也不预支 `menu-v2-in`，首次打开仍正常淡入），打开过之后 `[data-closed][data-opened]` 才播关闭淡出。

验证：`packages/app` `bun typecheck` 通过；`bun test src/shell/tabs src/shell/titlebar src/settings` 与修改前基线一致（3 个 import 期报错为仓库现有环境问题，与本次无关）；oxlint 改动文件 0 警告。手工验证：分组头菜单关闭 → 组内标签全关、其他项目不受影响、`mod+shift+t` 可逐个恢复；切换「按项目组分组」不再闪现弹层，点击 + 的打开/关闭动画正常。

## 14. 分组侧栏：等待用户确认时保留 loading 并叠加蓝点

- 现象：按项目分组时，会话等待权限请求 / question 表单（需要用户确认）期间行内没有任何标记。原因是非分组模式靠头像上的未读蓝点表达状态：`useSessionTabAvatarState` 在 `needsAttention` 时把 `loading` 置 false 切到头像；而分组行（`hideProjectAvatar`）没有头像槽，指示器随之消失。
- 修复：`packages/app/src/shell/layout/project-avatar-state.ts` 在原有 `unread`/`loading` 之外暴露 `attention`（= `needsAttention`，仍受 `permissions.autoApprove` 抑制）；`packages/app/src/shell/titlebar/tab-nav.tsx` 的分组指示器改为 `loading() || attention()` 时显示，`attention()` 时在 spinner 右上角叠加 6px 强调色圆点（样式在 `tab-nav.css`，几何与头像未读点一致，用 `inset-inline-end` 随 RTL 镜像）。非分组模式与 Home 列表行为不变；折叠分组的聚合蓝点本次不做。

## 15. 合并上游 v2.0.22（GUI 功能内置扩展化）

上游 `v2.0.21..v2.0.22` 共 76 个提交，核心是 #52369 把 SSH 连接、浏览器面板、更新器 UI、debug bar 等 GUI 功能搬进新包 `packages/gui-extensions/`（内置扩展），另有 ACP Effect 化、一批 provider/ai 修复。合并原则：以 fork 新增特性为主，破坏性取舍经确认：更新器 UI 跟随上游扩展结构，vibrancy 取色在新扩展中重写。

### 冲突与解决（109 个文件）

- **37 × `package.json` + `bun.lock`**：版本行 `2.0.21` vs `2.0.22`，取上游后 `bun install` 重生成 lock（fork 对 package.json 无提交改动）。
- **63 × i18n**：上游删除 `ssh.*` 等键族，fork 有新增键（provider 表单、分组侧栏、project picker 等）。用键级三路合并处理：上游删除生效、fork 新键回填、fork 改值保留；`zh.ts` 额外清掉 12 个上游已删除的失效 `pair.*` 键与 `command.server.pair`。
- **8 个代码文件**：
  - `desktop/src/main/constants.ts`：删除 fork 的 `UPDATER_ENABLED`（上游已移除该常量；运行时门控改由 `gui-extensions/src/updater/main.ts` 的 `app.packaged && app.channel !== "dev"` 承担，对 fork 发布渠道行为一致）。
  - `settings/model.tsx`：保 `groupTabsByProject` 默认值（schema/默认/store 三处）。
  - `settings/workspaces/workspaces.tsx`：保 `useClock()`（相对时间刷新）+ 上游 `useExtensionServices()`。
  - `shell/shell.tsx`：保 fork 垂直标签顶部拖拽区 + 取上游 `ExtensionServerCover`。
  - `titlebar.tsx`：取上游（update pill 移除、`TitlebarStatusItems` 接管）；fork 分组侧栏分支完整保留。
  - `tab-strip.tsx`：保留 fork 结构，套用上游两处改动（`isTabCloseTarget` → `[data-slot="tab-close"], [data-action], [contenteditable="true"]` 选择器）。
  - `settings/general/general.tsx`：取上游（`UpdatesSection` 移除、`ExtensionSettingSections` 接管）。
  - `session/browser/pane.tsx`：上游删除（面板搬迁），接受删除。

### 合并后的适配（自动合并但接口已变）

1. **更新器「禁用时隐藏」修复废弃**：上游移除 `platform.updater`，更新区块改由 `gui-extensions/src/updater` 扩展渲染（按钮禁用而非隐藏）。`search.tsx` / `search-index.ts` / `highlights.tsx` / `search-results.test.ts` 中 fork 的 `updatesEnabled` 逻辑随上游移除。
2. **vibrancy 取色移植**：旧 pane 的圆角背景取色随文件删除；在 `gui-extensions/src/browser/panel.tsx` 用官方 `SurfaceProps.background` 重写——vibrancy（`data-vibrancy="true"`，macOS）时读 `[data-slot="shell-root"]` 的 computed background-color（半透明 chrome 色），由 `MutationObserver` 跟踪 `data-theme`/`data-color-scheme`/`data-vibrancy` 变化重算；非 vibrancy 返回 `undefined` 走宿主默认，其他主题行为不变。
3. **迁移符号修正**：`displayName` / `getProjectAvatarSource` / `getProjectAvatarVariant` 从 `@/shell/layout/helpers` 改从 `@opencode/ui/project-avatar` 导入（`tab-groups.ts`、`project-group-add.tsx`）；`tab-gesture.ts` 被上游删除，`project-tab-list.tsx` 的关闭按钮守卫改用内联选择器（与 tab-strip 一致）。
4. **zh 简体中文补全（合并后）**：上游 `settings.guiExtensions.*`（设置「Extensions」页）与 `gui-extensions/src/pairing`（设置「配对」页）只有 en（其余扩展均为全语言），补齐 `app/src/runtime/i18n/zh.ts` 7 键；新增 `gui-extensions/src/pairing/i18n/zh.ts`（沿用旧 fork `pair.*` 译法）并在 `pairing/index.ts` 注册按需加载。

### fork 特性保留清单（已核对）

分组侧栏全链（分组/折叠/相对时间/蓝点/批量关闭/加项目）、electron-builder `omegod/opencode` prod feed（更新门控随上游移入 `gui-extensions/src/updater`）、oc-2 与 OpenCode2 主题、灰气泡、vibrancy 样式与 `data-vibrancy` 标记、`tabs.groups` 折叠持久化、client `ConfigUpdate.provider`（provider 表单数据通道）、provider 自定义表单与 zh 翻译。

### 环境注意

上游 v2.0.22 新增 `script/oxlint/anti-slop` 的 `.ts` JS 插件，`bun run check` 的 lint 步骤需要 **node ≥ 24**（本机默认 nvm v22.16 会报 `ERR_UNKNOWN_FILE_EXTENSION`，用 `nvm use 24` 后可过；与合并本身无关）。lint 通过为 0 error（约 1.7 万条 warning 为上游 anti-slop 基线）。

### 验证

`bun run typecheck` 全 36 workspace 通过；`bun run lint` 0 error；`packages/app` 单测 738 pass、`packages/gui-extensions` 单测 94 pass + 1 skip。桌面端手工冒烟（更新入口、SSH 扩展、浏览器面板圆角、分组侧栏、OpenCode2 主题）待验收后提交。

## 16. 合并上游 v2.0.23 / v2.0.24

上游 `v2.0.22..v2.0.24` 共约 181 个提交（v2.0.23 ≈130 个：ACP 大改造、core v1 清理与 noUnusedLocals、PTY 修复、Cohere/Venice/Bedrock Mantle 等 provider 接入；v2.0.24 ≈50 个：OpenAI OAuth→Codex 改名、AI SDK v6 providers 默认安装、Vercel AI Gateway、gui-extensions Point→Registry、tab prompt 脉冲、pending 用户消息中性样式）。上游 main 与 v2.0.22 tag 线 diverged（behind 1，tag commit 不在 main 线），版本字段冲突与 v2.0.19 合并同模式。

### 冲突与解决（52 个文件）

- **38 × `package.json` + `bun.lock`**：版本字段，全取上游（fork 对这些文件无提交改动）。
- **13 个代码文件 + 1 文档**：
  - `ui/src/theme/context.tsx`：保 fork 默认主题 `oc-2-translucent`。
  - `desktop/src/main/windows/appearance.ts`：保 fork 的 `frameBackgroundColor()` 取色包装（上游仅空行）。
  - `ui/src/icons/icon/icon.tsx` + 新 `ui/src/icons/catalog.ts`：上游把图标表搬进 catalog 并改用 sprite；icon.tsx 取上游新结构，fork 图标并入 catalog（平方化 Codicon `folder` + 新增 `folder-opened`、`outline-dots-vertical`，其余 58 键上游已内置）。
  - `gui-extensions/src/browser/panel.tsx`：保 fork 改动，import 清掉未使用的 `createEffect`/`untrack`（上游新 anti-slop 规则禁止扩展代码直接用 createEffect）。
  - `gui-extensions/src/pairing/index.ts`：采用上游新 SDK 结构（`provides`/`stores`），保留 fork 的 zh 按需加载；`README.md` sdk-docs 校验块同步。
  - `shell/tabs/schema.ts`：保 fork `GroupCollapse` 持久化。
  - `shell/layout/project-avatar-state.ts`：保 fork `attention` 返回值。
  - `titlebar/tab-nav.tsx`：保 fork 运行指示器（loading+确认蓝点），并入上游 `promptPulse`（后台 tab 收到 prompt 时脉冲一次，`session.inbox.enqueued` 驱动）。
  - `titlebar/tab-strip.tsx`：整体取 fork 重写版（上游仅改旧内联结构与格式）；其行为变化移植进 fork 的 `tab-entry.tsx`：非激活 tab 额外 `pending.sync`（等待中的工作让 tab 保持 busy）。
  - `titlebar/titlebar.tsx`：保 fork 分组侧栏 `Show` 结构 + 取上游 `titlebarItems` 改名；#53297 iOS 状态栏 blur 自动并入。
  - `providers/credentials/form.ts`：取 fork（上游仅 #53444 格式化空行）。
  - `settings/workspaces/workspaces.tsx`：取上游 `useHostApis()`（原 `useExtensionServices` 改名），保 fork `useClock()`/`clockNow()` 相对时间刷新与 store 结构。
  - `shell/tabs/tabs.tsx`（合并后适配）：fork 批量关闭里的 `removePanes` → 上游改名 `removeRegions`。

### 合并后 zh 补全

上游本窗口新 UI 文案仅出 en：`app` 20 键（session.location.*、session.running.*、session.queue.reverted、prompt.toast.unqueueable、settings.guiExtensions.status.blocked）与 `ui` 5 键（compaction.queued、moveToQueue、pending、deletePending、modelVariant），已按既有译法回填两处 `zh.ts`；其余 60 语言走英文回退（与上游发布一致）。

### 验证

`bun run check` 全 36 workspace 通过（lint 0 error）；fork CLI 已重打包 `packages/cli/dist/cli-darwin-arm64`（`0.0.0-latest-202610061920`，供下次 prod 打包使用）。**注意：新后台服务架构下，CLI 构建必须显式 `OPENCODE_CHANNEL=latest`** — 服务注册文件名由烤进二进制的 channel 决定（`latest` → `~/.local/state/opencode/service.json`），桌面端只读该文件；首次打包漏设 channel（回落为分支名 `v2-omg`），服务注册到 `service-v2-omg.json`、桌面端读不到，报 "Timed out waiting for the background service to start" 卡启动页，重建后修复。版本号刻意与官方 CLI（`2.0.24`）区分，避免 fork 桌面误领养官方服务。打包版启动已验收正常。

## 17. 合并上游 v2.0.25

- fork 起点：`848cc9a338`；目标为官方 tag `v2.0.25`（`b44eea9e204024db2b480a136ece29d790d5f593`）。
- merge-base 为 `32a67d2d0aae927d5cab5a471b43192cbff1199f`，基线至 tag 共 98 个提交、728 个文件、+21687/−4009。`v2.0.24` 的 release 提交不在目标 tag 的祖先线上，因此版本字段再次冲突。
- 仅合并已发布 tag；`upstream/v2 @ a67cf4c3` 独有的 7 个提交不在本轮范围。版本号随官方更新到 `2.0.25`。
- 上游重点：最近关闭标签右键菜单、移除可配置默认服务器、配对链接与 OpenTunnel、Office 预览、浏览器栏重设计、外部凭证与工具策略、`fs.read` HTTP Range。

### 冲突解决与适配

- 39 个版本文件（38 个 `package.json` 和 `bun.lock`）：采用上游版本；fork 相对 merge-base 仅改动版本字段。
- 50 个 app 语言包：采用上游删除的默认服务器文案；初次解冲突保留 fork 的 `dialog.project.edit.title` 短标题，后按下述维护策略仅在英语、简中保留。
- `providers/connect/dialog.tsx`：保留 provider 编辑的 `edit` 状态及 reset 语义，采用上游 store 类型写法。
- `shell/tabs/tabs.tsx`：保留批量关闭 `closeTabs`，采用上游 `reopenClosedTab(target?, options?)`；批量关闭保存 `info`，供最近关闭菜单展示。
- `titlebar/tab-strip.tsx`：保留 fork 抽取后的组件结构；上游 `rememberSessionInfo` 的用户消息标记移植到共享 `tab-entry.tsx`。
- `titlebar/titlebar.tsx`：保留分组侧栏；未分组竖排与横排采用上游 `RecentlyClosedTabsMenu`。左键新建、右键显示最近关闭；菜单仅列出有用户消息标记的会话，草稿不入栈。
- `gui-extensions/src/browser/panel.tsx`：合并 `createSignal` 与 `JSX` import，保留 fork backdrop 与上游新浏览器栏。

### 中文补全与审查

- app runtime 补齐本轮 30 个新键；pairing 新增 18 键并将 `copy` 更新为 `copyLink`。保持英文源文案、占位符、代码命令和产品名称。
- 术语参照 VS Code `vscode-loc` 简体中文语料（复制链接、服务器、许可证、隧道），Firefox `firefox-l10n` 的简体中文 preferences/connection 语料（链接、代理、服务器），以及《Rust 程序设计语言》简体中文版第 7.1 节（保留 crate）。
- 中文基数复数依照 Unicode CLDR `zh` 的 `other` 类；字典仍沿用本分支 `.one`/`.other` 同译惯例，调用方保持 `language.plural`。
- 本轮未改历史误译。第三方声明的完整句式与配对提示仍待用户界面审阅。

### 验证记录

- 合并前定向单测：app tabs/titlebar/settings 101 项通过；core config 40 项通过。
- 合并后 `bun install` 未额外改变 lock；`packages/client` 执行 `bun run generate` 后与合并结果一致。
- Node 24 下根目录 `bun run check` 通过，36 个 workspace 全部成功；app tabs/titlebar/settings 108 项通过，core config 41 项通过。
- 初次合并相对官方 tag 恰好 123 个差异文件，均在既有 fork 文件集合内；后续收敛语言定制移除其中 61 个文件的差异。app 本轮 30 个新键已译，pairing 中英文 31 键及占位符一致，已删除键无代码引用。
- `git diff --check v2.0.25` 通过。相对旧 HEAD 的检查发现上游原样带入的许可证文本行尾空格及 ACP 测试文件末尾空行，保留上游原文。
- 严格 `lint:changed` 仍报告历史 fork 风格警告（以 merge-base 为默认基准，覆盖整个 fork 差异）；根目录正式 lint/typecheck 通过。本轮 browser/panel 与新增适配处的空行警告已修正，未扩大为历史代码重构。
- 生产构建的标签切换性能基线与合并后各跑 5 个场景（每场景一次），全部通过、错误目标样本均为 0。稳定显示耗时（ms，合并前 → 后）：冷缓存/关闭 review 167.3 → 149.2，冷缓存/打开 review 164.9 → 190.9，暖缓存/关闭 review 62.8 → 62.6，暖缓存/打开 review 92.1 → 95.5，暖缓存/调整 review 94.1 → 94.8。单次采样仅作粗略比较，不据此判断性能提升或回退。
- 性能与检查原始日志保存在临时目录 `T/opencode/merge-250-{benchmark-before,benchmark-after,check,lint-changed}.log`；开发版通过 `bun run dev:desktop` 启动，使用 local 渠道及独立服务器。
- 合并与后续修复先保持未提交供用户验收；用户已完成 Desktop 测试并授权提交、推送及发布 `v2.0.25`。

### fork i18n 维护策略

- fork 定制文案仅维护英语（`en`）和简体中文（`zh`）；其他语言（含繁体中文 `zht`）随上游，不添加或覆盖 fork 文案，缺少的 fork 新功能键使用既有英语回退。
- 将 app runtime 的其余 61 个语言包恢复为官方 `v2.0.25` 原版，撤销 `dialog.project.edit.title` 短标题定制，减少后续合并冲突。
- 保留 app 英语、简中定制，以及 pairing 和 UI 的简中补全。全仓 i18n 相对 tag 的差异仅剩这 4 个文件。
- 验证：61 个语言包与 tag 逐字节一致，4 个英语/简中差异文件保持原样；`git diff --check v2.0.25` 与 Node 24 下 `bun run check`（36 个 workspace）通过。

### 分组侧栏滚动边缘色块修复

- `project-group-sidebar.tsx` 移除上下 36px 的 `backdrop-filter: blur(6px)` 覆盖层，仅保留滚动内容的 24px 动态透明渐隐。避免局部背景模糊层与半透明 shell、macOS 原生 vibrancy 叠加造成条带色差；参考 ZCode `WorkspaceSidebar.tsx` 的纯 mask 实现。
- 已通过现有 OpenCode Dev 热更新验证：顶部仅底部渐隐，中间双边渐隐，底部仅顶部渐隐；临时隐藏内容模拟无溢出时 mask 为 none，随后恢复原内容与滚动位置。所有状态额外 backdrop-filter 层均为 0。
- 根 `bun run check` 36 个 workspace 通过，修改组件 oxlint 0 warning / 0 error，差异空白检查通过；用户已完成界面验收。

### v2.0.25 发布

- fork Release/tag 使用 `v2.0.25`，指向本轮验收后的合并提交；官方 tag 的来源提交仍为本节记录的 `b44eea9e204024db2b480a136ece29d790d5f593`。
- 安装包版本通过构建参数注入 `2.0.25-fork.1`，仓库版本保持上游 `2.0.25`。内置 CLI 同步使用 `2.0.25-fork.1` 及 `latest` 服务渠道。
- 沿用 macOS arm64、prod 更新源 `omegod/opencode` 与本地 `RedixDevCert` 签名，发布 DMG、ZIP、各自 blockmap 及 `latest-mac.yml`。

## 18. 合并上游 v2.0.27

- fork 起点：`e1dd6f4e9f`；目标为官方 tag `v2.0.27`（`1f4d07a4a519185955ae8ab2ea3607805509e386`）。
- merge-base 为 `434f7b2a3670dd932794688bee5e34029e546630`（10-08），基线至 tag 共 1460 个提交、1007 个文件、+90573/−23392。
- `v2.0.27` 于 10-10 经过 `chore: promote v2 to dev` 线路合并，历史包含另一条开发线（提交日期 6/26–10/12），因此体积远大于常规补丁：约 7.6 万行集中在 console/web/stats/官网，桌面运行时相关包合计约 +1.4 万行。
- `v2.0.26` 内容包含在 `v2.0.27` 中：Vertex Google Cloud 凭据、会话快照性能与恢复、可点击转录链接与 OSC 8 超链接、Step 5 Preview Free、untracked 文件与批量选择 git diff、远程访问随机子域、release notes 写入 CHANGELOG 的流程。
- 仅合并已发布 tag；`upstream/v2 @ 4617210822` 已是该 tag 的祖先，无未发布提交。版本号随官方更新到 `2.0.27`。

### 冲突解决与适配

- 39 个版本文件（38 个 `package.json` 与 `bun.lock`）：采用上游版本；fork 相对 merge-base 仅改动版本字段。
- 与 fork 定制重叠的 10 个文件全部自动合并成功：`settings/model.tsx`、`shell/commands/dialog.tsx`、4 个 client 生成文件、`core/src/config.ts` 及测试、`gui-extensions/README.md`、`browser/panel.tsx`。fork 的 provider 配置补丁（schema `Config.Patch` 的 `provider` 字段、core 逐条应用 JSONC 编辑、client 生成类型）与浏览器面板 backdrop 定制均保留。
- `desktop/scripts/dev.ts` 采用上游改动：web UI 构建改为启动期间低优先级后台进行（不再阻塞冷启动），并移除启动前的版本打印。
- 上游删除 33 个文件（console zen 代理工具、stats athena/ingest、infra lake 等），不含 fork 定制文件；新增 90 个文件，含 Vertex Mistral/Interactions 路由、console inference-proxy、根 `CHANGELOG.md` 等。
- `bun install` 未额外改变 lock；`packages/client` 执行 `bun run generate` 后与合并结果一致。

### 验证记录

- Node 24 下根 `bun run check` 通过：36 个 workspace 全部成功（无缓存，约 52s）。
- app 定向单测 `src/settings` + `src/shell` 161 项通过（含 tabs、titlebar、model 设置）；core `test/config/config.test.ts` 43 项通过。
- 本轮上游未改动 app runtime i18n、配对与 UI 简中、分组侧栏、tabs/titlebar、主题文件；fork 定制与上游改动无交集的部分保持原样。
- 合并先保持未提交供用户验收；Desktop 验证通过后提交为 `92ace754f8`，并推送分支与 tag `v2.0.27`。

### 构建与发布

- 本地打包遇到 `codesign --timestamp` 失败：Apple 时间戳服务不可达时 codesign 直接报 `A timestamp was expected but was not found` 并中断打包。自签名、不公证的本地构建不需要安全时间戳，`electron-builder.local.ts` 增加 `timestamp: "none"`；本次发布先用 `-c.mac.timestamp=none` 覆盖完成打包，随后将同一设置落到本地配置。
- 打包后核验：应用与内置 CLI 版本均为 `2.0.27-fork.1`，更新源为 `omegod/opencode` prod 渠道，`codesign --verify --deep --strict` 通过，`latest-mac.yml` 中 SHA-512 与大小同 DMG/ZIP 产物一致。
- 发布沿用 macOS arm64：DMG、ZIP、各自 blockmap 与 `latest-mac.yml` 一并上传，Release/tag 使用 `v2.0.27`。

## 19. 修复：分组侧栏滚动后顶部窗口拖动失效

### 现象

- 开启「按项目分组」并让左侧会话列表溢出后，向上滚动列表一定距离，顶部的窗口拖动区（macOS 交通灯下方的 28px spacer）失效；滚回顶部恢复。
- 平铺竖排列表（未分组）是同一滚动结构，存在同一问题。

### 根因（Electron 44.4.5 最小复现 + Chromium 152 源码确认）

- Chromium 152 把 `app-region` 并入 `window-drag`：**是继承属性**（`default: none, inherited: true`），`app-region` 是它的 surrogate、`-webkit-app-region` 是其别名。
- 渲染进程为每个 `app-region != none` 的盒子按**绝对坐标（不受滚动容器裁剪）**上报 drag/no-drag 矩形；Electron 按**布局树顺序**折叠合成，同点后出现的矩形覆盖先出现的。
- 滚动容器上的 `[app-region:no-drag]` 被所有行/文本继承；列表向上滚动后，滚出视口的行矩形在坐标上盖住上方 spacer，把它从命中区域中减掉，顶部于是无法拖窗；滚回顶部矩形回位，区域恢复。
- 探针日志（`ELECTRON_DEBUG_DRAGGABLE_REGIONS=1`）：滚动前命中区域 `2 rect(s), bounds 0,0 480x640`（顶部条 + 底部条），滚动后 `1 rect(s), bounds 0,622 480x18`（只剩底部条）；把拖动条移到 DOM 最后则滚动全程稳定。

### 修复

- `packages/app/src/shell/titlebar/project-group-sidebar.tsx`：去掉滚动容器的 `[app-region:no-drag]`——该容器不在任何 drag 区域内，本来冗余；去掉后行不再继承、不再上报矩形（也减少滚动时的区域合成开销）。
- `packages/app/src/shell/titlebar/tab-strip.tsx`：`[app-region:no-drag]` 仅在横排保留（横排列表位于可拖动标题栏内，必须保留；移动抽屉由 `mobile-drawer-content` 的 no-drag 继承覆盖，不受影响）。
- 备选兜底（探针已验证，未采用）：把顶部拖动条放到 Portal 最后并绝对定位，使其 drag 矩形最后生效。

### 验证记录

- `packages/app`：`bun typecheck` 通过；`src/shell/titlebar` 32 项测试通过。
- 根 `bun run check` 36 个 workspace 通过。
- Desktop dev 手工验证：分组 + 长列表滚动后顶部拖动正常（用户已验收通过）。

## 20. 合并上游 v2.0.28

### 上游内容

- 应用：项目级 auto-accept 权限（项目设置可覆盖默认值，命令/提示/搜索同步）、未读状态改用服务端 viewed watermark、桌面会话成本计入子代理、审阅面板图片/音频、视频剧院模式、composer 清空同帧显示提交内容、对话框焦点栈修复、Working 显示在未投递 steer 之上。
- 核心/模型：Gemini 响应续传、Anthropic `compatibility.cacheFormat`、provider 级 compatibility、请求体编码设置（zstd/gzip）、系统配置目录（含 macOS MDM plist）按最低优先级加载、Windows 无 PowerShell 解压 ripgrep、禁用 Bun fetch idle timeout。
- 桌面/CLI/TUI：Windows ARM64 原生安装与按架构暂存 CLI（打包期新增原生架构校验）、WinGet 发布、TUI 更新后显示 release highlights、命令补全限制在提示开头。
- 插件：Figma 插件与完整 skills、server 插件 `credential.activate`。
- 基础设施清理（无 fork 影响）：console 旧数据库与 legacy Stripe 移除（`packages/console/{core,mail,support}` 整体删除）、`sst.config.ts` / `sst-env.d.ts` 移除、docs 大幅迁移。

### 冲突与解决

- 41 个冲突：38 个 `package.json` 加 `bun.lock` 取上游（`--theirs`）；`packages/console/{core,mail,support}/package.json` 为上游删除，接受删除并移除整个目录。
- `packages/core/test/config/config.test.ts`：双方在同一锚点各自新增测试。取上游版本后，把 fork 的 `patches provider entries...` 测试原样插回，并恢复 `jsonc-parser` 的 `parse as parseJsonc` 导入。
- `packages/desktop/electron-builder.config.ts`：保留上游重构（`getBase` 用 `getCurrentCli()`、`afterPack` 增加 `NativeArch.verify` 与 node-pty 校验、`export function getConfig()` 加 `resolveChannel()`），再把 fork 的更新源注释与 publish 定制（beta 不发布、prod 指向 `omegod/opencode`）挂回。
- 自动合并并确认双方内容共存：`core/src/config.ts`（系统目录 + fork provider JSONC 编辑）、`project-avatar-state.ts`（`autoApproves(project)` 加 fork 额外返回的 `attention`）、`settings/model.tsx` 与 `model.test.ts`、`general.tsx`、`search-catalog.ts`、`en.ts`。

### 验证记录

- `bun install` 无额外 lock 变化；`packages/client` `bun run generate` 后与合并结果一致（fork provider 字段与上游新类型共存）。
- 根 `bun run check`：36 个 workspace 全部通过。
- `packages/core` `test/config/config.test.ts` 47 项通过；`packages/app` `src/settings` 加 `src/shell` 159 项通过（上游删除了 `notification-alert.test.ts`）。
- `git diff v2.0.28 --name-only` 恰好为 fork 定制文件集（62 个），其余与上游完全一致；`git diff --check` 无空白与冲突标记问题。
- 合并先保持未提交供用户验收；Desktop 验证通过后提交为 `2f874936b8`，推送分支与 tag `v2.0.28`。

### 构建与发布

- 内置 CLI 与安装包版本 `2.0.28-fork.1`；prod 渠道更新源仍为 `omegod/opencode`，本地 `electron-builder.local.ts` 的 `timestamp: "none"` 生效，未再触发时间戳失败。
- 上游新增的打包校验（`afterPack` 的 `NativeArch.verify` 与 node-pty 检查）在本地 arm64 构建通过。
- 打包后核验：应用与内置 CLI 版本一致、更新源正确、`codesign --verify --deep --strict` 通过、`latest-mac.yml` 中 SHA-512 与大小同 DMG/ZIP 产物一致。
- 发布沿用 macOS arm64：DMG、ZIP、各自 blockmap 与 `latest-mac.yml` 一并上传，Release/tag 使用 `v2.0.28`。

## 21. 底部工作指示器：思考中显示「思考中 · 思考内容滚动行」

### 背景

- 上游 `#51090`（v2.0.28 起）之后，当思考被放进折叠分组（`timeline.detail.thinking.placement = "grouped"`，即默认的「精简」预设）且模型当前只在思考时，时间线不产出任何行，底部只有「工作中」，看不到正在思考的内容。
- fork 决定不改抽屉、不改 `projection.ts`（避免与上游高频文件产生冲突面），改为在底部指示器上表达状态。

### 做法

- 新增 fork 组件 `packages/app/src/session/timeline/session-working.tsx`（样式同目录 `session-working.css`），替换上游内联的「工作中」节点：
  - 仅当 `thinking.placement === "grouped"` 且当前轮最后一个 content 是未完成的 reasoning 时切换；`separate` / `hidden` 模式维持原样。
  - 标签复用抽屉内推理块同款键 `ui.sessionTurn.status.thinking`（en `Thinking` / zh `思考中`）与 `TextShimmer` 流光；`·` 之后是思考文本的**最后一个非空行**。
  - 单行视口滚动到最新 token（`scrollLeft = scrollWidth`，RTL 取负），溢出时两侧渐隐（`mask-image` 线性渐变）。
  - 换行时复刻 ZCode `ai-elements/reasoning.tsx` + `QueuedSummaryContent.tsx` 的纵向 roll：300ms 过渡 + 500ms 保持、最多排队 2 条、定时器迟到 >250ms 只保留最后一条、同一行内增长原位刷新不重播；`prefers-reduced-motion` 关闭整个队列与动画。
  - 性能：不做整段 `split`，从末尾反向扫描取最后一行（每 token O(尾部)）；滚动同步用 `requestAnimationFrame` 合并，避免每 token 强制布局。
- 上游文件只改渲染一处：`message-timeline.tsx` 的 `session-working` 节点换成 `<SessionWorking … />`；`showWorking()` / `activity()` / `bottomSpacer` 判定保持不动。
- 无障碍：保留 `data-component="session-working"` 与 `role="status"`（e2e 依赖），滚动行 `aria-hidden`，避免 `role=status` 逐 token 播报。

### 变更文件

- 新增：`packages/app/src/session/timeline/session-working.tsx`、`packages/app/src/session/timeline/session-working.css`
- 修改：`packages/app/src/session/timeline/message-timeline.tsx`、`packages/app/e2e/regression/timeline-stream.spec.ts`

### 验证记录

- 类型/静态检查：`packages/app` `bun typecheck` 通过；根 `bun run check` 35/35 通过（`session-working.tsx` 等新文件无 anti-slop 告警）。
- e2e（`packages/app`）：新增 Working 用例覆盖「grouped + 只有思考 → 思考中 + 最新行 + 已滚动到末尾」「工具开始运行 → 回到工作中」；`timeline-stream.spec.ts` + `timeline-geometry.spec.ts` 共 53 项通过（既有 `aria-label="Working"` 断言都落在 `separate` / 无思考场景，未受影响）。
- 基准（`packages/app`，macOS arm64，中位数）：
  - tab 切换 `bench:tabs`（每用例 20 次）：warm 用例基本重合（warm closed `firstCorrectObservedMs` 22.4 → 22.7ms、`stableObservedMs` 64.6 → 64.5ms）；cold 用例上移 2~6ms，落在基线自身 min–max 之内（cold open `stableObservedMs` 基线 136.8–181.1，改动后 138.2–190）。
  - streaming 时间线（`session-timeline-benchmark.spec.ts`，3 用例 ×3 次）：`longTaskCount` 32→30 / 29→27 / 56→65，`longTaskTimeMs` 1961→1978 / 1989→1642 / 3540→4013，`rafGapP95Ms` 165.8→150.1 / 150→150 / 166.4→166.7，均在基线自身波动范围内（基线 `rafGapP50Ms` 自身跨度 33.7–49.8ms）。
  - 这两个基准不覆盖「只有思考」的流式场景（tab 基准的会话为 idle；streaming 基准只流式 text），改动路径不在其测量范围内；实际观感由 Desktop 手工验收。
- Desktop 手工：思考开头、工具运行、思考→工具→再思考、长行滚动、换行 roll、减少动效、RTL（用户已授权提交、推送与发布 v2.0.30）。

## 22. 分组侧栏：未读蓝点与相对时间占用同一位置

### 现象

- 按项目分组时，会话执行结束后进入未读状态；行尾的未读蓝点与相对时间（如「刚刚」）叠在同一坐标：蓝点绝对定位在关闭按钮位（`inset-inline-end: 4px`）且不随 hover 隐藏，而相对时间是行尾的 flex 子项，只在 hover 时让位给关闭按钮。
- 平铺行没有相对时间，因此只有分组组件出现该冲突。

### 处理

- `packages/app/src/shell/titlebar/grouped-tab-item.tsx`：未读行的相对时间不再渲染（`<Show when={unread() ? undefined : sessionTime()}>`），同一槽位只保留未读蓝点。hover 时蓝点沿用既有 CSS 隐藏、关闭按钮出现；标题按既有 `data-unread` 规则预留淡出偏移（指针 24px / touch 44px）。
- `packages/app/src/shell/titlebar/grouped-tab.css`：仅同步注释，蓝点/槽位/`data-unread` 预留空间规则保持不变。touch 设备上蓝点继续左移 20px、与常显的关闭按钮错开。

### 验证记录

- `packages/app` `bun typecheck` 通过；`src/shell` 108 项测试通过；根 `bun run check` 35/35 通过。
- 现有 e2e 不受影响：`tabs.spec.ts` 的未读断言都针对平铺行（`[data-titlebar-tab-slot]`），分组行无 e2e 覆盖。
- Desktop 手工：分组模式未读行行尾只显示蓝点，hover 后换成关闭按钮；已读行仍显示「刚刚」；等待权限/表单的 attention 点不变（用户已授权提交、推送与发布 v2.0.30）。

## 23. 合并上游 v2.0.29 / v2.0.30

- 一次合并两个官方 tag：`v2.0.28..v2.0.29` 49 个提交、`v2.0.29..v2.0.30` 65 个提交，合并提交 `eb9b6e3b64`；版本号随官方更新到 `2.0.30`。
- v2.0.29 重点：远程设备配对（设置 → 配对，OpenTunnel 与二维码/链接）、Provider 账号管理（连接弹窗与设置 → Providers 可切换/重命名/移除/新增）、输出达到 token 上限后自动续写、图片与 SVG 预览支持触控板捏合缩放与双指平移、会话上下文 token 与家族成本展示、策略配置键稳定为顶层 `policies`。
- v2.0.30 重点：TUI 对话框统一布局系列重构（DialogHeader / DialogFooter / DialogLayout）、diff 侧栏默认打开与响应式 diff 查看器、会话分享后端下线、Windows 在项目目录打开 PowerShell、models.dev 快照刷新与多项 provider/ai 修复。
- 相对官方 tag `v2.0.30` 的 fork 差异为 67 个文件（+5531/−737），全部落在既有 fork 定制文件与本轮新增文件内。
- 合并后验证：Node 24 下根 `bun run check` 35/35 通过（v2.0.28 时为 36 个 workspace，上游本轮删除了 `packages/enterprise`）。

## 24. v2.0.30 发布

### 构建与发布

- 打包流程沿用 v2.0.28：先构建内置 CLI（`OPENCODE_CHANNEL=latest OPENCODE_VERSION=2.0.30-fork.1`、`--single`），再以 `OPENCODE_CHANNEL=prod` + `OPENCODE_CLI_DIST` 打包桌面（`electron-builder.local.ts`、`-c.extraMetadata.version=2.0.30-fork.1`、`--publish never`），仓库版本保持官方 `2.0.30`。
- 打包后核验：应用与内置 CLI 版本均为 `2.0.30-fork.1`，`app-update.yml` 更新源为 `omegod/opencode` prod 渠道，`codesign --verify --deep --strict` 通过，`latest-mac.yml` 的 SHA-512 与大小同同次构建的 ZIP（264739774 B）与 DMG（274051342 B）一致。
- 发布沿用 macOS arm64：DMG、ZIP、各自 blockmap 与 `latest-mac.yml` 五个资产；Release/tag `v2.0.30` 指向本轮发布提交，先创建 draft、上传并核对资产，再发布；随后核对 `releases/latest` 与 `releases/download/v2.0.30/latest-mac.yml` 下载。

## 25. 合并上游 v2.0.31 / v2.0.32

- 一次合并两个官方 tag：上游 dev 线 56 个提交、282 个文件（含 v2.0.31、v2.0.32 两次发版）；合并提交 `d5f4c18f1e`。
- 实测上游 release tag 不在 dev 直线上：真实合并基点是 dev 线提交 `775d1d0d`（`v2.0.30` tag 提交只含 2.0.29→2.0.30 的版本同步，与 dev 线并行）。因此 v2.0.30 发版的版本号反转过来成为本轮 36 个版本冲突的一方。
- 冲突仅 36 个版本文件（35 个 `package.json` + `bun.lock`），全部按上游 `2.0.32` 解决（fork 对这些文件零定制）；双方都改过的 6 个文件（`app/src/index.css` 的 vibrancy 变量、`core/test/config/config.test.ts` 的 provider 补丁测试、client 4 个生成文件）全部自动合并成功。
- 上游重点：TUI 新设计实验与官方 opencode2 主题（`text.faint` token）、`/copy` 复制最后一条助手消息、从配置读取模型 reasoning、实验性 voice session 端点、虚拟列表滚动稳定性修复（`observe-element-offset`）、review 面板折叠动画修复、文件树长文件名边缘淡出、工具组计数改用 `AnimatedNumber`、env 配置转义修复、Gemini/Bedrock 修复、CLI 托管服务环境加载与 auth login 修复；发布设施删除 `finalize-latest-*.ts` 并下线独立 beta 发布仓库（fork 本地打包流程不引用，无影响）；新增 4 个测试技能与 `AGENTS.md` 测试条目。
- 版本号随官方到 `2.0.32`（仓库根与全部 workspace 包）。
- 合并后验证：Node 24 下根 `bun run check` 35/35；app `src/shell` 单测 108/108；`packages/client` `check:generated` exit 0（fork 的 `config.update` provider 补丁与上游 voice 生成代码同时生成）；时间线 e2e 75/76——唯一失败 `timeline-cache.spec.ts:163` 为本地 macOS 快捷键已知项（`ControlOrMeta` 在 macOS 发 Meta，CI 环境通过，按技能要求不修改测试）。

## 26. v2.0.32 发布

### 构建与发布

- 打包流程与 v2.0.30 相同：先构建内置 CLI（`OPENCODE_CHANNEL=latest OPENCODE_VERSION=2.0.32-fork.1`、`--single`），再以 `OPENCODE_CHANNEL=prod` + `OPENCODE_CLI_DIST` 打包桌面（`electron-builder.local.ts`、`-c.extraMetadata.version=2.0.32-fork.1`、`--publish never`），仓库版本保持官方 `2.0.32`。
- 打包后核验：应用与内置 CLI 版本均为 `2.0.32-fork.1`，`app-update.yml` 更新源为 `omegod/opencode` prod 渠道，`codesign --verify --deep --strict` 通过，`latest-mac.yml` 的 SHA-512 与大小同同次构建的 ZIP（264810418 B）与 DMG（274141842 B）一致。
- 发布沿用 macOS arm64：DMG、ZIP、各自 blockmap 与 `latest-mac.yml` 五个资产；Release/tag `v2.0.32` 指向本轮发布提交（即本节所在提交），先创建 draft、上传并核对资产，再发布；随后核对 `releases/latest` 与 `releases/download/v2.0.32/latest-mac.yml` 下载。

## 27. 合并上游 v2.1.0 / v2.1.1 / v2.1.2 / v2.1.3 / v2.1.4

- 本轮分三次合并：`v2.1.0` 与 `v2.1.1` 一次合并（`db15348db9`，738 个文件，+11573/−10147）；`v2.1.2`（`f7fd0f8bc3`，162 个文件，+4144/−1384）；`v2.1.4` 直接合并（`f18c6d79fa`，775 个文件，+14577/−8789）。`v2.1.4` 已包含 `v2.1.3` 的全部代码，因此本轮不单独合并 `v2.1.3`。
- 官方 release tag 都是独立叶子提交，真实合并基点不是上一个 tag：`v2.1.2` 的合并基点是 `c600cddc68`，`v2.1.4` 的合并基点是 `37d973754b`。因此每轮都会出现 34 个 `package.json` 与 `bun.lock` 的版本冲突，全部按上游版本解决（fork 对 `package.json` 零定制）。
- `v2.1.2` 重点：免费额度提示与 Go 订阅弹窗、提示词召回、`OPENCODE_DISABLE_FREE_MODELS`、`experimental.location_idle_timeout`、Electron 44.9.1、`~/.zshrc` 自动创建、opentunnel 0.4.1、models.dev 快照刷新。
- `v2.1.3` 重点：代码高亮从 Shiki 切换到 `@pierre/highlights`（代码块、文件预览、diff 全部换引擎）；时间线拖动滚动条不再强制跟随底部；Tab 重命名粘贴纯文本；免费额度弹窗 Go 插图动效；Bun 1.4.4；RPM build-id 链接修复；models.dev 快照刷新。
- `v2.1.4` 重点：MCP elicitation 表单（桌面与 Web 的输入框上方显示）；桌面命令面板新增「Capture heap snapshots」（app 与 server 堆快照、native memory 分解）；文件变更数量文案改为「N files changed」；会话没有模型时使用 agent 的模型；MCP server 启动去重、并行关闭、OAuth stray callback、远程请求 idle timeout、非根对象 output schema 等修复；compaction 边界与压缩顺序改进，新增实验性 `background_compaction`；隐藏 ChatGPT 账号拒绝的 Codex 模型，ChatGPT context caps 拆成独立插件；Linux AppImage 可执行文件名修复。
- 冲突处理：`v2.1.2` 的 35 个冲突全部是版本文件；`v2.1.4` 的 37 个冲突中，34 个 `package.json` 与 `bun.lock` 取上游，`packages/app/src/shell/titlebar/tab-strip.tsx` 保留 fork 重写版并补 `plaintext-only`，`packages/app/src/providers/credentials/dialog.tsx` 保留 fork 重写版并把文档链接更新到 `https://opencode.ai/v2/docs/providers#custom`。
- fork 侧同步：`project-tab-list.tsx`、`grouped-tab-item.tsx` 补齐 `plaintext-only`；`packages/ui/src/i18n/zh.ts` 补 3 个免费额度简中 key；`packages/app/src/runtime/i18n/zh.ts` 补 1 个 MCP elicitation key；`packages/gui-extensions/src/debug/i18n/zh.ts` 补 7 个堆快照 key。
- fork 定制保留：provider 配置编辑补丁（`packages/client/src/effect/api/api.ts` 与生成文件、`packages/core/src/config.ts`、`packages/schema/src/config.ts`）、分组侧栏与未读蓝点、底部「思考中」滚动行、OpenCode2 毛玻璃主题、`electron-builder.local.ts` 本地打包与 `omegod` 更新源。
- 验证记录：Node 24 + Bun 1.4.4 下根 `bun run check` 34/34 通过；`check:generated` exit 0；app 774、session-ui 252、ui 153、client 233、core 相关 1089、desktop 130、gui debug 7、server 8、markdown 组件 28 项测试通过；app e2e 125/132。7 个失败中 5 个为本地 macOS 键位（`Control+W`、`Control+Alt+Arrow`、`Shift+F10`、键位提示文案），1 个为上游 `@pierre/diffs` worker 的 `Theme "pierre-dark"` 错误，1 个为已知的 `Control+,`；5 个键位失败与 worker 错误均已在官方 `v2.1.4` 干净 worktree 复现。

## 28. v2.1.4 发布

### 构建与发布

- 打包流程沿用 v2.0.32：先构建内置 CLI（`OPENCODE_CHANNEL=latest OPENCODE_VERSION=2.1.4-fork.1`、`--single`），再以 `OPENCODE_CHANNEL=prod` + `OPENCODE_CLI_DIST` 打包桌面（`electron-builder.local.ts`、`-c.extraMetadata.version=2.1.4-fork.1`、`--publish never`），仓库版本保持官方 `2.1.4`。
- 打包后核验：应用与内置 CLI 版本均为 `2.1.4-fork.1`，`app-update.yml` 更新源为 `omegod/opencode` prod 渠道，`codesign --verify --deep --strict` 通过（`RedixDevCert`），`latest-mac.yml` 的 SHA-512 与大小同同次构建的 ZIP（280966012 B）与 DMG（290791879 B）一致。
- 发布沿用 macOS arm64：DMG、ZIP、各自 blockmap 与 `latest-mac.yml` 五个资产；Release/tag `v2.1.4` 指向本轮发布提交（即本节所在提交），先创建 draft、上传并核对资产，再发布；随后核对 `releases/latest` 与 `releases/download/v2.1.4/latest-mac.yml` 下载。

## 29. 合并上游 v2.2.0

- 合并官方 `v2.2.0`（`1097e2668b`），合并提交 `0926a80f90`；`v2.1.4` 的真实合并基点是 `74f8d4860f`（`v2.1.4` 发版提交只含版本号），本轮共 661 个提交、3109 个文件（+136853/−97083）。
- 冲突 63 个：34 个 `package.json` 与 `bun.lock` 全部取上游版本；28 个实质冲突集中在 titlebar / tab-strip、settings、i18n、provider credentials、desktop 窗口与打包、主题 CSS。
- 官方重点：桌面 GUI 插件体系（`@opencode/plugin/gui`、`gui-extensions` 重写为 `gui-plugins`）、Top/Side/Inbox 三种界面模式、侧栏与底部面板标签、文件/终端/浏览器标签、Home 会话搜索、图片与决策生成 API、`@opencode/ai` 根入口改为 Promise API、OpenTUI 0.7、Console 用量与 Go 额度、session instruction entries、媒体 blob、prompt cache TTL、大量 core/ai/tui 修复。
- `gui-extensions` 整体改名为 `gui-plugins`，fork 的 debug/pairing 简中随包迁移；新的 GUI 插件 i18n 是静态对象，pairing 改为直接导入 `zh`，README 的示例块同步更新。
- 自定义提供商：上游删除了 `providers/credentials/*`，fork 保留该表单并接入新的 `providers/connect/dialog.tsx`（`_custom` 入口、编辑模式、picker 自定义行）；服务端 `Config.Patch.provider` 补丁继续保留，`packages/client` 已重新生成。
- 分组侧栏：上游重写了 `titlebar.tsx`、`tab-strip.tsx` 并新增 `tab-nav.tsx`。fork 保留 `ProjectGroupSidebar` / `ProjectTabList`，接入新的 Side tabs：保留上游的 Home/Search/最近关闭行，分组列表在 `tabLayout !== "inbox"` 且开启分组时替换扁平标签列表；`TitlebarTabStrip` 只在垂直 + 分组时委托给 `ProjectTabList`。
- i18n：保留 `provider.custom.*` 与分组相关 key；清理 20 个上游已删除的简中 key；v2.2.0 新增的英文 UI key 暂未补简中，按运行时英文回退。
- 桌面：`scripts/` → `script/`，`make-latest-mac-yml.ts` 随目录迁移；`electron-builder.config.ts` 保留 fork 的 prod GitHub（`omegod/opencode`）发布与“仅 prod 嵌入更新源”；macOS vibrancy 与上游新的 `platformFrame` / 缩放标题栏合并；底部「思考中」滚动行继续接入新的 Activity lane。
- 已知限制：上游移除了 `projects.move`，分组标题的拖动排序暂为 no-op，需要后续用本地项目顺序存储补回；新 UI 简中未补；release 流程的上游 `prebuild` 已并入 `script/build.ts`，下次打包前需把 fork 的 `OPENCODE_CLI_DIST` 流程改为 `packages/cli/dist` + `bun run build`。
- 合并后修复（已包含在本轮验收，见 §31）：分组侧栏接管整个左侧、扁平选中行灰块、OpenCode2 毛玻璃、项目拖动排序本地持久化、Search sessions 简中；release 流程仍需按 §31 的打包步骤处理。
- 验证记录：Node 24 + Bun 1.4.4 下根 `bun run check` 35/35；app 单元 911/911；gui-plugins 240 通过 + 1 skip；Desktop dev 已启动（OpenCode Dev 2.2.0，渲染 5173、内置 CLI 3084）。

## 30. 底部思考滚动：展示层隐藏 live Thinking 行

### 背景与扩大范围的原因

- 上游 v2.2.0（`11133d178b`）删除了 `packages/session-ui/src/timeline/projection.ts` 的 `thoughtOnly`：本轮只有 reasoning 时也会生成时间线 live `Thinking` 行。`message-timeline.tsx` 的 `showWorking()` 把这个“只有思考”的组当作 Working 的替代，隐藏了底部的 `SessionWorking`，fork 的「思考中 · 最新行」滚动因此消失。
- 原计划恢复 `thoughtOnly`，但那会重新修改上游高频文件 `session-ui/projection.ts`。本次改为只改 app 展示层：`message-timeline.tsx` 本身也是上游高频冲突点，但可以把 fork 代码集中在一个带 `// Fork:` 注释的块里，避免动共享 projection 与 `session-ui` 单测。
- 这样“扩大”了 fork 在 `message-timeline.tsx` 的定制面（原先只替换了底部 `SessionWorking` 节点）。原因是：v2.2.0 之后，只有展示层能同时做到“折叠时不显示时间线行、展开时保留时间线行”，且不改变 projection 的行结构。

### 做法

- `packages/app/src/session/timeline/message-timeline.tsx`：
  - `hiddenThoughtRow`：当 `thinking.placement === "grouped"` 且 `thinking.details === "collapsed"`、状态 busy、最后一条 assistant 未完成且无 error / retry、活跃轮最后一个 context 组只含 reasoning 时，标记该行。
  - `visibleRows` / `visibleRowByKey` / `visibleMessageRowIndex` / `visibleMessageLastRowIndex`：按可见行过滤并重算 virtualizer 读取的索引；`presentationProjection` 只覆盖 virtualizer 需要的六个 accessor。
  - `showWorking()` 与 `activityRow()` 改用 `visibleRows()`；`lastAssistantGroupKey` 保持原 projection，避免把上一组误标为 busy；`rowRenderer` 仍用原 projection，避免影响 user run / patch group。
  - 折叠时：live 思考行不显示，底部 `SessionWorking` 显示「思考中 · 最新行」并滚动。
  - 展开时（`thinking.details === "expanded"`）：保留上游 live Thinking 行，底部滚动隐藏。
- 范围：折叠模式下所有正在流式输出的纯思考组都由底部滚动接管，不只是第一段；展开模式保持上游行为。

### 冲突与还原

- 不修改 `packages/session-ui`；`session-ui` 的 projection 单测保持原样。
- fork 代码集中在 `message-timeline.tsx` 的 `hiddenThoughtRow` 到 `presentationProjection` 一段；`showWorking` / `activityRow` 只有两处 `projection.rows()` → `visibleRows()` 的替换。
- 还原方法：删除 `hiddenThoughtRow`、`visible*` 与 `presentationProjection` 块；把 `createTimelineVirtualizer` 的 `projection` 改回 `projection`；把 `showWorking` / `activityRow` 的 `visibleRows()` 改回 `projection.rows()`；把 e2e 中 expanded 的 settings 改回 `detailed`。
- e2e：上游 `shows an expandable live Thinking...` 改为 `thinking.details = "expanded"`，覆盖展开时保留；fork 的滚动用例保持 `collapsed`，并改名为 `... when grouped thinking is collapsed`。两者不再互相矛盾。

### 验证记录

- `packages/app` `bun typecheck` 通过（1,874 files）。
- `packages/app` `bun run test:unit`：912 通过 / 0 失败（129 files）。
- `packages/app` e2e `timeline-stream.spec.ts -g Working`：14/14 通过（折叠滚动、展开 Thinking、工具 / 补丁 / 子代理、背景 shell、Retry、文本流等）。
- 未跑 timeline projection benchmark：基线构建被中断；本次只在 app 展示层过滤行，`session-ui` projection 构造与流式 token 路径未改。

## 31. v2.2.0 合并后界面修复

### 分组侧栏接管整个左侧

- `packages/app/src/shell/titlebar/titlebar.tsx`：`tabLayout === "vertical"` 且开启 `groupTabsByProject` 时，整个左侧内容由 `ProjectGroupSidebar` 接管；header 只保留 macOS 交通灯和侧栏按钮，抑制 header Home，避免与分组侧栏自己的 Home 重复。
- `packages/app/src/shell/titlebar/project-group-sidebar.tsx`：分组侧栏包含 Home、Search sessions、New Session 和分组列表；Search 行调用 `sessions.search` 命令并显示 `command.session.search` 快捷键。
- `packages/app/src/shell/titlebar/tab-strip.tsx`：撤回上一轮在 `TitlebarTabStrip` 内委托分组列表的临时写法，恢复上游 v2.2.0 结构；分组模式只走 `ProjectGroupSidebar`。
- 分组模式按此前要求不显示「最近关闭」。
- `packages/app/src/runtime/i18n/zh.ts`：补 `command.session.search` → 「搜索会话」，与 `home.sessions.search.placeholder` 术语一致。

### 扁平选中标签右侧灰块

- 根因：上游 close 槽使用 `overlay + --tab-base`；fork 的 vibrancy 主题把所有 `[data-titlebar-tab]` 的 `--tab-base` 设为 `transparent`，close 槽于是变成第二层 overlay，叠在整行 overlay 上形成灰色方块。
- 修复：新增 `packages/app/src/shell/titlebar/titlebar-fork.css`，选中但未 hover / focus / 有 status 时 close 槽 `background: none`；hover 时关闭按钮和底色正常出现。`titlebar.tsx` 引入该文件。

### OpenCode2 毛玻璃

- `packages/app/src/shell/shell.tsx`：去掉 `vertical-tabs-mount` 上不透明的 `bg-v2-background-bg-deep`，让 shell 的 `--shell-surface` 和 macOS vibrancy 透出；`peek-surface` 保持不透明，避免关闭侧栏预览时透出内容。
- 实测 `mountBg: rgba(0,0,0,0)`、`shellBg` 为 60% 透明。

### 项目拖动排序本地持久化

- `packages/app/src/runtime/server/persistence.ts`：`ServerState` 新增 `projectOrder`（按 server scope 保存 worktree 顺序）。
- `packages/app/src/runtime/server/registry.tsx`：`createServerProjects` 新增 `order()` / `move()`。
- `packages/app/src/runtime/server/runtime.tsx`：`projects.list()` 按本地 `projectOrder` 排序，未知项目保持服务器顺序；暴露 controller `move`。
- `packages/app/src/shell/titlebar/project-tab-list.tsx`：恢复 `projectMoveIndex` 和 `moveProject`，拖动项目标题后写回本地顺序。
- 测试：`registry.test.ts` 覆盖 `order()` / `move()`，`persistence.test.ts` 覆盖 `projectOrder` 迁移与容错。
- 已知限制：没有 project 记录的目录组（例如 `main`）不参与本地项目顺序，固定排在项目组之后；用户已确认该目录是脏数据，不处理。

### 验证记录

- 根 `bun run check`：35/35 通过（v2.2.0 合并后的基线）。
- `packages/app` `bun run test:unit`：912 通过 / 0 失败。
- 定向测试：`persistence.test.ts`、`registry.test.ts`、`tab-groups.test.ts` 17 通过。
- e2e：`timeline-stream.spec.ts -g Working` 14/14；折叠思考滚动与展开 Thinking 两个用例 2/2。
- Desktop 手工：分组侧栏单实例 Home / Search / New Session、Search 打开最近会话、扁平选中行无灰块、OpenCode2 毛玻璃、项目拖动排序刷新后保留。

## 32. v2.2.0 发布

### 构建与发布

- 官方 `v2.2.0` tag 提交 `1097e2668b` 是合并源；fork 发布时把 `v2.2.0` 标签指向本轮发布提交（即本节所在提交）并推送到 `origin`，仓库版本保持官方 `2.2.0`。
- 内置 CLI 构建：`packages/cli` 下 `OPENCODE_CHANNEL=latest OPENCODE_VERSION=2.2.0-fork.1 bun run build --single`；产物 `dist/cli-darwin-arm64` 版本 `2.2.0-fork.1`。
- 桌面构建：`packages/desktop` 下 `OPENCODE_CHANNEL=prod OPENCODE_VERSION=2.2.0-fork.1 bun run build`，从 `packages/cli/dist` 复制 CLI 到 `resources/opencode-cli`。
- 打包：`OPENCODE_CHANNEL=prod OPENCODE_VERSION=2.2.0-fork.1 bunx electron-builder --mac --arm64 --publish never --config electron-builder.local.ts`；仓库版本不变，`-c.extraMetadata.version` / `OPENCODE_VERSION` 注入 `2.2.0-fork.1`。
- 打包后核验：应用与内置 CLI 版本均为 `2.2.0-fork.1`；`app-update.yml` 更新源为 `omegod/opencode` prod/latest 渠道；`codesign --verify --deep --strict` 通过（`RedixDevCert`）；`latest-mac.yml` 的 SHA-512 与大小同同次构建的 ZIP（282885318 B）与 DMG（292675101 B）一致。
- 发布沿用 macOS arm64：DMG、ZIP、各自 blockmap 与 `latest-mac.yml` 五个资产；Release/tag `v2.2.0` 指向本轮发布提交（即本节所在提交），先创建 draft、上传并核对资产，再发布；随后核对 `releases/latest` 与 `releases/download/v2.2.0/latest-mac.yml` 下载。
- 首次安装提示：本地 `RedixDevCert` 自签，未公证；macOS 需在「隐私与安全性」中允许打开。

## 33. 分组侧栏 peek 不收回修复

### 症状与触发

- 开启「按项目分组」且侧栏折叠时，hover 左上角折叠按钮（或窗口左边缘）让侧栏 peek 出来，再把鼠标移开，面板一直停在 276px，不收回。
- 关闭「按项目分组」后不触发；官方 v2.2.0 没有这个分组设置，也没有对应的常驻菜单。

### 根因

- `packages/app/src/shell/sidebar-peek.ts` 的 `held()` 用 `getClientRects().length > 0` 判断菜单是否打开。
- fork 的分组侧栏在 `packages/app/src/shell/titlebar/project-group-add.tsx` 里用 `forceMount` 常驻「添加项目」菜单；`grouped-tab.css` 只用 `visibility: hidden` 隐藏它，元素仍有布局盒。
- 于是 peek 一直认为有菜单打开，鼠标移开后拒绝关闭；只有分组模式会渲染这个菜单，所以 bug 只在分组模式出现。

### 修复（只改 fork）

- `project-group-add.tsx` 新增 `visible` 状态：菜单关闭且不在关闭动画中时 `display: none`，打开时显示；关闭动画 `titlebar-project-add-close` 结束后（内容仍带 `data-closed`）再隐藏。
- 隐藏菜单不再有布局盒，`held()` 的 `getClientRects()` 返回 0，peek 正常收回；菜单的打开和关闭渐隐动画保持。
- 不修改 upstream 的 `sidebar-peek.ts`；这是 fork 的分组菜单触发的行为，修复留在 fork 文件内。
- 回滚：删除 `visible` signal、`style` 和 `onAnimationEnd`，把 `onOpenChange` 恢复为只在 open 时 `setOpened(true)`；删除下方 e2e 用例。

### 验证记录

- `packages/app` `bun typecheck` 通过（1,874 files）。
- `packages/app` `bun run test:unit`：912 通过 / 0 失败。
- 新增 `packages/app/e2e/regression/tabs.spec.ts` 用例「grouped sidebar peek closes after the pointer leaves」：
  - 修复前在 `not.toHaveAttribute("data-peek", "")` 处超时失败；
  - 修复后 built e2e 3 次重复全部通过，同时验证添加项目菜单仍能打开、按 Esc 关闭后 `display: none`。

## 34. v2.2.0-fork.2 发布

### 构建与发布

- 发布内容：§33 的分组侧栏 peek 修复；仓库版本仍为官方 `2.2.0`，安装包与内置 CLI 版本为 `2.2.0-fork.2`。
- 内置 CLI 构建：`packages/cli` 下 `OPENCODE_CHANNEL=latest OPENCODE_VERSION=2.2.0-fork.2 bun run build --single`；产物 `dist/cli-darwin-arm64/bin/opencode` 版本 `2.2.0-fork.2`。
- 桌面构建：`packages/desktop` 下 `OPENCODE_CHANNEL=prod OPENCODE_VERSION=2.2.0-fork.2 bun run build`，从 `packages/cli/dist` 复制 CLI 到 `resources/opencode-cli`。
- 打包：`OPENCODE_CHANNEL=prod OPENCODE_VERSION=2.2.0-fork.2 bunx electron-builder --mac --arm64 --publish never --config electron-builder.local.ts`；仓库版本不变，`-c.extraMetadata.version` / `OPENCODE_VERSION` 注入 `2.2.0-fork.2`。
- 打包后核验：应用与内置 CLI 版本均为 `2.2.0-fork.2`；`app-update.yml` 更新源为 `omegod/opencode` prod/latest 渠道；`codesign --verify --deep --strict` 通过（`RedixDevCert`）；`latest-mac.yml` 的 SHA-512 与大小同同次构建的 ZIP（282885266 B）与 DMG（292671379 B）一致。
- 发布沿用 macOS arm64：DMG、ZIP、各自 blockmap 与 `latest-mac.yml` 五个资产；Release/tag `v2.2.0-fork.2` 指向本轮发布提交（即本节所在提交），先创建 draft、上传并核对资产，再发布；随后核对 `releases/latest` 与 `releases/download/v2.2.0-fork.2/latest-mac.yml` 下载。
- 首次安装提示：本地 `RedixDevCert` 自签，未公证；macOS 需在「隐私与安全性」中允许打开。

### 验证记录

- `packages/app` `bun typecheck` 通过（1,874 files）；`bun run test:unit` 912 通过 / 0 失败。
- 根 `bun run check` 35/35 通过。
- `packages/app` e2e「grouped sidebar peek closes after the pointer leaves」built 模式 3 次重复通过；修复前同一用例在 `data-peek` 仍存在处超时。
- 用户已在 `OpenCode Dev` 桌面开发版完成手工验收：开启「按项目分组」并折叠侧栏后，peek 移开鼠标正常收回，添加项目菜单开关和关闭动画正常。
