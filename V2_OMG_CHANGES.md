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
- 分组内的会话行缩进一级：缩进做在行内 padding（`ps-4`）上，背景/hover/激活高亮仍是整行宽度，水平与非分组模式不受影响。
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
