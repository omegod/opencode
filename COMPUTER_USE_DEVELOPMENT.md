# macOS Computer Use 开发文档

> 状态：实施指南，功能尚未实现。
>
> 配套规范：[设计文档](COMPUTER_USE_DESIGN.md)。调研基线：2026-10-02，`v2-omg` / `6a661fc60a`。
>
> 目标：指导后续模型定位源码、分阶段实现、提供可复核的验收结果。

## 1. 实现前检查

1. 阅读根目录 `AGENTS.md`，再读取即将修改目录的局部指南。
2. 确认当前分支、提交和工作区改动，不能把文档基线当成当前 HEAD。
3. 先读设计文档，尤其是状态所有权、坐标、叶子权限和取消语义。
4. 用当前 package.json 核对 Bun、Electron、Effect、Solid、脚本和版本。
5. 先验证原生能力，再完成完整 UI。没有真实接收端结果不能宣布后台输入可用。
6. 每阶段报告改动、检查结果、限制和下一步；未执行的检查写“未执行”。

调研时已有 `packages/cli/package.json` 修改及未跟踪 `.zcode/`。它们不是本功能文件，开始实现时重新核对并保留用户工作。

### 1.1 开发约束

- 遵循根目录分支/worktree 约定，不重置或清理用户修改。
- 未经用户要求不自行委派其他 Agent。
- 不重启用户正在工作的 OpenCode App/Server，使用隔离开发环境。
- GUI 验收使用专用测试窗口、临时文档和临时文件。
- 默认单元测试不得隐式操作桌面或启动原生 Receiver 应用。
- 不直接运行 tsc，使用包内 `bun typecheck`；不从根目录运行测试。
- TypeScript 遵守现有 Effect、导出和命名习惯；Swift 保持明确线程/actor 边界。
- 新接口都属于拟议设计；遇到源码没有的 API，先查实际类型，不编造方法。

## 2. 必读源码地图

### 2.1 工具与权限

| 文件                                                                          | 目的                             |
| ----------------------------------------------------------------------------- | -------------------------------- |
| [plugin-browser/README.md](packages/plugin-browser/README.md)                 | Server/Desktop 职责与 attachment |
| [plugin-browser/src/index.ts](packages/plugin-browser/src/index.ts)           | 组合入口                         |
| [plugin-browser/src/rpc.ts](packages/plugin-browser/src/rpc.ts)               | 纯协议和 Operations              |
| [plugin-browser/src/connection.ts](packages/plugin-browser/src/connection.ts) | 请求、替换、会话移动/删除        |
| [plugin-browser/src/tools.ts](packages/plugin-browser/src/tools.ts)           | 工具执行与图片内容               |
| [schema/src/tool.ts](packages/schema/src/tool.ts)                             | 实际 Context、Result、Options    |
| [core/src/tool/AGENTS.md](packages/core/src/tool/AGENTS.md)                   | 叶子权限与目录过滤               |
| [core/src/tool/plugin/webfetch.ts](packages/core/src/tool/plugin/webfetch.ts) | 内置工具获取 Permission.Service  |
| [core/src/tool/mcp.ts](packages/core/src/tool/mcp.ts)                         | MCP 叶子的 permission.assert     |
| [core/src/plugin/internal.ts](packages/core/src/plugin/internal.ts)           | 内置插件注册和 services          |
| [core/src/tool.ts](packages/core/src/tool.ts)                                 | 图片规范化和结果处理             |

不要整份复制 Browser 插件。网络隧道、CDP、页面文件策略以及其现阶段特有的授权行为都不应原样迁入 Computer。

### 2.2 Desktop 和 App

| 文件                                                                                                                 | 目的                                |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| [main/browser-pane.ts](packages/desktop/src/main/browser-pane.ts)                                                    | Desktop attachment 与 Server 客户端 |
| [main/ipc.ts](packages/desktop/src/main/ipc.ts)                                                                      | IPC handler 总入口                  |
| [ipc-handlers/events.ts](packages/desktop/src/main/ipc-handlers/events.ts)                                           | sender 校验、延迟加载、清理         |
| [ipc-transport.ts](packages/desktop/src/main/ipc-transport.ts)                                                       | MessagePortMain 实际传输能力        |
| [shared/ipc-rpc/browser.ts](packages/desktop/src/shared/ipc-rpc/browser.ts)                                          | 原生 IPC Schema 模式                |
| [renderer/api.ts](packages/desktop/src/renderer/api.ts) / [api-types.ts](packages/desktop/src/renderer/api-types.ts) | Renderer API 映射                   |
| [renderer/platform/index.ts](packages/desktop/src/renderer/platform/index.ts)                                        | 平台注入                            |
| [app platform/browser-pane.ts](packages/app/src/runtime/platform/browser-pane.ts)                                    | App 平台边界                        |
| [browser/attachments.ts](packages/app/src/session/browser/attachments.ts)                                            | 会话切换后的连接生命周期            |
| [browser/model.ts](packages/app/src/session/browser/model.ts)                                                        | 会话 UI 模型                        |
| [browser/pane.tsx](packages/app/src/session/browser/pane.tsx)                                                        | Solid 视图和可见性                  |
| [session-side-panel.tsx](packages/app/src/session/files/session-side-panel.tsx)                                      | Review 标签页                       |
| [review/view.tsx](packages/app/src/session/review/view.tsx)                                                          | Review 组合                         |
| [session-tabs.ts](packages/app/src/shell/state/session-tabs.ts)                                                      | 标签页身份和布局                    |

### 2.3 构建与约束

- [electron-builder.config.ts](packages/desktop/electron-builder.config.ts)：渠道 ID、资源、签名、公证。
- [prebuild.ts](packages/desktop/scripts/prebuild.ts)：预构建入口。
- [Desktop package.json](packages/desktop/package.json)：开发和打包命令。
- [App package.json](packages/app/package.json)：单元、组件、E2E 与性能脚本。
- [Code Mode 指南](packages/codemode/AGENTS.md)：不能把宿主会话/权限塞进通用解释器。

## 3. 拟议源码结构

按阶段创建有明确责任的文件，不要先生成全部空壳。

```text
packages/plugin-computer/
  package.json / README.md / tsconfig*.json
  src/
    index.ts              # 组合连接和工具，要求叶子授权依赖
    rpc.ts                # 纯 Schema、Operations、RPC
    connection.ts         # attachment、pending requests、取消
    tools.ts              # 工具工作流、结果与图片内容
    files.ts              # 确有需要时处理 Server 观察附件
  test/
    contract.test.ts / connection.test.ts / tools.test.ts

packages/core/src/tool/plugin/computer.ts
  # 获取 Permission.Service 并注册 Computer 的薄适配

packages/desktop/native/computer-use/
  Package.swift
  Sources/
    ComputerUseCore/       # 目标、几何、AX、输入、采集、控制
    ComputerUseHelper/     # App 生命周期、本地协议、系统权限
  Tests/ComputerUseCoreTests/
  Fixtures/Receiver/       # 显式启动的 AppKit 接收器
  Resources/Info.plist
  README.md

packages/desktop/src/main/computer/
  service.ts              # 唯一 Main owner
  bridge.ts               # Server attachment 与执行
  helper.ts               # 启动、握手、退出
  native-protocol.ts      # Swift 对应协议
  frames.ts               # 最新帧共享、读取、背压
  pip.ts                  # PiP 窗口生命周期

packages/desktop/src/shared/ipc-rpc/computer.ts
packages/desktop/src/main/ipc-handlers/computer.ts
packages/desktop/src/renderer/platform/computer.ts

packages/app/src/runtime/platform/computer.ts
packages/app/src/session/computer/
  attachments.ts / model.ts
  view.tsx                # Review / PiP 共用视图
  frames.ts               # 拉帧、解码、释放
```

### 3.1 现有文件修改清单

| 位置                              | 修改                                      |
| --------------------------------- | ----------------------------------------- |
| `core/src/plugin/internal.ts`     | 注册 Core Computer 适配，核对配置装配顺序 |
| Core/Desktop/App package.json     | 实际需要的 workspace 依赖                 |
| `desktop/src/main/ipc.ts`         | 组合 Computer handler layer               |
| Desktop shared IPC 总出口         | 接入新 RPC                                |
| Renderer API / platform           | 暴露 Computer 平台能力                    |
| `app/src/desktop.ts` / 平台总类型 | 导出契约                                  |
| 会话组合、Review、tab helpers     | Computer 模型与标签页                     |
| Desktop settings / SQLite state   | 开关、模式、PiP 偏好                      |
| English i18n 源文件               | 可见文案、tooltip、ARIA                   |
| Desktop 构建/打包                 | Helper 编译、资源、签名                   |
| bun.lock                          | 通过实际依赖变更更新                      |

新插件 RPC 不自动等于公共 Protocol/Server HttpApi 改动。如果确实修改公共 API，在 `packages/client` 执行 `bun run generate`，禁止手改生成文件。

## 4. M0：原生可行性验证

### 4.1 实施任务

1. 记录 macOS build、CPU、Swift、Command Line Tools。
2. 创建 Swift Package 与最小 Helper.app，固定开发 Bundle ID。
3. 验证 LaunchServices 启动、事件循环、socket ready、退出。
4. 分别验证 AX 和 Screen Recording，记录系统显示的授权主体。
5. 枚举应用、CGWindow、AXWindow，建立可复核关联。
6. 捕获原生窗口，验证四角、标题栏、内容区和图像变换。
7. Receiver 中执行 click/type/key/scroll/drag，记录实际结果。
8. 将 Receiver 遮挡，在 background 重复操作，记录前台 PID 与用户鼠标位置。
9. 在 Electron/浏览器目标重复点击、中文输入、画布拖拽。
10. 图片经过 OpenCode 返回和 normalize 路径后，再验证归一化坐标点击。

### 4.2 Receiver 需求

- 中英文、emoji、换行文本框。
- 点击计数器、双击及右键可见状态。
- 横向/纵向滚动区域。
- 只有持续按住鼠标才绘制的画布。
- 可拖动物体及落点判定。
- down/drag/up、修饰键、文本事件和窗口身份记录。
- 可改变窗口位置/大小，以验证多显示器与 Retina。

不要只断言注入函数被调用：文本要核对最终内容，画布要形成有效线段，拖拽要改变物体位置。

### 4.3 产物与放行

在原生 README 记录系统/Helper/目标应用版本、模式、动作、接收端结果、焦点与指针变化、几何以及失败边界。

回写设计文档的最低系统、工具链、默认时序和输入驱动。未验证的应用不能列为支持。

放行条件：原生窗口观察与输入闭环成立；至少一个复杂界面有真实动作结果；不支持的 background 路径能明确拒绝而非隐式置前。

## 5. M1：契约、插件与叶子权限

### 5.1 纯协议优先

在 rpc.ts 定义：

- 不同的 TargetID、ObservationID、ElementRef、FrameID 类型。
- App、Window、Target、Capabilities、ControlState。
- 设计文档中固定的工具名称、参数单位及动作结果。
- Attach/State/Command/Result/Status RPC。
- 带执行阶段的错误联合和小型控制事件。

验证要求：

- 未知输入在边界解码，内部不重复写手工类型判断。
- 坐标为有限数且位于 `[0,1]`，拒绝 NaN/Infinity。
- locator 两种形态互斥，不能同时传元素和坐标。
- 明确文本、数组、AX、图像、队列的大小限制。
- MIME、尺寸、字节长度一致；每个 operation 验证自己的 output。
- TS/Swift 共享协议 fixture，覆盖双向解码，而不是只有同语言 roundtrip。

### 5.2 Connection

- 先订阅后 attach，匹配 connectionID/version。
- 会话删除、移动、卸载、替换时关闭旧 connection。
- 参数仅通过现有认证 command RPC 读取。
- 迟到 result 不完成新 attachment 的请求。
- pending requests 有上限，满时 busy。
- 输入不 retry；只读状态恢复可以明确重试。
- 传输失败保留原生 dispatched/unknown，不能统一标 not_started。

### 5.3 Core 薄适配

现有 Effect `Tool.Context` 没有 `askPermission()`，也没有 Promise 工具上下文中的 signal。不要照模型记忆生成不存在的 API。

在 `core/src/tool/plugin/computer.ts`：

1. 采用现有 built-in 入口形式。
2. 构造时获取 Permission.Service。
3. 将仅供 Computer 叶子使用的 authorize 实现传给新注册入口。
4. 用真实 context 构造 source：`{ type: "tool", messageID: context.messageID, id: context.id }`。
5. 按“解析目标→授权→再验证目标→派发”执行。

依赖注入结构示意，以下不是已有 API：

```text
Core Computer Plugin
  acquire Permission.Service
  Computer.register(ctx, {
    authorize(operation, resolvedTarget, canonicalToolContext)
  })
```

这是工具叶子闭包依赖，不是通用 Registry 新增授权回调。插件不得反向导入 Core。

授权验证：

- observe/input 两类策略实际执行；Plan 不能输入。
- attachment 不能追加覆盖 deny 的 allow。
- 已捕获工具快照调用时仍检查策略/可用性。
- release 与取消清理只作用于本 owner；权限撤销不能使已按下键无法释放。
- 不用 catchCause 吞掉用户拒绝或中断，遵守 Core Tool 指南。

### 5.4 图片和 Code Mode

- output 返回有界 AX 和 observation 元数据。
- 图片使用 `content: [{ type: "file", uri, mime, name }]` 的真实 Tool.Result。
- 不把 JPEG 标为 PNG；不只返回 Desktop 文件路径。
- 坐标归一化到完整图像，确认 normalize 不裁剪。
- 显式观察的图片与 observationID 一一对应，不用后续预览替换。
- 动作默认不截图，observe 显式观察；预览流独立。
- 工具注册 codemode，允许连续 await；同 target 的动作不可 Promise.all。

## 6. M2：Swift Helper

### 6.1 职责

| 模块          | 职责                             |
| ------------- | -------------------------------- |
| TargetStore   | 进程实例、窗口关联、目标引用     |
| Accessibility | 有界遍历、元素动作、引用验证     |
| Geometry      | 图像、逻辑窗口、全局事件坐标变换 |
| Capture       | 单次观察、SCStream、帧缓存       |
| Input         | 键鼠、文本、滚动、完整拖拽       |
| Control       | owner、暂停/接管、串行输入与清理 |
| Transport     | 消息边界、大小限制、取消与断开   |

使用 actor 或等效 owner 管理输入。明确 AppKit 主线程要求，不让耗时 AX 遍历阻塞整个取消通道。

### 6.2 目标和观察

- pid 必须配合进程实例身份，不能复用旧进程目标。
- CGWindow/AXWindow 关联不确定就报错。
- 显式 observe 增加观察代次；预览只增加 frameID。
- native 悬空 AX 引用返回 stale_element。
- 几何变化、进程重启、接管、Helper 重启使相关引用失效。
- AX-only 观察不能用于坐标点击；type/key 验证焦点仍属于绑定窗口，避免同进程多窗口串输。
- AX 与截图间几何变化可重试一次只读观察或返回不稳定，不做无限循环。
- 对系统 API 不支持/权限错误做类型化处理，不返回空数组冒充成功。

### 6.3 输入语义

**点击：** elementRef 仅执行明确支持的 AX 动作，坐标使用验证过的定向事件。右键、双击独立验收。

**文本：** 采用 M0 验证的 Unicode 路径，明确当前输入目标。覆盖 UTF-16 代理对、emoji、中英文和换行，不用 AXSetValue 悄悄替换整个字段。

**快捷键：** 有限键名集合；严格 down/up 顺序；Backspace/Delete 分开；异常释放已按下修饰键。

**滚动：** 按协议逻辑点和方向生成事件，验证精确滚动、横向滚动、目标窗口字段。不要让用户“自然滚动”偏好改变工具方向定义。

**拖拽：** 完整 down/move/up 一个调度单元。插值数量、字段和时长按接收端结果确定，不把第三方“固定五事件”当成功条件。

**焦点：** background 不主动激活；无法派发时 foreground_required。已经可能执行的动作不自动换路径重试。

### 6.4 取消与退出

- 暂停/断开先阻止新动作。
- 未开始项 not_started；执行中的动作保留阶段。
- 已 mouseDown/keyDown 必须尝试对应释放。
- 清理有界，失败标 unknown，并显示实际状态。
- Main 失联撤销 owner，停止捕获与输入。
- 不用重启 Helper 代替普通暂停。

## 7. M3：Desktop Bridge、协议与打包

### 7.1 Main 服务

- 单一 Computer service 合并启动请求。
- 按渠道定位 Helper，检查版本、架构、hello 与实例。
- 映射 Server/session/connection 到原生 owner。
- 保有 UI 可恢复状态和最新帧，不成为第二份输入状态真相。
- 注册现有 Shutdown 生命周期。
- 未启用时不加载重模块、不启动 Helper。
- 会话空闲/完成如何释放 owner，必须从当前公共事件或状态投影确认；不要编造 session.completed 事件名。
- 释放输入互斥权不能抹掉用户的暂停标记；补测“暂停→Agent 空闲→再次提问”仍须用户继续才能输入。

### 7.2 IPC

- 增加 shared IPC Schema 与 handler layer，在 main/ipc.ts 注册。
- 校验真实 sender、可信窗口 URL 和绑定。
- Renderer API/API types/platform 正常暴露，业务组件只用 platform。
- PiP 接入现有 preload/可信 URL/sender 规则，不能为了通信禁用校验。
- PiP 不取得新的 Server attachment，不获得原生 socket 或 Server 私密凭据。

### 7.3 本地协议与帧

- NDJSON 处理增量读取、拆包、粘包、超长行、断开。
- 帧处理部分 header/payload，长度合法后再分配内存。
- observation 指定 frameID，预览读取 latest，两种行为不能混淆。
- Main/Helper 缓存有数量与字节上限，完成/取消后释放观察占用。
- 不通过高频同步写 JPEG 文件实现实时预览。
- MessagePortMain 会复制字节，验证实际内存和延迟。
- 控制取消不经过预览帧的大字节队列。

### 7.4 打包

新增专门脚本完成 Swift 编译、App bundle 组装、渠道 Bundle ID/展示名称、资源复制。

接入现有流程：

1. 为目标架构构建 Helper。
2. 组装 Contents/MacOS、Info.plist 和资源。
3. 放入 asar 外的 Desktop bundle 资源位置。
4. 嵌套顺序签名，再执行外层签名与公证。
5. afterPack 检查产物非空、架构/版本正确。
6. 安装版验证启动、授权主体、升级后行为、正常退出。

开发签名通过不代表生产 TCC 身份已验证。签名/公证凭据缺失时报告环境阻塞，不伪造通过。

### 7.5 远端 Server

至少验证一条无共享文件系统链路：远端发 observe → 本机 Helper 捕获 → 字节过 RPC → Server 保存附件 → 模型收到图像。

返回的文件路径必须属于 Server。UI 显示执行设备为本机 Mac。把 Desktop 路径作为远端图片结果不算通过。

## 8. M4：Review 实时视窗

### 8.1 UI 模型和标签页

- model 协调能力、目标、状态和用户命令，真相来自 Main/Helper。
- 按 App 指南使用 createStore，不在视图直接调用 FS/socket/Server 内部模块。
- 添加独立 SESSION_COMPUTER_TAB，不伪装 file:// 或 browser 标签页。
- 更新 helpers、tabs、会话组合和 Review 渲染。
- 当前会话首次绑定可 reveal，后台会话只更新状态。
- 路由或设置页切换不能重复启动 Helper。

### 8.2 状态覆盖

至少覆盖 disabled、unsupported、connecting、permission-required、ready、observing、agent、pausing、paused、human、target-closed、capture-unavailable、disconnected。

### 8.3 画面

- contain 显示，不调整真实目标窗口。
- 图像/光标/AX 高亮共用归一化坐标到显示矩形的变换。
- 覆盖层绑定 actionID、targetID、geometryRevision；目标或几何改变时清除旧覆盖层。
- 拉帧完成后再调度下一次，不堆定时器请求。
- 解码新帧时保留上一帧；来源改变时显示切换状态，不能误认旧图为新窗口。
- 缺帧显示更新时间和原因。
- 卸载释放 Blob URL、ImageBitmap、定时器和订阅。

### 8.4 控制栏

- 暂停：pausing → Helper 确认 → paused。
- 接管：暂停确认后激活真实应用，用户在应用内操作。
- 继续：旧观察失效 → 新观察 → 恢复输入准入。
- 结束控制：清理、取消未开始项、释放 owner/target。
- 弹出：显示唯一 PiP，不额外 bind 或 attach。
- 关闭标签页：取消展示订阅，任务仍可继续。

### 8.5 UI 规范

- English source keys 覆盖按钮、tooltip、ARIA、空态和错误。
- 复用现有 Tabs、IconButton、字体和间距 token。
- 覆盖窄面板、主题、键盘导航和中间状态。
- 修改 session/timeline 前按 App 指南记录生产性能基线，修改后比较。

## 9. M5：PiP 与生命周期

- Electron 窗口使用受信任本地 renderer 和共用 ComputerView。
- 自动显示采用非激活方式，always-on-top 层级通过实测确定。
- 当前状态来自 Main 快照，不依赖收到完整历史事件。
- 跟随/固定只改变展示，不改变输入 owner。
- 关闭 PiP 不退出 Helper、不停止 Agent。
- 源会话结束、删除或断开时显示最后状态并停止预览。

必测序列：

1. Review 开 → PiP 开 → Review 隐藏，PiP 持续更新。
2. 两视窗同时显示，只有一个共享捕获源。
3. 两者关闭，连续采集停止，observe 仍可按需捕获。
4. 用户在其他应用持续输入，PiP 自动更新不抢焦点。
5. 跟随模式切换会话；固定模式不跟随。
6. Helper 晚于 UI 就绪时自然恢复，不永久 loading。
7. 暂停期间目标关闭，状态能收敛而非永久 pausing。
8. Desktop 退出后 Helper、socket、帧读取与 pending IPC 结束。

## 10. 测试与测量

### 10.1 自动化测试（不操作桌面）

| 层         | 有意义的验证                             |
| ---------- | ---------------------------------------- |
| Schema     | locator 互斥、坐标、版本、超限、错误阶段 |
| 插件       | 替换、取消、迟到结果、移动、图片字节     |
| 叶子授权   | deny 不派发、Plan 不输入、快照仍检查     |
| Swift 几何 | 原点、Retina、标题栏、window/global 变换 |
| Swift 手势 | 真正事件工厂、顺序、取消 release         |
| 跨语言     | TS 编码 Swift 解码，反向亦然             |
| Main 传输  | 部分包、超长包、Helper 死亡、断开        |
| UI         | 状态、标签隔离、拉帧背压、资源释放       |

测试真实模块和小型可控对端，不写仅重复实现逻辑的 mock 来宣布成功。

### 10.2 显式 GUI 矩阵

| 场景            | 核心断言                            |
| --------------- | ----------------------------------- |
| 原生文本框      | 中英、emoji、换行内容正确           |
| 后台原生窗口    | 目标收到操作，用户焦点/指针符合模式 |
| Electron        | 输入正确或明确 foreground_required  |
| Canvas          | 持续按下形成有效线段                |
| Finder 临时文件 | 同窗口拖拽产生实际移动结果          |
| 多显示器        | 不同缩放、负全局坐标点击正确        |
| 窗口 resize     | 旧观察拒绝、新观察正确              |
| 进程重启        | 旧 target 不能作用于新进程          |
| 接管            | 暂停确认后无后续输入，继续先观察    |
| 授权撤销        | 状态正确，不伪造截图成功            |
| 两个会话        | 第二会话不能穿插第一会话输入        |
| 远端 Server     | 本机操作、图像到远端模型            |
| PiP             | 不抢焦点、不重复捕获、关闭释放资源  |

每项标为通过、失败、未测或明确不支持，不能把未测写为“理论支持”。

### 10.3 性能记录

- capture、encode、IPC、decode、dispatch 的 p50/p95。
- 连续预览一分钟的 FPS、CPU、内存、丢帧。
- 所有视窗关闭后的捕获停止和内存回落。
- 一次观察 + 五个动作 + 再观察的模型请求数及实际结果。
- 未启用功能时的 Desktop 启动开销。
- session UI 改动前后的现有 benchmark。

5–10 FPS 是初始交互目标，不是无界队列/内存增长的理由。模型耗时和原生耗时分开报告。

## 11. 开发检查命令

以下已有命令按当前 package.json 核实。调用时设置正确工作目录，不从根目录执行测试。

根目录只读检查：

```sh
git status --short --branch
git log -1 --format='%h %cs %s'
```

在受影响 TypeScript 包目录：

```sh
bun typecheck
```

App 包内现有测试入口：

```sh
bun run test:unit
bun run test:browser
bun run test:components
```

优先用实际脚本支持的方式指定相关文件；有新失败或未解决问题时再扩大范围。

Desktop 包内：

```sh
bun test
```

涉及实现变更时最终在根目录执行规范检查：

```sh
bun run check
```

公共 Protocol/Server HttpApi 变化时，在 packages/client：

```sh
bun run generate
```

### 11.1 新建后才可用的命令

plugin-computer 建立并配置同类 scripts 后，在新包内：

```sh
bun test
bun typecheck
```

Swift Package 创建后，在原生目录：

```sh
swift build
swift test
```

真实 GUI 测试提供独立显式入口并写入原生 README。swift test 默认不能操作用户桌面。

### 11.2 开发与打包

仓库已有 `bun run dev:desktop`，启动前检查 dev 脚本如何连接 Server，使用隔离实例。

打包沿用 Desktop prebuild/build/package:mac 并加入 Helper 构建。没有实际安装包、签名或 TCC 验证时，不得称已完成发布验证。

仅文档变更使用本地 Markdown 格式检查即可，不为 Markdown 运行真实 GUI 测试。

## 12. 常见错误实现

以下情况必须在 review 修正：

1. 静态截图充当实时视窗，或只交付工具不交付内嵌 UI。
2. 每个动作启动 Swift、每个面板启动 Helper。
3. 把 ZCode 占位包当成可用原生内核。
4. 把第三方复刻、静态符号猜测当 Codex 官方实现。
5. 把 CGEventPostToPid 的存在当任意应用后台兼容证据。
6. preview frameID 使模型 AX 引用持续失效。
7. 使用原始截图像素坐标，忽略 Core 缩放。
8. 广播图片/AX/输入正文，或每帧写 SQLite。
9. 无界帧队列、无界 pending 请求、关闭视窗后持续采集。
10. 把 options.permission 当执行检查，或 attachment 覆盖 deny。
11. 插件反向导入 Core/Desktop 实现。
12. 编造 Effect Tool.Context.signal、ctx.permission.assert 或 Desktop 插件面板 API。
13. catchCause 吞掉取消或用户拒绝。
14. 超时后重复点击/输入，或自动改另一条输入路径重试。
15. AXSetValue 冒充插入文本，拖拽无异常即判成功。
16. Renderer 拿 Server 凭据/socket，或为 PiP 放宽全部 sender 校验。
17. 重启用户 live App/Server 排查问题。
18. 手改生成客户端，未验证安装包却宣称发布完成。

## 13. 最终验收清单

### 功能

- [ ] 应用/窗口发现与显式 target 绑定。
- [ ] 模型收到 AX 和真正可见的图像附件。
- [ ] 所有动作在支持矩阵内产生真实结果。
- [ ] 不支持后台的目标清楚报告能力差异。
- [ ] Review 和 PiP 实时视窗均完成。
- [ ] 图像、光标、高亮坐标一致。
- [ ] 暂停、真实应用接管、重新观察后继续。
- [ ] 同一 Helper 下多会话输入互斥。

### 生命周期与集成

- [ ] Helper 按需唯一启动，退出清理。
- [ ] 系统授权主体和安装包行为已验证。
- [ ] Plan/deny 策略经叶子检查生效。
- [ ] Session 移动/删除、替换、断开、Helper 崩溃正确收敛。
- [ ] 取消后键鼠清理；未知结果不自动重放。
- [ ] 无共享文件系统的远端链路通过。
- [ ] 图片输出通过 Core 规范化后坐标仍正确。
- [ ] UI 隐藏停止拉帧，全部隐藏停止连续采集。
- [ ] English i18n、平台不可用态和原有 Browser/Review 回归通过。

### 工程证据

- [ ] 相关单元、协议、组件测试通过。
- [ ] 真实 GUI 矩阵附系统/应用版本和结果。
- [ ] 性能基线和资源释放有记录。
- [ ] `bun run check` 已执行并报告真实结果。
- [ ] 公共 API 改动时重新生成客户端。
- [ ] 两份文档与最终实现一致，拟议和未支持项明确标注。

## 14. 给后续模型的任务切片

建议按依赖顺序串行推进。每个切片的交付应能单独 review，不意味着必须委派子 Agent。

| 切片         | 输入              | 输出                            | 不可跳过的证据        |
| ------------ | ----------------- | ------------------------------- | --------------------- |
| A 原生验证   | 设计第 6–9 节     | 最小 Helper、Receiver、支持矩阵 | 真实动作与坐标        |
| B 契约与插件 | A 固定的能力/错误 | 纯 RPC、工具、Core 适配         | 叶子 deny、取消、结果 |
| C 原生产品化 | A/B 协议          | Swift 后端和生命周期            | 跨语言 fixture、清理  |
| D Desktop 桥 | B/C               | Main 服务、IPC、远端结果        | 不共享文件系统        |
| E Review     | D                 | 会话模型和实时视图              | 背压、坐标、接管      |
| F PiP/发布   | E                 | 小窗、安装包、文档              | 无抢焦点、TCC、资源   |

### 14.1 可复用的交接提示

```text
请先阅读根 AGENTS.md、COMPUTER_USE_DESIGN.md、COMPUTER_USE_DEVELOPMENT.md，
再读取目标目录的 AGENTS.md 和当前实现。
本次实现切片：<A–F 与具体范围>。
核实当前 HEAD 和已有修改，保留无关用户工作。
文档中新接口是拟议设计，不要假设已存在，也不要编造 API。
遵守依赖方向、叶子权限、归一化坐标和不自动重放输入的约束。
按切片验证，提供改动文件、实际命令、真实结果与未完成项。
若原生实验推翻设计默认值，先说明证据并同步更新对应设计。
```

### 14.2 每阶段交付报告格式

```text
阶段 / HEAD：
已实现行为：
改动文件：
协议或设计变更：
自动化检查（工作目录、命令、结果）：
GUI 实测（系统、应用、动作、证据）：
性能/资源结果：
已知限制与未执行检查：
下一阶段前置条件：
```

禁止把“已完成代码”“类型检查通过”“真实 GUI 通过”“安装包已验证”混成一个完成状态。完整交付以本清单的实际证据为准。
