import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { DragDropProvider, PointerSensor, type DragDropProviderProps } from "@dnd-kit/solid"
import { isSortable, useSortable } from "@dnd-kit/solid/sortable"
import { Accessibility, AutoScroller, Feedback, PointerActivationConstraints } from "@dnd-kit/dom"
import { RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers"
import { RestrictToElement } from "@dnd-kit/dom/modifiers"
import { arrayMove } from "@dnd-kit/helpers"
import { tabKey, type Tab } from "@/shell/tabs/tabs"
import { useLanguage } from "@/runtime/i18n/language"
import { ServerConnection } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { useCommand } from "@/shell/commands/command"
import { useTabs } from "@/shell/tabs/tabs"
import { projectForSession } from "@/shell/layout/helpers"
import type { LocalProject } from "@/shell/state/layout"
import { isProjectDirectory } from "@/workspaces/paths"
import { TabStripEntry } from "./tab-entry"
import { ProjectGroupAdd } from "./project-group-add"
import { ProjectTabGroupHeader } from "./project-tab-group"
import { isTabCloseTarget } from "./tab-gesture"
import { adjacentTabKey, mergeVisibleTabOrder } from "./tab-order"
import {
  groupTabEntries,
  parseProjectSortableId,
  projectGroupKey,
  projectMoveIndex,
  projectSortableId,
  type TabGroup,
} from "./tab-groups"

function matchProject(projects: LocalProject[], directory: string) {
  if (!directory) return undefined
  return projects.find((project) => isProjectDirectory(project, directory))
}

function activationSensor() {
  return PointerSensor.configure({
    activationConstraints: (event) =>
      event.pointerType === "touch"
        ? [new PointerActivationConstraints.Distance({ value: 8 })]
        : [new PointerActivationConstraints.Distance({ value: 4 })],
    preventActivation: (event) =>
      isTabCloseTarget(event.target) ||
      (event.target instanceof Element && !!event.target.closest("[data-action]")) ||
      (event.target instanceof Element && !!event.target.closest('[contenteditable="true"]')),
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

// Grouped vertical tab list. Project headers and the sessions of each project sort in separate drag
// contexts: the outer provider owns one sortable per project row (dragged by its header), and every
// project mounts its own provider for its sessions, so a session can never be sorted into another
// project.
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
  const command = useCommand()
  const language = useLanguage()
  const [visibility, setVisibility] = createStore<Record<string, boolean>>({})
  const [draggingKey, setDraggingKey] = createSignal<string | null>(null)
  let listRef!: HTMLDivElement
  let draggedRow: DraggedRow | undefined

  const entries = createMemo(() =>
    props.tabs.map((tab) => {
      const conn = global.servers.list().find((item) => ServerConnection.key(item) === tab.server)
      const ctx = conn ? global.ensureServerCtx(conn) : undefined
      const projects = ctx?.projects.list() ?? []
      if (tab.type === "draft") {
        const directory = tab.worktree ?? tab.directory
        return { tab, server: tab.server, directory, project: matchProject(projects, directory) }
      }
      const pending = tabs.pendingSession(tab.server, tab.sessionId)
      const session = ctx?.data.session.get(tab.sessionId)
      const directory =
        session?.location.directory ?? pending?.draft.directory ?? tabs.info[tabKey(tab)]?.directory ?? ""
      return {
        tab,
        server: tab.server,
        directory,
        project: session ? projectForSession(session, projects) : matchProject(projects, directory),
      }
    }),
  )

  const groups = createMemo(() => {
    const contexts = new Map(
      global.servers.list().map((conn) => [ServerConnection.key(conn), global.ensureServerCtx(conn)] as const),
    )
    const order = new Map([...contexts.keys()].map((key, position) => [key, position]))
    return groupTabEntries(entries(), {
      serverIndex: (server) => order.get(server) ?? Number.MAX_SAFE_INTEGER,
      projectOrder: (server) => (contexts.get(server)?.projects.list() ?? []).map((project) => project.worktree),
    })
  })

  const groupCollapsed = (group: TabGroup) => tabs.groupCollapsed(group.key)
  const collapsedKeys = createMemo(
    () => new Set((groups() ?? []).filter(groupCollapsed).flatMap((group) => group.tabs.map(tabKey))),
  )
  const visibleTabs = createMemo(() =>
    groups()
      .flatMap((group) => group.tabs)
      .filter((tab) => !collapsedKeys().has(tabKey(tab)) && (tab.type === "draft" || visibility[tabKey(tab)])),
  )
  const visibleTabIds = () => visibleTabs().map(tabKey)
  const visibleKeys = createMemo(() => new Set(visibleTabIds()))
  const visibleIndex = (key: string) => visibleTabIds().indexOf(key)
  const groupVisible = (group: TabGroup) =>
    groupCollapsed(group) || group.tabs.some((tab) => tab.type === "draft" || visibility[tabKey(tab)])
  const projectCount = () => groups().filter((group) => group.project && groupVisible(group)).length
  const groupedKeys = () => new Set(groups().map((group) => projectGroupKey(group.server, group.directory)))
  const projectGroupIndex = (group: TabGroup) => {
    if (!group.project || !groupVisible(group)) return undefined
    return groups()
      .filter((item) => item.server === group.server && item.project && groupVisible(item))
      .findIndex((item) => item.key === group.key)
  }

  const moveProject = (server: ServerConnection.Key, worktree: string, from: number, to: number) => {
    const conn = global.servers.list().find((item) => ServerConnection.key(item) === server)
    if (!conn) return
    const ctx = global.ensureServerCtx(conn)
    const full = ctx.projects.list().map((project) => project.worktree)
    const visible = groups()
      .filter((group) => group.server === server && !!group.project && groupVisible(group))
      .map((group) => group.directory)
    const index = projectMoveIndex({ full, visible, from, to })
    if (index === undefined) return
    ctx.projects.move(worktree, index)
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
        data-titlebar-tab-list
        data-orientation="vertical"
        class="flex w-full min-w-0 flex-col items-stretch"
      >
        <div data-slot="tab-list-label" class="group/label flex select-none items-center pt-1 pe-1 ps-1.5">
          <span class="min-w-0 flex-1 text-[13px] leading-4 font-medium text-v2-text-text-faint">
            {language.t("tab.group.projects", { count: projectCount() })}
          </span>
          <ProjectGroupAdd exclude={groupedKeys} />
        </div>
        {/* Keyed by group key strings: group objects are recreated on every recompute. */}
        <For each={groups().map((group) => group.key)}>
          {(key) => {
            const group = createMemo(() => groups().find((item) => item.key === key))
            // The sortable unit is the whole group block, not just the header: dnd-kit reorders by
            // moving the source element next to the hovered element, and a header-sized unit lands
            // inside the hovered group container (splitting its header from its sessions). The
            // header stays the drag handle, the feedback source and the droppable target, so the
            // drag starts, renders and hits exactly as before while the block moves as one.
            const sortable = useSortable({
              get id() {
                const current = group()
                return current ? projectSortableId(current.server, current.directory) : `project:${key}`
              },
              get index() {
                const current = group()
                return (current && projectGroupIndex(current)) ?? 0
              },
              get disabled() {
                const current = group()
                return !current || projectGroupIndex(current) === undefined
              },
              get transition() {
                // The dragged block is only an empty slot while it is the source, and animating it
                // would briefly make it the containing block of the fixed-position header.
                return draggingKey() === key ? { duration: 0 } : undefined
              },
            })
            let motionEl!: HTMLDivElement
            // Dragging a header collapses its sessions without writing the persisted collapse
            // state, so dropping (or canceling) restores the pre-drag expansion automatically.
            const effCollapsed = () => {
              const current = group()
              return !!current && (groupCollapsed(current) || draggingKey() === current.key)
            }
            const initial = group()
            const [itemsMounted, setItemsMounted] = createSignal(!!initial && !groupCollapsed(initial))
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
              <Show when={group()}>
                {(value) => (
                  <div ref={sortable.ref} data-slot="tab-group" class="flex min-w-0 flex-col">
                    <Show when={groupVisible(value())}>
                      <ProjectTabGroupHeader
                        group={value()}
                        collapsed={effCollapsed()}
                        dragging={sortable.isDragSource()}
                        handleRef={sortable.handleRef}
                        sourceRef={sortable.sourceRef}
                        targetRef={sortable.targetRef}
                        onToggle={() => tabs.toggleGroupCollapsed(value().key)}
                        onCloseAll={(groupTabs) => tabs.closeTabs(groupTabs)}
                      />
                    </Show>
                    <div
                      ref={motionEl}
                      data-slot="tab-group-motion"
                      data-collapsed={effCollapsed()}
                      inert={effCollapsed()}
                    >
                      <Show when={itemsMounted()}>
                        <ProjectGroupTabs
                          group={value()}
                          current={props.currentTab}
                          allKeys={props.tabs.map(tabKey)}
                          visibleKeys={visibleKeys()}
                          shortcutIndex={visibleIndex}
                          showSessionTime={props.showSessionTime ?? false}
                          onVisibleChange={(key, visible) => setVisibility(key, visible)}
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
          }}
        </For>
      </div>
    </DragDropProvider>
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
