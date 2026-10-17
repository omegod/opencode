# macOS Computer Use 设计文档

> 状态：待实现的设计基线。本文中的新包、工具、协议和设置均为拟议接口，不代表当前仓库已经提供。
>
> 调研日期：2026-10-02。源码基线：`v2-omg`，提交 `6a661fc60a`。
>
> 开发顺序、源码修改清单与验收方法见 [开发文档](COMPUTER_USE_DEVELOPMENT.md)。

## 1. 产品目标与范围

让 OpenCode Desktop 的 Agent 能观察、操作本机 macOS 应用，同时让用户看见操作过程并随时接管。

完整交付包含：

1. 原生应用与窗口发现、AX 无障碍状态、截图、点击、文本输入、快捷键、滚动和拖拽。
2. 通过现有工具注册和 Code Mode 调用，允许一次调用内顺序执行多个已确定动作。
3. Review 右侧 Computer 标签页：实时画面、目标、动作、暂停和接管。
4. 可弹出的置顶 PiP 小窗，与 Review 共用捕获和控制后端。

### 1.1 首版范围

- 执行设备是运行 Desktop 的 Mac；Server 在远程时也操作这台 Mac。
- 建议以 Apple Silicon、macOS 14+ 为开发基线；M0 必须确认最低系统和 Swift 工具链，再更新文档。
- 当前用户、已解锁图形会话、单应用单窗口内操作优先。
- 后台输入按应用和动作实测，不承诺任意应用均支持。
- Windows/Linux、锁屏执行、虚拟桌面、跨应用拖拽、手机观看、完整录像回放不在首版范围。
- 首版人工接管是“暂停 Agent，然后切到真实应用操作”。镜像面板内直接发送人工键鼠输入可后续实现。

### 1.2 用户体验

- 用户启用功能并完成系统授权后，Agent 才可使用。
- 当前会话首次绑定目标可自动展示 Computer 标签页；后台会话不抢用户正在看的标签页。
- 界面显示设备、应用、窗口、后台/前台模式及控制状态。
- 关闭视窗只关闭展示；“暂停”阻止后续输入；“结束控制”释放当前会话控制权。
- 静态最后一帧必须标明更新时间，不能伪装成实时画面。

## 2. 调研事实及证据边界

### 2.1 Codex

OpenAI 官方确认 macOS 后台 Computer Use、应用观察与输入、自有可视光标。产品介绍不是底层 API 的稳定性保证。

第三方针对 2026-09-09 官方安装包的分析记录了以下原生调用链：

```text
JavaScript 调用环境 → @oai/cua / @oai/sky
→ 本地 IPC → SkyComputerUseService
→ AX 查询、窗口观察、向进程/窗口定向输入
```

借鉴点：独立原生服务、目标绑定、观察和动作分离、批处理、光标反馈。不能把第三方复刻的全部行为当作 Codex 官方实现，也不能从静态导入表缺少 CGEventPost 推导“官方只用 AX”。

公开分析和问题报告显示，后台焦点、Electron 事件接收、拖拽持续按键状态存在实际兼容性问题。验收必须检查接收端结果，而非仅检查工具无错误返回。本方案不以复刻 Codex 私有协议、固定事件数量或延迟为目标。

### 2.2 ZCode

本次检查的本机 ZCode 仓库为 `29628c9`（2026-09-24）。以下路径属于 ZCode，不属于 OpenCode：

| 路径                                                                  | 可确认事实                                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/services/src/node.ts`                                       | 长期、按需启动的独立 Helper，持有 AX/Screen Recording 权限；区分本地和远端宿主 |
| `packages/services/src/cua-permission-broker/cuaPipSessionService.ts` | PiP 有独立的会话事件通道                                                       |
| `packages/desktop/src/main/cuaPipFocusRouter.ts`                      | 将窗口焦点及当前会话同步给 PiP                                                 |
| `packages/zcode-cua/pip-session.d.ts`                                 | 任务开始、工具开始、焦点变化、任务结束等事件                                   |
| `packages/zcode-cua/README.md`                                        | Computer Use 核心为 API 兼容的不可用占位包                                     |

因此可以参考 Helper/Broker/PiP 外围架构，不能声称从该源码验证了截图、点击、编码及 PiP 底层实现。社区 ZCode MCP 也不等于官方内核。

### 2.3 OpenCode 已有基础

| 参考文件                                                                        | 可复用部分                              |
| ------------------------------------------------------------------------------- | --------------------------------------- |
| [plugin-browser/src/index.ts](packages/plugin-browser/src/index.ts)             | 插件组合入口                            |
| [connection.ts](packages/plugin-browser/src/connection.ts)                      | 会话 attachment、请求、结果、取消与替换 |
| [tools.ts](packages/plugin-browser/src/tools.ts)                                | Code Mode 工具与图片附件返回            |
| [browser-pane.ts](packages/desktop/src/main/browser-pane.ts)                    | Desktop 主动连接 Server 的执行桥        |
| [platform/browser-pane.ts](packages/app/src/runtime/platform/browser-pane.ts)   | App 与 Electron 平台边界                |
| [browser/model.ts](packages/app/src/session/browser/model.ts)                   | 会话绑定与 UI 联动                      |
| [session-side-panel.tsx](packages/app/src/session/files/session-side-panel.tsx) | Review 标签页实际入口                   |

原生应用通过采集后渲染进入 Review，不能直接把任意 macOS 应用当作 `WebContentsView` 嵌入。

两个已核实约束：

1. [Core Tool 指南](packages/core/src/tool/AGENTS.md)：`options.permission` 只控制工具定义过滤，实际执行授权归叶子逻辑。
2. [core/src/tool.ts](packages/core/src/tool.ts)：返回图片可能被 `Image.Service.normalize` 二次缩放，坐标不能依赖原始像素尺寸。

## 3. 总体架构与依赖方向

```text
OpenCode Server（本机或远程）
  Session Runner / Code Mode
    → Core Computer 叶子权限适配
    → @opencode/plugin-computer（工具、RPC、attachment、图片结果）
                   ⇅ 已有认证 Plugin RPC
Mac / Electron Main：Computer Bridge
  Helper 生命周期、会话路由、最新帧、Review / PiP
       ⇅ 本地 IPC                    ⇅ 原生 IPC
Swift Helper.app                Solid ComputerView
  AX / Capture / Input           Review + PiP
  Target / 控制串行化
       ↓
本机 macOS 应用
```

架构决策：

- `plugin-computer/rpc` 只含 Schema、描述和纯协议，供 Desktop/App 导入。
- 插件运行时不导入 Core、Server、Desktop 实现。
- Core 增加薄适配器，获取 `Permission.Service`，向 Computer 叶子注册入口注入授权函数。不得改通用 Registry 加第二套授权机制。
- Desktop 通过 Client/Plugin RPC 调用 Server，不导入服务端插件运行时。
- Swift Helper 不依赖模型、会话数据库或网页渲染器。
- App 经平台接口调用 Desktop，保留现有 `window.api` 边界。
- PiP 由 Electron 创建，共用 Solid 视图，不另写一份 SwiftUI 状态机。
- 不增加模型 provider 协议，不重写 Agent 循环，不先建设通用 Desktop 插件面板系统。

这是“插件 + 原生 Helper + 源码 UI 集成”的方案。当前普通插件没有注册 Review 面板的通用入口。

## 4. 状态所有权与控制生命周期

| 状态                                   | 唯一所有者                     |
| -------------------------------------- | ------------------------------ |
| Agent 执行、工具历史、策略             | Server/Core                    |
| 会话与 Desktop attachment              | 插件 connection                |
| Helper 进程、UI 绑定、Server 路由      | Electron Main                  |
| 控制 owner、输入队列、target、按键状态 | Helper                         |
| AX 引用、观察代次、截图几何            | Helper                         |
| 连续帧                                 | Helper 采集；Main 仅缓存和分发 |
| 面板布局、PiP 固定偏好                 | Desktop/App                    |
| 系统权限事实                           | macOS 与 Helper 探测           |

### 4.1 绑定与互斥

- Server attachment 验证 session 和 location。
- Main 的 key 包含 Server 身份、sessionID、connectionID，不能只用项目路径或 sessionID。
- Helper ownerID 由 Main 注入，模型不得构造或替换。
- 首版同一 Helper 只允许一个会话持有输入控制权，其他会话返回 busy，不无限等待。
- 控制权跨工具调用保留，避免“点击输入框→输入”之间被其他会话穿插。
- 第一个输入动作原子取得 owner；会话结束、释放、断开或退出时回收。
- 当前 owner 的动作串行执行；取消控制通道不受普通输入队列阻塞。
- 互斥仅覆盖受管 OpenCode 任务，不声称能隔离用户和其他自动化软件。
- Dev/Beta/Prod 身份隔离；不同渠道同时操作 Mac 不在首版并发保证内。

### 4.2 状态机

```text
disconnected → ready → observing → agent
agent → pausing → paused → human
paused / human → observing → agent
已连接状态 → stopping → ready
连接失效 / Helper 退出 → disconnected
```

暂停先关闭新输入准入，取消未开始动作，再释放已按下键鼠。收到 Helper 确认后才能显示 paused/human。人工接管后旧观察失效，继续时先重新观察。重新绑定或换工具名不能绕过暂停。

输入控制权和会话暂停标记是两件事：会话变为空闲或释放全部 target 可以归还互斥控制权，但不能自动清除该会话的 paused/human 标记。只有用户继续或结束该会话的 Computer 控制才改变这一标记。Helper 重启后旧 attachment 失效，Main 必须重新建立控制状态，不能默认恢复之前被用户暂停的输入。

## 5. 传输协议

### 5.1 Server ↔ Desktop

沿用 Browser 请求交接模式，建立独立 Computer RPC：

| 拟议方法  | 职责                                     |
| --------- | ---------------------------------------- |
| `attach`  | 长生命周期绑定、协议版本、连接 ID        |
| `state`   | 报告 target、控制状态、可用性及 revision |
| `command` | 按 requestID 读取完整指令                |
| `result`  | 完成请求，返回结构化结果和必要图片字节   |
| `status`  | 获取当前连接投影，支持 UI 重连恢复       |

顺序及边界：

1. Desktop 先订阅事件再 attach，匹配 attached 确认后才标记可用。
2. 新 target 清单被 Server 确认后，再完成引用该 target 的工具结果。
3. 控制事件只广播请求 ID、取消和小型状态通知，不广播输入正文、图片和 AX 树。
4. 参数通过已有认证的 command RPC 获取；迟到结果不能完成新 attachment 请求。
5. 替换旧连接后不得自动抢回；Session 移动/删除和插件卸载结束关联请求。
6. 状态有单调 revision；丢事件后读取完整 state/status，不假设事件流可永久回放。
7. 输入不自动重放；截图通过字节传输，返回路径属于 Server，不假设与 Mac 共享文件系统。

### 5.2 Main ↔ Helper

建议采用两个 Unix Domain Socket：控制 socket 和按需帧读取 socket，放在当前用户私有运行目录。Helper 经 LaunchServices 启动固定身份的 `.app`。

控制协议：

- NDJSON；请求包含 version、id、method、params，每个请求有一个终态。
- hello 返回协议版本、build、helperInstanceID、能力与权限。
- 单条 JSON 建议上限 1 MiB；图片不塞进控制 JSON。
- 取消是独立控制消息；断开撤销所属 owner。
- 验证对端归属和实例，不能把“知道 socket 路径”当作归属证明。具体系统 API 在 M0 验证。

帧读取协议：

- 请求包含 targetID，可选 frameID；明确区分指定快照与最新预览。
- 响应采用 `uint32BE headerLength + JSON header + payload`。
- header 包含 payloadLength、mime、尺寸、targetID、frameID、几何代次和时间。
- header 建议上限 16 KiB、单帧 5 MiB；先验证长度再分配内存。
- 每个读取连接最多一个在途请求，完整读取后才请求下一帧。
- 指定 observation 对应帧过期时返回错误，不能静默替换为另一帧。
- 最新预览允许跳过中间帧，避免慢消费者形成无限队列。

跨语言契约通过 TypeScript/Swift 相互解码 fixture 验证，不能只维护两份看起来一样的类型。

### 5.3 Main ↔ Review/PiP

- 使用现有 Electron IPC，拟议 `ComputerFrame` 读取元数据和最新帧字节。
- 每个 Renderer 同时最多一个拉帧请求；目标帧率初设 8 FPS。
- 两个视窗共享同一 Capture 源和 Main 最新帧缓存。
- 通过结构化克隆传 Uint8Array/ArrayBuffer，视图转成 Blob URL 或 ImageBitmap。
- 当前 MessagePortMain 路径会克隆字节，不宣称零拷贝。
- 替换/卸载时释放图片资源，隐藏视图停止拉取。
- 全部视图隐藏且没有观察请求时停止连续 SCStream；模型观察仍可按需捕获。

## 6. 目标、观察与坐标

### 6.1 Target

targetID 是不透明引用，Helper 内部绑定 helperInstanceID、ownerID、应用 URL/bundleID、pid/进程实例、CGWindow/AXWindow、geometryRevision。

- PID 和标题都不能单独作为稳定身份。
- 进程或 Helper 重启使旧 target 失效。
- 窗口关联不确定时返回错误，不挑选同名窗口替代。
- 输入和截图必须使用同一目标关联。
- 不把 UUID 外形当作授权。

### 6.2 AX 与截图

- AX 返回 role、name、value 摘要、enabled、支持动作及归一化矩形。
- 首版采用有界完整 AX 快照，建议最多 2,000 节点、128 KiB 文本；明确 truncated 和原因。
- elementRef 限定 owner、target、观察代次，过期后重新观察。
- 截图采用 ScreenCaptureKit，独立窗口捕获以 `SCContentFilter(desktopIndependentWindow:)` 验证。
- 单次截图 API 的选择在最低 macOS 确定后固定；也可从 SCStream 取得完整帧。
- 使用系统返回的内容范围处理阴影、标题栏和内容区域，不能硬编码偏移。
- 遮挡、最小化、隐藏、其他 Space、系统弹窗分别实测并报告能力。
- 黑图、缺帧、停滞帧不能当作成功的新截图。
- AX 与图像不是操作系统级原子快照，分别记录时间；采集期间几何变化则重新观察或报告不稳定。

### 6.3 坐标契约

**工具坐标统一为完整观察图像内的归一化坐标 `[0,1]`，左上角为原点。**

```ts
// 拟议类型；运行时必须由 Schema 验证。
type CoordinateLocator = {
  observationID: string
  point: { x: number; y: number }
}
```

这样图片经 Core 保持完整内容的缩放后，输入坐标仍有效。若后续存在裁剪、旋转或加边，必须保留完整变换或阻止该路径。

Helper 保存“归一化图像→捕获窗口逻辑点→事件 API 坐标”的变换。CoreGraphics、AppKit、AX 的原点不能一概而论。

- 不接受无 observationID 的裸屏幕坐标。
- UI letterbox、PiP 尺寸、Retina 不参与原生输入决策。
- 窗口几何变化使旧坐标 observation 失效。
- elementRef 是语义目标，坐标是物理图像位置，不能悄悄互换。
- 连续预览只有 frameID，不改变 AX 代次，不自动产生模型 observationID。
- 每 target 首版保留最新显式观察；新显式观察替换旧引用。

仅含 AX 的观察不提供坐标定位能力；坐标动作必须引用实际包含图像的 observation。type/key 不携带坐标，但要求 target 已有有效观察，派发前再次确认输入焦点属于绑定窗口，不能把快捷键或文本发送给同进程的另一窗口。

## 7. Agent 工具契约

以下是拟议 `computer` 命名空间。sessionID、ownerID、connectionID 来自可信调用上下文，不放到模型参数里。

| 操作              | 参数概要                                       | 语义                                   |
| ----------------- | ---------------------------------------------- | -------------------------------------- |
| `apps.list`       | 无                                             | 首版列出运行中的应用                   |
| `windows.list`    | appID                                          | 返回候选 windowID、标题、状态          |
| `targets.bind`    | appID, windowID                                | 显式绑定已有窗口，不自动激活           |
| `observe`         | targetID, include: ax/image/both               | observationID、AX、图像与元数据        |
| `click`           | targetID, locator, button?, count?             | 语义或坐标点击                         |
| `type`            | targetID, text                                 | 向目标当前输入位置插入文本             |
| `key`             | targetID, keys                                 | 有限规范键名与组合键                   |
| `scroll`          | targetID, 坐标 locator, deltaX, deltaY         | 逻辑点；正 X 向右、正 Y 向下           |
| `drag`            | targetID, observationID, from, to, durationMs? | 同窗口完整鼠标手势                     |
| `targets.release` | targetID                                       | 释放绑定；最后一个目标释放后归还控制权 |

细节：

- click locator 是 `{ elementRef }` 或 `{ observationID, point }` 的互斥联合。
- button 首版 left/right，默认 left；count 为 1/2，默认 1。
- AX 不支持的双击/右键返回 unsupported，不把 AXPress 伪装成双击。
- type 使用经验证的 Unicode 输入路径；AXSetValue 是赋值，不作为透明输入替代。
- 首版不隐式覆盖系统剪贴板；粘贴作为后续显式能力。
- key 集合明确区分 Meta/Control/Alt/Shift、Enter/Escape、Backspace/Delete；验证中文、emoji、换行和修饰键清理。
- drag 是一个串行调度单元，维护 down/move/up；建议时长限 50–2,000 ms，默认值由 M0 实测确定。
- type 建议最多 16 KiB UTF-8；所有限制由统一常量和 Schema 定义。
- 在同一个 target 上不得用 Promise.all 并行输入。
- 界面结构变化是重新观察的决策点；确定的连续操作可以一次 execute 中连续 await。
- 图片通过 Tool.FileContent 返回，不能仅把文件路径/base64 放在 output 中期待模型看图。

### 7.1 结果

```ts
type ActionResult = {
  actionID: string
  targetID: string
  delivery: "ax" | "targeted" | "foreground"
  status: "dispatched" | "verified" | "unverified"
  startedAt: number
  completedAt: number
  needsObservation: boolean
}
```

默认分发成功是 dispatched。只有接收端或明确后置条件证据才能标 verified。静态画面没变既不能证明失败，也不能当作成功。

## 8. 模式、错误与中断

### 8.1 执行模式

- background 默认：AX 或经验证的进程/窗口定向输入，不自动置前应用，不移动用户真实指针。
- foreground：用户在 UI 明确选择后可激活真实应用，仍执行目标绑定检查。
- AI 光标是动作可视反馈，不是第二只系统硬件鼠标。
- 背景能力缺失时返回 foreground_required，不能偷偷激活。
- 已可能派发的动作不能自动换一种输入方式重试；先观察再决定。
- 特殊事件字段或未公开 API 需要版本证据和真实接收端测试，不能直接复制第三方反编译常量。

### 8.2 错误分类

| code                                         | 恢复方向                   |
| -------------------------------------------- | -------------------------- |
| unsupported_platform / unsupported_operation | 选择受支持能力             |
| permission_required / permission_denied      | 完成系统授权或遵守当前策略 |
| disconnected / replaced                      | 重连并观察，不重放输入     |
| busy / paused / human_control                | 等待控制状态改变           |
| target_closed / stale_target                 | 重新列举与绑定             |
| stale_observation / stale_element            | 重新观察                   |
| foreground_required                          | 用户切换模式或选择其他目标 |
| capture_unavailable / capture_stale          | 说明目标状态，重新观察     |
| timeout / cancelled / result_unknown         | 清理输入状态，观察真实结果 |

错误携带 phase 和 `execution: not_started | dispatched | unknown`。缺 ACK 的输入不得推断为未执行。

### 8.3 取消顺序

```text
暂停 / Session interrupt / 超时
→ 关闭新输入准入 → cancel(requestID)
→ 取消未开始动作 → 有界 mouseUp/keyUp 清理
→ 报告已知执行阶段 → UI/Agent 观察并恢复
```

只保护必要的短清理区间，不用无限 uninterruptible 包住整个工具。Helper 重启使旧引用全部失效。清理失败时不能显示“已完全停止”并忽略仍可能按下的键。

## 9. 系统权限与 OpenCode 策略

### 9.1 macOS 与启动

- Helper 查询 AX 和 Screen Recording；用户从 UI 触发授权引导。
- 固定 Bundle ID 和签名身份，建议生产为 `ai.opencode.desktop.computer-use`，其他渠道加后缀。
- Helper 放在可执行的 bundle 位置，不在 asar 内直接运行。
- 实际安装包验证 TCC 列表显示的主体；不能假设给 Electron 授权等于给 Helper 授权。
- 区分系统查询状态和实际操作探测结果，覆盖运行中撤销权限。
- 锁屏、休眠或图形会话不可用时暂停输入，恢复后重新观察。
- Desktop 功能开关默认关闭；启用后按需启动。设置归 Desktop 本地状态，不先新增 opencode.json 顶层字段。
- 启动请求合并，防止 Review/PiP/工具同时产生多个 Helper。
- Desktop 明确退出时结束受管 Helper；崩溃恢复不自动重放请求。

### 9.2 叶子授权

拟议权限动作：`computer.observe`、`computer.input`。发现、绑定、观察归 observe；点击、输入、快捷键、滚动、拖拽归 input。

- Core 薄适配器使用真实 Tool.Context 和 Permission.assert。
- 资源建议为 bundleID，发现清单为 `*`；这不是新增配置结构。
- 插件注册要求提供叶子授权实现，缺失时不默认放行。
- options.permission 只影响目录过滤，不能替代执行检查。
- attachment 就绪只改变可用性，不追加覆盖 deny 的 session allow。
- 核对 Plan Agent 默认规则，显式保持新 input 工具的只读限制。
- 清理和 release 只能释放本 owner 的资源，但不能因输入权限后来撤销而无法释放已按下键鼠。
- macOS 已授权不代表当前 Agent 策略允许。

## 10. Review 与 PiP 设计

```text
┌ Computer · This Mac · Notes ─ [弹出] [暂停] [接管] ┐
│ 窗口：研究记录                    后台 / Agent 控制 │
│                                                   │
│       按比例显示的应用画面 + AI 光标/目标           │
│                                                   │
├ 当前动作：输入文字                                 ┤
│ 最近动作：点击 → 输入 → 观察                       │
│ 实时 / 最后更新时间 / 捕获不可用                  │
└───────────────────────────────────────────────────┘
```

### 10.1 Review

- 每会话一个 Computer 标签页，内部选择已绑定 target。
- resize 只改变 contain 显示矩形，不调整真实应用窗口。
- 空态覆盖未启用、非 macOS、未连接、待授权、无目标、关闭、暂停、人工控制、捕获不可用。
- 轻量最近动作列表不等于录像回放；持久动作证据复用工具历史。
- 文案使用 English i18n source keys，遵循仓库 fallback 和本地化规范。

### 10.2 PiP

- 共用 ComputerView，Main 创建单独 Electron 窗口。
- 默认跟随当前可见会话，可固定 session+target；不改变输入 owner。
- 自动显示或更新不抢键盘焦点；用户点击控制按钮可正常交互。
- 不创建第二个 Agent Session、执行 attachment 或 Helper。
- 关闭 PiP 只取消展示订阅；重开从 Main 当前 state/最新帧恢复。
- 会话已结束或断开时停止拉帧并显示最后状态。
- 首版不绑定 OpenCode 宿主、PiP 和 Helper 自身窗口，避免递归画面。

### 10.3 控制按钮语义

- 暂停只阻止 Computer 输入，不等价于终止整个 Agent；工具返回 paused。
- 接管等待暂停完成，再激活真实目标窗口，让用户直接操作。
- 继续取得新 AX/图像后恢复输入准入。
- 停止 Agent 如提供则调用现有 Session interrupt。
- 关闭视窗不隐式执行以上任一操作。
- 首版不通过全局键鼠监听自动判断所有用户干预。

## 11. 性能与资源预算

以下为待测初始预算，不是已测指标：

| 项目                  | 初始值                                         |
| --------------------- | ---------------------------------------------- |
| 预览                  | 8 FPS，单视图最多一个在途拉帧请求              |
| 图像                  | JPEG，建议长边不超过 1,600；显式无损需求用 PNG |
| 单帧/单次工具附件总量 | 5 MiB                                          |
| AX                    | 2,000 节点 / 128 KiB，明确截断                 |
| 显式观察              | 每 target 最新一份，缓存有数量与字节上限       |
| 最近动作列表          | 每会话最多 100 条内存记录                      |
| 空闲                  | 无视图且无观察请求时停止连续捕获               |

- 连续帧不进入 SQLite、Session 全局事件或聊天历史。
- 设置和 PiP 几何沿用 Desktop SQLite；观察附件复用现有文件机制。
- 统计原始帧、JPEG、IPC 克隆、解码图像的总内存。
- 分别测 capture、encode、RPC、UI decode、dispatch 时延，不把模型耗时算作原生动作耗时。
- 日志默认不保存输入正文和完整 AX 文本。
- 非图像模型收到 AX 不等于看见截图，必须明确能力差异。

## 12. 里程碑与待验证决策

| 阶段         | 交付与放行条件                                     |
| ------------ | -------------------------------------------------- |
| M0 原生验证  | 签名身份、捕获、坐标、后台输入和接收端证据         |
| M1 契约/注册 | 插件、Core 叶子适配、跨语言 fixture、取消/替换测试 |
| M2 Helper    | target、AX、输入、捕获、生命周期闭环               |
| M3 桌面桥    | 本机/远端 Server 完整工具路径与图片结果            |
| M4 Review    | 实时视窗、目标覆盖层、暂停和接管                   |
| M5 PiP/发布  | 共享视图、安装包授权、兼容性与资源验收             |

M0–M3 完成但没有视窗不算完整交付，静态预览也不算实时视窗。

发布前必须明确：最低系统/工具链、真实后台驱动支持矩阵、Helper Bundle ID/启动方式、图片规范化后的坐标、PiP 焦点行为和远端图片传输。证据推翻默认方案时，先更新本文和验收案例，再改实现，不能用隐式 fallback 掩盖差异。

## 13. 参考资料

1. [OpenAI 产品介绍](https://openai.com/index/codex-for-almost-everything/)：产品能力。
2. [OpenAI Computer Use](https://learn.chatgpt.com/docs/computer-use)：使用说明；本次部分正文抓取受限，仅使用可核实段落。
3. [Codex Native Compatibility Contracts](https://cchaha.ai/en/internals/computer-use-codex-impl-blueprint)：第三方版本化分析，也包含其自身实现说明，不应全部归为官方行为。
4. [codex-computer-use-cli](https://github.com/paralym/codex-computer-use-cli)：第三方复刻及已知限制。
5. [codex-cua-mcp](https://github.com/parassharmaa/codex-cua-mcp)：非官方包装，接口可能随版本变化。
6. [Codex #43047](https://github.com/openai/codex/issues/43047)：拖拽接收端问题报告，非根因定论。
7. [Apple ScreenCaptureKit](https://developer.apple.com/videos/play/wwdc2022/10155/)：独立窗口捕获。
8. [OpenCode V2 Plugins](https://opencode.ai/v2/docs/build/plugins) / [RPC](https://opencode.ai/v2/docs/build/plugins/rpc)：公开扩展机制。

实现以当前检出代码、局部 AGENTS.md 和实际系统 API 为准，不依赖未随源码提供的 ZCode 原生组件。
