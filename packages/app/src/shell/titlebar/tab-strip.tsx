import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { DragDropProvider, PointerSensor } from "@dnd-kit/solid"
import { isSortable } from "@dnd-kit/solid/sortable"
import { Accessibility, AutoScroller, Feedback, PointerActivationConstraints } from "@dnd-kit/dom"
import { RestrictToHorizontalAxis, RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers"
import { RestrictToElement } from "@dnd-kit/dom/modifiers"
import { arrayMove } from "@dnd-kit/helpers"
import { tabKey, type Tab } from "@/shell/tabs/tabs"
import { useCommand } from "@/shell/commands/command"
import { useSettings } from "@/settings/model"
import { isTabCloseTarget } from "./tab-gesture"
import { adjacentTabKey, mergeVisibleTabOrder } from "./tab-order"
import { ProjectTabList } from "./project-tab-list"
import { TabStripEntry } from "./tab-entry"

export function TitlebarTabStrip(props: {
  orientation?: "horizontal" | "vertical"
  tabs: Tab[]
  currentTab: Tab | undefined
  onNavigate: (tab: Tab, el?: HTMLDivElement) => void
  onClose: (tab: Tab) => void
  onReorder: (keys: string[]) => void
}) {
  const command = useCommand()
  const preferences = useSettings()
  const vertical = () => props.orientation === "vertical"
  const grouped = () => vertical() && preferences.appearance.groupTabsByProject()
  let listRef!: HTMLDivElement
  const [visibility, setVisibility] = createStore<Record<string, boolean>>({})

  const visibleTabs = createMemo(() => props.tabs.filter((tab) => tab.type === "draft" || visibility[tabKey(tab)]))
  const visibleTabIds = () => visibleTabs().map(tabKey)
  const visibleIndex = (key: string) => visibleTabIds().indexOf(key)

  command.register("titlebar-tab-cycle", () => {
    // Grouped lists register their own cycle commands; only the flat list cycles here.
    if (grouped()) return []
    return [
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
    ]
  })

  function selectAdjacentTab(offset: -1 | 1) {
    const current = props.currentTab
    const key = adjacentTabKey(visibleTabIds(), current ? tabKey(current) : undefined, offset)
    const next = props.tabs.find((tab) => tabKey(tab) === key)
    if (next) props.onNavigate(next)
  }

  return (
    <div
      data-slot={vertical() ? "vertical-tabs" : "titlebar-tabs"}
      data-orientation={vertical() ? "vertical" : "horizontal"}
      class="relative min-w-0"
      classList={{ "min-h-0 overflow-hidden": vertical() }}
    >
      <div
        data-slot={vertical() ? "vertical-tabs-scroll" : "titlebar-tabs-scroll"}
        class="flex min-w-0 no-scrollbar [app-region:no-drag]"
        classList={{
          "flex-row items-center gap-1.5 overflow-x-auto": !vertical(),
          "max-h-full flex-col overflow-y-auto overflow-x-hidden": vertical(),
        }}
      >
        <Show
          when={grouped()}
          fallback={
            <DragDropProvider
              sensors={[
                PointerSensor.configure({
                  activationConstraints: (event) =>
                    event.pointerType === "touch"
                      ? [new PointerActivationConstraints.Distance({ value: 8 })]
                      : [new PointerActivationConstraints.Distance({ value: 4 })],
                  preventActivation: (event) =>
                    isTabCloseTarget(event.target) ||
                    (event.target instanceof Element && !!event.target.closest("[data-action]")) ||
                    (event.target instanceof Element && !!event.target.closest('[contenteditable="true"]')),
                }),
              ]}
              modifiers={[
                vertical() ? RestrictToVerticalAxis : RestrictToHorizontalAxis,
                RestrictToElement.configure({ element: () => listRef }),
              ]}
              plugins={(defaults) => [
                ...defaults.filter((plugin) => plugin !== Accessibility),
                AutoScroller.configure({
                  acceleration: 8,
                  threshold: vertical() ? { x: 0, y: 0.05 } : { x: 0.05, y: 0 },
                }),
                Feedback.configure({ dropAnimation: null }),
              ]}
              onDragStart={(event) => {
                const source = event.operation.source
                if (!source || vertical()) return
                const tab = props.tabs.find((item) => tabKey(item) === source.id.toString())
                if (!tab) return
                const tabEl = source.element?.querySelector<HTMLDivElement>("[data-titlebar-tab]")
                props.onNavigate(tab, tabEl ?? undefined)
              }}
              onDragEnd={(event) => {
                const source = event.operation.source
                if (event.canceled || !isSortable(source)) return
                if (source.initialIndex === source.index) return
                const current = visibleTabIds()
                props.onReorder(
                  mergeVisibleTabOrder(
                    props.tabs.map(tabKey),
                    current,
                    arrayMove(current, source.initialIndex, source.index),
                  ),
                )
              }}
            >
              <div
                data-titlebar-tab-list
                data-orientation={vertical() ? "vertical" : "horizontal"}
                class="flex w-full min-w-0"
                classList={{ "flex-row items-center": !vertical(), "flex-col items-stretch": vertical() }}
                ref={listRef}
              >
                <For each={props.tabs}>
                  {(tab) => {
                    const id = tabKey(tab)
                    return (
                      <TabStripEntry
                        tab={tab}
                        orientation={vertical() ? "vertical" : "horizontal"}
                        current={props.currentTab}
                        shortcutIndex={visibleIndex(id)}
                        sortableIndex={visibleIndex(id)}
                        hideProjectAvatar={false}
                        onVisibleChange={(key, value) => setVisibility(key, value)}
                        onNavigate={props.onNavigate}
                        onClose={props.onClose}
                      />
                    )
                  }}
                </For>
              </div>
            </DragDropProvider>
          }
        >
          <ProjectTabList
            tabs={props.tabs}
            currentTab={props.currentTab}
            onNavigate={props.onNavigate}
            onClose={props.onClose}
            onReorder={props.onReorder}
          />
        </Show>
      </div>
      <Show when={!vertical()}>
        <div
          data-slot="titlebar-tabs-fade-left"
          aria-hidden="true"
          class="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-[linear-gradient(to_right,var(--shell-surface),transparent)]"
        />
        <div
          data-slot="titlebar-tabs-fade-right"
          aria-hidden="true"
          class="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-[linear-gradient(to_left,var(--shell-surface),transparent)]"
        />
      </Show>
    </div>
  )
}
