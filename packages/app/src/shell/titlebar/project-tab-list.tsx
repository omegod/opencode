import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { DragDropProvider, PointerSensor, type DragDropProviderProps } from "@dnd-kit/solid"
import { isSortable, useSortable } from "@dnd-kit/solid/sortable"
import { Accessibility, AutoScroller, Feedback, PointerActivationConstraints } from "@dnd-kit/dom"
import { RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers"
import { RestrictToElement } from "@dnd-kit/dom/modifiers"
import { arrayMove } from "@dnd-kit/helpers"
import { Icon } from "@opencode/ui/icon"
import { tabKey, type Tab } from "@/shell/tabs/tabs"
import { useLanguage } from "@/runtime/i18n/language"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { useCommand } from "@/shell/commands/command"
import { useTabs } from "@/shell/tabs/tabs"
import { projectForSession } from "@/shell/layout/helpers"
import { TabStripEntry } from "./tab-entry"
import { ProjectGroupAdd } from "./project-group-add"
import { ProjectTabGroupHeader } from "./project-tab-group"
import { adjacentTabKey, mergeVisibleTabOrder } from "./tab-order"
import {
  groupTabEntries,
  parseProjectSortableId,
  projectGroupKey,
  projectSectionMoveIndex,
  projectSortableId,
  type TabGroup,
} from "./tab-groups"

function activationSensor() {
  return PointerSensor.configure({
    activationConstraints: (event) =>
      event.pointerType === "touch"
        ? [new PointerActivationConstraints.Distance({ value: 8 })]
        : [new PointerActivationConstraints.Distance({ value: 4 })],
    preventActivation: (event) =>
      event.target instanceof Element &&
      !!event.target.closest(
        '[data-slot="tab-close"], [data-action], [contenteditable="true"], [contenteditable="plaintext-only"]',
      ),
  })
}

function sortableListProps(
  element: () => HTMLElement,
): Pick<DragDropProviderProps, "sensors" | "plugins" | "modifiers"> {
  return {
    sensors: [activationSensor()],
    plugins: (defaults) => [
      ...defaults.filter((plugin) => plugin !== Accessibility),
      AutoScroller.configure({ acceleration: 8, threshold: { x: 0, y: 0.05 } }),
      Feedback.configure({ dropAnimation: null }),
    ],
    modifiers: [RestrictToVerticalAxis, RestrictToElement.configure({ element })],
  }
}

type DraggedRow = {
  element: Element
  prev: Element | null
  next: Element | null
  parent: Element | null
}

// dnd-kit reorders by moving the dragged element in the DOM while dragging. Solid reconciles the
// list from the order it last rendered, so the moved row has to be put back before the store change
// reorders it, exactly like dnd-kit does for flat lists through `source.element`.
function captureDraggedRow(element: Element | undefined): DraggedRow | undefined {
  const row = element?.closest('[data-slot="tab-group"]')
  if (!row) return
  return { element: row, prev: row.previousElementSibling, next: row.nextElementSibling, parent: row.parentElement }
}

function restoreDraggedRow(row: DraggedRow | undefined) {
  if (!row?.element.isConnected) return
  if (row.prev?.isConnected && row.element.previousElementSibling !== row.prev) {
    row.prev.insertAdjacentElement("afterend", row.element)
    return
  }
  if (row.next?.isConnected && row.element.nextElementSibling !== row.next) {
    row.next.insertAdjacentElement("beforebegin", row.element)
    return
  }
  if (row.parent && row.element.parentElement !== row.parent) row.parent.appendChild(row.element)
}

const serverSectionKey = (server: ServerConnection.Key) => `server:${server}`
const isServerRowKey = (key: string) => key.startsWith("server:")

type ServerSection = {
  server: ServerConnection.Key
  connection: ServerConnection.Any | undefined
  name: string
  local: boolean
  groups: TabGroup[]
  projectCount: number
  collapsed: boolean
}

type ListRow =
  | { kind: "server"; key: string; section: ServerSection }
  | { kind: "group"; key: string; group: TabGroup }

// Grouped vertical tab list. More than one server with project groups splits the list into one
// collapsible section per server; a single server keeps the flat `Projects (n)` list. Project
// headers and the sessions of each project sort in separate drag contexts: the outer provider owns
// one sortable per project row (dragged by its header), and every project mounts its own provider
// for its sessions, so a session can never be sorted into another project.
export function ProjectTabList(props: {
  tabs: Tab[]
  currentTab: Tab | undefined
  showSessionTime?: boolean
  onNavigate: (tab: Tab, el?: HTMLDivElement) => void
  onClose: (tab: Tab) => void
  onReorder: (keys: string[]) => void
}) {
  const global = useGlobal()
  const tabs = useTabs()
  const servers = useServers()
  const command = useCommand()
  const language = useLanguage()
  const [visibility, setVisibility] = createStore<Record<string, boolean>>({})
  const [draggingKey, setDraggingKey] = createSignal<string | null>(null)
  let listRef!: HTMLDivElement
  let draggedRow: DraggedRow | undefined

  const entries = createMemo(() =>
    props.tabs.map((tab) => {
      const conn = global.servers.list().find((item) => ServerConnection.key(item) === tab.server)
      const ctx = conn ? global.serverCtx(ServerConnection.key(conn)) : undefined
      const projects = ctx?.projects.list() ?? []
      if (tab.type === "draft") {
        return { tab, server: tab.server, directory: tab.directory, project: ctx?.projects.forDirectory(tab.directory) }
      }
      const pending = tabs.pendingSession(tab.server, tab.sessionId)
      const session = ctx?.data.session.get(tab.sessionId)
      const directory =
        session?.location.directory ?? pending?.draft.directory ?? tabs.info[tabKey(tab)]?.directory ?? ""
      return {
        tab,
        server: tab.server,
        directory,
        project: session ? projectForSession(session, projects) : ctx?.projects.forDirectory(directory),
      }
    }),
  )

  const groups = createMemo(() => {
    const contexts = new Map(
      global.servers.list().map((conn) => [ServerConnection.key(conn), global.serverCtx(ServerConnection.key(conn))] as const),
    )
    const order = new Map([...contexts.keys()].map((key, position) => [key, position]))
    return groupTabEntries(entries(), {
      serverIndex: (server) => order.get(server) ?? Number.MAX_SAFE_INTEGER,
      projectOrder: (server) => (contexts.get(server)?.projects.unique() ?? []).map((project) => project.worktree),
    })
  })

  const groupCollapsed = (group: TabGroup) => tabs.groupCollapsed(group.key)
  const groupVisible = (group: TabGroup) =>
    groupCollapsed(group) || group.tabs.some((tab) => tab.type === "draft" || visibility[tabKey(tab)])

  const sections = createMemo((): ServerSection[] => {
    const connections = global.servers.list()
    const byServer = new Map<ServerConnection.Key, TabGroup[]>()
    for (const group of groups()) {
      const items = byServer.get(group.server)
      if (items) items.push(group)
      else byServer.set(group.server, [group])
    }
    return [...byServer.entries()].map(([server, items]) => {
      const connection = connections.find((conn) => ServerConnection.key(conn) === server)
      return {
        server,
        connection,
        name: connection ? servers.label(connection) : server,
        local: servers.local(connection),
        groups: items,
        projectCount: items.filter((group) => !!group.project && groupVisible(group)).length,
        collapsed: tabs.groupCollapsed(serverSectionKey(server)),
      }
    })
  })

  // Only an actual split across servers earns section headers; a second server with no project
  // group keeps the flat list.
  const multiServer = createMemo(() => sections().filter((section) => section.projectCount > 0).length > 1)
  const singleSection = () => sections().find((section) => section.projectCount > 0)

  const rows = createMemo((): ListRow[] => {
    if (!multiServer()) return groups().map((group) => ({ kind: "group", key: group.key, group }))
    return sections().flatMap((section) => {
      const items: ListRow[] = section.groups.map((group) => ({ kind: "group", key: group.key, group }))
      if (section.projectCount === 0) return items
      return [
        { kind: "server", key: serverSectionKey(section.server), section },
        ...(section.collapsed ? [] : items),
      ]
    })
  })

  const renderedGroups = createMemo(() =>
    rows().flatMap((row) => (row.kind === "group" ? [row.group] : [])),
  )

  const rowGroup = (key: string) => {
    const row = rows().find((item) => item.key === key)
    return row?.kind === "group" ? row.group : undefined
  }

  const groupRowIndex = (key: string) => {
    const index = renderedGroups().findIndex((group) => group.key === key)
    return index === -1 ? 0 : index
  }

  const collapsedKeys = createMemo(
    () => new Set(renderedGroups().filter(groupCollapsed).flatMap((group) => group.tabs.map(tabKey))),
  )
  const visibleTabs = createMemo(() =>
    renderedGroups()
      .flatMap((group) => group.tabs)
      .filter((tab) => !collapsedKeys().has(tabKey(tab)) && (tab.type === "draft" || visibility[tabKey(tab)])),
  )
  const visibleTabIds = () => visibleTabs().map(tabKey)
  const visibleKeys = createMemo(() => new Set(visibleTabIds()))
  const visibleIndex = (key: string) => visibleTabIds().indexOf(key)
  const groupedKeys = () => new Set(groups().map((group) => projectGroupKey(group.server, group.directory)))

  const moveProject = (server: ServerConnection.Key, worktree: string, from: number, to: number) => {
    const conn = global.servers.list().find((item) => ServerConnection.key(item) === server)
    if (!conn) return
    const ctx = global.serverCtx(ServerConnection.key(conn))
    if (!ctx) return
    const full = ctx.projects.unique().map((project) => project.worktree)
    const index = projectSectionMoveIndex({
      full,
      rows: renderedGroups().map((group) => ({ server: group.server, project: group.project?.worktree })),
      from,
      to,
    })
    if (index === undefined) return
    ctx.projects.move(worktree, index, full)
  }

  const closeGroup = (groupTabs: Tab[]) => {
    const closing = new Set(groupTabs.map(tabKey))
    // Keep the first tab after the group, else the one before it, so the view leaves the block it
    // just closed; closing every tab goes home.
    const last = props.tabs.findLastIndex((tab) => closing.has(tabKey(tab)))
    const keep =
      props.tabs.slice(last + 1).find((tab) => !closing.has(tabKey(tab))) ??
      props.tabs.findLast((tab) => !closing.has(tabKey(tab)))
    tabs.closeTabs(groupTabs.map(tabKey), keep)
  }

  command.register("titlebar-tab-cycle", () => [
    {
      id: `tab.prev`,
      category: "tab",
      title: "",
      keybind: `mod+option+ArrowLeft,ctrl+shift+tab`,
      hidden: true,
      onSelect: () => selectAdjacentTab(-1),
    },
    {
      id: `tab.next`,
      category: "tab",
      title: "",
      keybind: `mod+option+ArrowRight,ctrl+tab`,
      hidden: true,
      onSelect: () => selectAdjacentTab(1),
    },
  ])

  function selectAdjacentTab(offset: -1 | 1) {
    const current = props.currentTab
    const key = adjacentTabKey(visibleTabIds(), current ? tabKey(current) : undefined, offset)
    const next = props.tabs.find((tab) => tabKey(tab) === key)
    if (next) props.onNavigate(next)
  }

  return (
    <DragDropProvider
      {...sortableListProps(() => listRef)}
      onDragStart={(event) => {
        const source = event.operation.source
        if (!isSortable(source)) return
        const project = parseProjectSortableId(source.id.toString())
        if (!project) return
        draggedRow = captureDraggedRow(source.element)
        setDraggingKey(projectGroupKey(project.server, project.worktree))
      }}
      onDragEnd={(event) => {
        setDraggingKey(null)
        const source = event.operation.source
        const row = draggedRow
        draggedRow = undefined
        if (event.canceled || !isSortable(source)) return
        const project = parseProjectSortableId(source.id.toString())
        if (!project) return
        restoreDraggedRow(row)
        moveProject(project.server, project.worktree, source.initialIndex, source.index)
      }}
    >
      <div
        ref={listRef}
        data-grouped-tab-list
        data-orientation="vertical"
        class="flex w-full min-w-0 flex-col items-stretch"
      >
        <Show when={!multiServer()}>
          <div data-slot="tab-list-label" class="group/label flex select-none items-center pt-1 pe-1 ps-1.5">
            <span class="min-w-0 flex-1 text-[13px] leading-4 font-medium text-v2-text-text-faint">
              {language.t("tab.group.projects")}
            </span>
            <ProjectGroupAdd exclude={groupedKeys} openServer={singleSection()?.connection} />
          </div>
        </Show>
        {/* Keyed by row key strings: row objects are recreated on every recompute. */}
        <For each={rows().map((row) => row.key)}>
          {(key) => {
            if (isServerRowKey(key)) {
              return (
                <ProjectServerHeader
                  row={() => {
                    const row = rows().find((item) => item.key === key)
                    return row?.kind === "server" ? row : undefined
                  }}
                  exclude={groupedKeys}
                  onToggle={(server) => tabs.toggleGroupCollapsed(serverSectionKey(server))}
                />
              )
            }
            return (
              <ProjectGroupRow
                groupKey={key}
                group={() => rowGroup(key)}
                sortableIndex={() => groupRowIndex(key)}
                visible={() => {
                  const group = rowGroup(key)
                  return !!group && groupVisible(group)
                }}
                collapsed={() => {
                  const group = rowGroup(key)
                  return !!group && groupCollapsed(group)
                }}
                dragging={() => draggingKey() === key}
                current={props.currentTab}
                allKeys={props.tabs.map(tabKey)}
                visibleKeys={visibleKeys()}
                shortcutIndex={visibleIndex}
                showSessionTime={props.showSessionTime ?? false}
                onVisibleChange={(tab, visible) => setVisibility(tab, visible)}
                onNavigate={props.onNavigate}
                onClose={props.onClose}
                onReorder={props.onReorder}
                onToggle={() => {
                  const group = rowGroup(key)
                  if (group) tabs.toggleGroupCollapsed(group.key)
                }}
                onCloseAll={closeGroup}
              />
            )
          }}
        </For>
      </div>
    </DragDropProvider>
  )
}

function ProjectServerHeader(props: {
  row: () => Extract<ListRow, { kind: "server" }> | undefined
  exclude: () => Set<string>
  onToggle: (server: ServerConnection.Key) => void
}) {
  const language = useLanguage()

  return (
    <Show when={props.row()}>
      {(row) => (
        <div
          data-slot="tab-list-server"
          data-collapsed={row().section.collapsed ? "true" : undefined}
          class="group/label flex select-none items-center pt-1 pe-1 ps-1.5"
        >
          <button
            type="button"
            data-slot="tab-list-server-toggle"
            class="flex h-7 min-w-0 flex-1 items-center rounded-[6px] bg-transparent text-left text-[13px] leading-4 font-medium text-v2-text-text-faint outline-none focus-visible:bg-v2-overlay-simple-overlay-hover"
            aria-expanded={!row().section.collapsed}
            aria-label={language.t(row().section.collapsed ? "tab.group.expand" : "tab.group.collapse")}
            onClick={() => props.onToggle(row().section.server)}
          >
            <span class="min-w-0 truncate">
              {language.t("tab.group.projectsByServer", {
                server: row().section.local
                  ? language.t("tab.group.localServer")
                  : row().section.name,
              })}
            </span>
            <span
              data-slot="tab-list-server-chevron"
              class="ms-1 flex size-4 shrink-0 items-center justify-center text-v2-icon-icon-muted"
            >
              <Icon name="fill-triangle-down" />
            </span>
          </button>
          <ProjectGroupAdd exclude={props.exclude} scope={row().section.connection} />
        </div>
      )}
    </Show>
  )
}

function ProjectGroupRow(props: {
  groupKey: string
  group: () => TabGroup | undefined
  sortableIndex: () => number
  visible: () => boolean
  collapsed: () => boolean
  dragging: () => boolean
  current: Tab | undefined
  allKeys: string[]
  visibleKeys: Set<string>
  shortcutIndex: (key: string) => number
  showSessionTime: boolean
  onVisibleChange: (key: string, visible: boolean) => void
  onNavigate: (tab: Tab, el?: HTMLDivElement) => void
  onClose: (tab: Tab) => void
  onReorder: (keys: string[]) => void
  onToggle: () => void
  onCloseAll: (tabs: Tab[]) => void
}) {
  // The sortable unit is the whole group block, not just the header: dnd-kit reorders by moving the
  // source element next to the hovered element, and a header-sized unit lands inside the hovered
  // group container (splitting its header from its sessions). The header stays the drag handle, the
  // feedback source and the droppable target, so the drag starts, renders and hits exactly as
  // before while the block moves as one.
  const sortable = useSortable({
    get id() {
      const group = props.group()
      return group ? projectSortableId(group.server, group.directory) : `project:${props.groupKey}`
    },
    get index() {
      return props.sortableIndex()
    },
    get disabled() {
      return !props.group()?.project || !props.visible()
    },
    get transition() {
      // The dragged block is only an empty slot while it is the source, and animating it would
      // briefly make it the containing block of the fixed-position header.
      return props.dragging() ? { duration: 0 } : undefined
    },
  })
  // Dragging a header collapses its sessions without writing the persisted collapse state, so
  // dropping (or canceling) restores the pre-drag expansion automatically.
  const effCollapsed = () => props.collapsed() || props.dragging()
  const [itemsMounted, setItemsMounted] = createSignal(!!props.group() && !props.collapsed())
  // Collapsed sessions stay mounted only until the height transition ends, preserving the
  // unmount-on-collapse lazy loading.
  createEffect(() => {
    if (!effCollapsed()) {
      setItemsMounted(true)
      return
    }
    const timer = window.setTimeout(() => setItemsMounted(false), 160)
    onCleanup(() => window.clearTimeout(timer))
  })

  return (
    <Show when={props.group()}>
      {(group) => (
        <div ref={sortable.ref} data-slot="tab-group" class="flex min-w-0 flex-col">
          <Show when={props.visible()}>
            <ProjectTabGroupHeader
              group={group()}
              collapsed={effCollapsed()}
              dragging={sortable.isDragSource()}
              handleRef={sortable.handleRef}
              sourceRef={sortable.sourceRef}
              targetRef={sortable.targetRef}
              onToggle={props.onToggle}
              onCloseAll={props.onCloseAll}
            />
          </Show>
          <div
            data-slot="tab-group-motion"
            data-collapsed={effCollapsed()}
            inert={effCollapsed()}
          >
            <Show when={itemsMounted()}>
              <ProjectGroupTabs
                group={group()}
                current={props.current}
                allKeys={props.allKeys}
                visibleKeys={props.visibleKeys}
                shortcutIndex={props.shortcutIndex}
                showSessionTime={props.showSessionTime}
                onVisibleChange={props.onVisibleChange}
                onNavigate={props.onNavigate}
                onClose={props.onClose}
                onReorder={props.onReorder}
              />
            </Show>
          </div>
        </div>
      )}
    </Show>
  )
}

function ProjectGroupTabs(props: {
  group: TabGroup
  current: Tab | undefined
  allKeys: string[]
  visibleKeys: Set<string>
  shortcutIndex: (key: string) => number
  showSessionTime: boolean
  onVisibleChange: (key: string, visible: boolean) => void
  onNavigate: (tab: Tab, el?: HTMLDivElement) => void
  onClose: (tab: Tab) => void
  onReorder: (keys: string[]) => void
}) {
  let ref!: HTMLDivElement
  const keys = () => props.group.tabs.map(tabKey)
  const visibleGroupKeys = () => keys().filter((key) => props.visibleKeys.has(key))
  const sortableIndex = (key: string) => visibleGroupKeys().indexOf(key)

  return (
    <DragDropProvider
      {...sortableListProps(() => ref)}
      onDragEnd={(event) => {
        const source = event.operation.source
        if (event.canceled || !isSortable(source)) return
        if (source.initialIndex === source.index) return
        const current = visibleGroupKeys()
        props.onReorder(
          mergeVisibleTabOrder(props.allKeys, current, arrayMove(current, source.initialIndex, source.index)),
        )
      }}
    >
      <div ref={ref} data-slot="tab-group-items" class="flex min-w-0 flex-col gap-1">
        <For each={props.group.tabs}>
          {(tab) => {
            const id = tabKey(tab)
            return (
              <TabStripEntry
                tab={tab}
                orientation="vertical"
                current={props.current}
                shortcutIndex={props.shortcutIndex(id)}
                sortableIndex={sortableIndex(id)}
                grouped
                indent
                hideProjectAvatar
                showSessionTime={props.showSessionTime}
                onVisibleChange={props.onVisibleChange}
                onNavigate={props.onNavigate}
                onClose={props.onClose}
              />
            )
          }}
        </For>
      </div>
    </DragDropProvider>
  )
}
