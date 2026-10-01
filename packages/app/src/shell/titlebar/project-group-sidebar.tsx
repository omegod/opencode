import { createMemo, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { Icon } from "@opencode/ui/icon"
import { useCommand } from "@/shell/commands/command"
import { useLanguage } from "@/runtime/i18n/language"
import { useLayout } from "@/shell/state/layout"
import type { Tab } from "@/shell/tabs/tabs"
import { ProjectTabList } from "./project-tab-list"

// Sidebar shell for grouped vertical tabs. Rendered in place of the flat home / new-session /
// tab-strip trio while appearance.groupTabsByProject is on, so grouped mode can restyle every
// section and add overflow fades without touching the upstream vertical layout.
export function ProjectGroupSidebar(props: {
  tabs: Tab[]
  currentTab: Tab | undefined
  onHome: () => void
  onNewSession: () => void
  onNavigate: (tab: Tab, el?: HTMLDivElement) => void
  onClose: (tab: Tab) => void
  onReorder: (keys: string[]) => void
}) {
  const [fades, setFades] = createStore({ top: false, bottom: false })
  let scrollRef!: HTMLDivElement
  let contentRef!: HTMLDivElement

  const updateFades = () => {
    setFades("top", scrollRef.scrollTop > 1)
    setFades("bottom", scrollRef.scrollTop + scrollRef.clientHeight < scrollRef.scrollHeight - 1)
  }

  onMount(() => {
    const observer = new ResizeObserver(updateFades)
    observer.observe(scrollRef)
    observer.observe(contentRef)
    onCleanup(() => observer.disconnect())
    updateFades()
  })

  // Alpha-fade band at each overflowing edge, mirroring the horizontal tab strip fades.
  const scrollMask = createMemo(() => {
    if (!fades.top && !fades.bottom) return
    const gradient = fades.top
      ? fades.bottom
        ? "linear-gradient(to bottom, transparent 0, black 24px, black calc(100% - 24px), transparent 100%)"
        : "linear-gradient(to bottom, transparent 0, black 24px, black 100%)"
      : "linear-gradient(to bottom, black 0, black calc(100% - 24px), transparent 100%)"
    return { "-webkit-mask-image": gradient, "mask-image": gradient }
  })

  return (
    <div data-tab-grouped="true" class="flex min-h-0 flex-1 flex-col">
      <ProjectGroupSidebarHome onToggle={props.onHome} />
      <ProjectGroupSidebarNewSession onNew={props.onNewSession} />
      <div class="h-4 w-full shrink-0" aria-hidden="true" />
      <div class="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={updateFades}
          style={scrollMask()}
          class="no-scrollbar [app-region:no-drag] flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pb-4 [scroll-padding-block-end:16px]"
        >
          <div ref={contentRef}>
            <ProjectTabList
              tabs={props.tabs}
              currentTab={props.currentTab}
              showSessionTime
              onNavigate={props.onNavigate}
              onClose={props.onClose}
              onReorder={props.onReorder}
            />
          </div>
        </div>
        <Show when={fades.top}>
          <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-x-0 top-0 z-10 h-9 [-webkit-backdrop-filter:blur(6px)] [-webkit-mask-image:linear-gradient(to_bottom,black,transparent)] [backdrop-filter:blur(6px)] [mask-image:linear-gradient(to_bottom,black,transparent)]"
          />
        </Show>
        <Show when={fades.bottom}>
          <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-9 [-webkit-backdrop-filter:blur(6px)] [-webkit-mask-image:linear-gradient(to_top,black,transparent)] [backdrop-filter:blur(6px)] [mask-image:linear-gradient(to_top,black,transparent)]"
          />
        </Show>
      </div>
    </div>
  )
}

function ProjectGroupSidebarHome(props: { onToggle: () => void }) {
  const layout = useLayout()
  const command = useCommand()
  const language = useLanguage()
  return (
    <button
      type="button"
      data-titlebar-tab-action
      data-action="vertical-tabs-home"
      data-state={layout.route().type === "home" ? "pressed" : undefined}
      class="group mb-1 flex h-7 w-full shrink-0 items-center gap-1.5 rounded-[6px] ps-1.5 pe-2 text-[13px] leading-4 text-v2-text-text-base"
      onClick={props.onToggle}
      aria-label={language.t("home.title")}
      aria-pressed={layout.route().type === "home"}
    >
      <Icon name="grid-plus" class="shrink-0" />
      <span class="min-w-0 truncate">{language.t("home.title")}</span>
      <span class="ms-auto min-w-0 truncate text-[11px] leading-text-compact text-v2-text-text-faint" aria-hidden="true">
        <bdi dir="ltr">{command.keybind("home.toggle")}</bdi>
      </span>
    </button>
  )
}

function ProjectGroupSidebarNewSession(props: { onNew: () => void }) {
  const command = useCommand()
  const language = useLanguage()
  return (
    <button
      type="button"
      data-titlebar-tab-action
      data-action="vertical-tabs-new-session"
      class="group flex h-7 w-full shrink-0 items-center gap-1.5 rounded-[6px] ps-1.5 pe-2 text-[13px] leading-4 text-v2-text-text-base"
      onClick={props.onNew}
      aria-label={language.t("command.session.new")}
    >
      <Icon name="edit" class="shrink-0" />
      <span class="min-w-0 truncate">{language.t("command.session.new")}</span>
      <span class="ms-auto min-w-0 truncate text-[11px] leading-text-compact text-v2-text-text-faint" aria-hidden="true">
        <bdi dir="ltr">{command.keybind("tab.new")}</bdi>
      </span>
    </button>
  )
}
