import { createEffect, createMemo, createResource, onCleanup, Show } from "solid-js"
import { useSortable } from "@dnd-kit/solid/sortable"
import { tabHref, tabKey, type SessionTab, type Tab } from "@/shell/tabs/tabs"
import { DraftTabItem, TabNavItem } from "@/shell/titlebar/tab-nav"
import { useGlobal, useServerCtx, type ServerCtx } from "@/runtime/server/runtime"
import { useLanguage } from "@/runtime/i18n/language"
import { useCommand } from "@/shell/commands/command"
import { useTabs } from "@/shell/tabs/tabs"
import { createTabComposerState } from "@/composer/persistence"
import { base64Encode } from "@opencode/util/encode"
import { showToast } from "@/shell/notifications/toast"
import { ServerConnection } from "@/runtime/server/registry"
import type { SessionInfo } from "@opencode/client/promise"

function SessionTabSlot(props: {
  tab: SessionTab
  id: string
  index: number
  indent?: boolean
  hideProjectAvatar: boolean
  active: boolean
  orientation: "horizontal" | "vertical"
  session: SessionInfo | undefined
  preparing: boolean
  fallbackTitle?: string
  onRename: (title: string) => Promise<void>
  onNavigate: (element: HTMLDivElement) => void
  onClose: () => void
}) {
  const sortable = useSortable({
    get id() {
      return props.id
    },
    get index() {
      return props.index
    },
  })
  let ref!: HTMLDivElement

  return (
    <div
      ref={sortable.ref}
      data-titlebar-tab-slot
      data-tab-key={props.id}
      data-active={props.active}
      data-orientation={props.orientation}
      class="relative flex"
      classList={{
        "w-56 min-w-7 max-w-56 flex-shrink": props.orientation === "horizontal",
        "w-full shrink-0": props.orientation === "vertical",
      }}
    >
      <TabNavItem
        ref={(el) => {
          ref = el
        }}
        href={tabHref(props.tab)}
        server={props.tab.server}
        session={props.session}
        preparing={props.preparing}
        fallbackTitle={props.fallbackTitle}
        onRename={props.onRename}
        onNavigate={() => props.onNavigate(ref)}
        onClose={props.onClose}
        active={props.active}
        dragging={sortable.isDragSource()}
        orientation={props.orientation}
        hideProjectAvatar={props.hideProjectAvatar}
        indent={props.indent}
      />
    </div>
  )
}

function SessionTabEntry(props: {
  tab: SessionTab
  id: string
  index: number
  indent?: boolean
  hideProjectAvatar: boolean
  active: boolean
  orientation: "horizontal" | "vertical"
  serverCtx: ServerCtx | undefined
  onVisibleChange: (visible: boolean) => void
  onNavigate: (element: HTMLDivElement) => void
  onClose: () => void
}) {
  const tabs = useTabs()
  const language = useLanguage()
  const sdk = createMemo(() => props.serverCtx?.sdk ?? null)
  const pending = createMemo(() => tabs.pendingSession(props.tab.server, props.tab.sessionId))
  const cachedSession = createMemo(() => props.serverCtx?.data.session.get(props.tab.sessionId))
  const persisted = createMemo(() => tabs.info[props.id])
  const [loadedSession] = createResource(
    () => {
      if (pending()) return null
      const ctx = props.serverCtx
      return ctx ? { id: props.tab.sessionId, ctx } : null
    },
    ({ id, ctx }) =>
      ctx.data.session
        .sync(id)
        .then(() => ctx.data.session.get(id))
        .catch(() => undefined),
  )
  const session = createMemo(() => (pending() ? undefined : (cachedSession() ?? loadedSession())))
  const missingSession = createMemo(() => !pending() && !!props.serverCtx && !loadedSession.loading && !session())
  const visible = createMemo(() => !!pending() || !!session() || missingSession() || !!persisted()?.title)

  const rename = async (title: string) => {
    const value = session()
    const ctx = props.serverCtx
    if (!value || !ctx) return

    ctx.data.session.remember({ ...value, title })
    try {
      await ctx.sdk.api.session.update({ sessionID: value.id, title })
    } catch (err) {
      const current = session()
      const currentCtx = props.serverCtx
      if (current && currentCtx) currentCtx.data.session.remember({ ...current, title: value.title })
      showToast({
        title: language.t("common.requestFailed"),
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  createEffect(() => props.onVisibleChange(visible()))

  createEffect(() => {
    const ctx = props.serverCtx
    const value = session()
    if (!ctx || !value || props.active || ctx.sdk.connection.status() !== "connected") return
    const timer = window.setTimeout(
      () =>
        void Promise.allSettled([
          ctx.data.session.sync(value.id, { children: true }),
          // The selected timeline loads transcript and inbox data; inactive tabs need only attention and metadata.
          ctx.data.session.permission.sync(value.id),
          ctx.data.session.form.sync(value.id),
        ]),
      300 + props.index * 50,
    )
    onCleanup(() => window.clearTimeout(timer))
  })

  createEffect(() => {
    const value = session()
    if (!value) return
    tabs.rememberSessionInfo(props.tab, value)
    const current = sdk()
    if (!current) return
    createTabComposerState(tabs, props.tab, current.scope, {
      dir: base64Encode(value.location.directory),
      id: value.id,
    })
  })

  return (
    <Show when={visible()}>
      <SessionTabSlot
        tab={props.tab}
        id={props.id}
        index={props.index}
        indent={props.indent}
        hideProjectAvatar={props.hideProjectAvatar}
        active={props.active}
        orientation={props.orientation}
        session={session()}
        preparing={!!pending()}
        fallbackTitle={
          pending()
            ? language.t("session.tab.session")
            : (persisted()?.title ?? (missingSession() ? language.t("session.tab.unknown") : undefined))
        }
        onRename={rename}
        onNavigate={props.onNavigate}
        onClose={props.onClose}
      />
    </Show>
  )
}

function DraftTabSlot(props: {
  tab: Extract<Tab, { type: "draft" }>
  id: string
  index: number
  indent?: boolean
  hideProjectAvatar: boolean
  active: boolean
  orientation: "horizontal" | "vertical"
  title: string
  onNavigate: (element: HTMLDivElement) => void
  onClose: () => void
}) {
  const sortable = useSortable({
    get id() {
      return props.id
    },
    get index() {
      return props.index
    },
  })
  let ref!: HTMLDivElement

  return (
    <div
      ref={sortable.ref}
      data-titlebar-tab-slot
      data-tab-key={props.id}
      data-active={props.active}
      data-orientation={props.orientation}
      class="relative flex"
      classList={{
        "w-56 min-w-7 max-w-56 flex-shrink": props.orientation === "horizontal",
        "w-full shrink-0": props.orientation === "vertical",
      }}
    >
      <DraftTabItem
        ref={(el) => {
          ref = el
        }}
        href={tabHref(props.tab)}
        title={props.title}
        onNavigate={() => props.onNavigate(ref)}
        onClose={props.onClose}
        active={props.active}
        dragging={sortable.isDragSource()}
        orientation={props.orientation}
        indent={props.indent}
        hideProjectAvatar={props.hideProjectAvatar}
      />
    </div>
  )
}

export function TabStripEntry(props: {
  tab: Tab
  orientation: "horizontal" | "vertical"
  current: Tab | undefined
  shortcutIndex: number
  sortableIndex: number
  indent?: boolean
  hideProjectAvatar: boolean
  onVisibleChange: (key: string, visible: boolean) => void
  onNavigate: (tab: Tab, element: HTMLDivElement) => void
  onClose: (tab: Tab) => void
}) {
  const global = useGlobal()
  const language = useLanguage()
  const id = tabKey(props.tab)
  let ref!: HTMLDivElement
  useTabShortcut(() => props.shortcutIndex, () => props.onNavigate(props.tab, ref))
  const serverCtx = useServerCtx(() => {
    if (props.tab.type !== "session") return
    return global.servers.list().find((item) => ServerConnection.key(item) === props.tab.server)
  })

  if (props.tab.type === "session") {
    return (
      <SessionTabEntry
        tab={props.tab}
        id={id}
        index={props.sortableIndex}
        indent={props.indent}
        hideProjectAvatar={props.hideProjectAvatar}
        active={props.current === props.tab}
        orientation={props.orientation}
        serverCtx={serverCtx()}
        onVisibleChange={(visible) => props.onVisibleChange(id, visible)}
        onNavigate={(element) => {
          ref = element
          props.onNavigate(props.tab, element)
        }}
        onClose={() => props.onClose(props.tab)}
      />
    )
  }

  return (
    <DraftTabSlot
      tab={props.tab}
      id={id}
      index={props.sortableIndex}
      indent={props.indent}
      hideProjectAvatar={props.hideProjectAvatar}
      active={props.current === props.tab}
      orientation={props.orientation}
      title={language.t("session.tab.session")}
      onNavigate={(element) => {
        ref = element
        props.onNavigate(props.tab, element)
      }}
      onClose={() => props.onClose(props.tab)}
    />
  )
}

function useTabShortcut(index: () => number, onSelect: () => void) {
  const command = useCommand()

  command.register(() => {
    const number = index() + 1
    if (number < 1 || number > 9) return []
    return [
      {
        id: `tab.${number}`,
        category: "tab",
        title: "",
        keybind: `mod+${number}`,
        hidden: true,
        onSelect,
      },
    ]
  })
}
