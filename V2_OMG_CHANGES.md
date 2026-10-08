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
