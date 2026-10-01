import { useNavigate } from "@solidjs/router"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Menu } from "@opencode/ui/menu"
import { Tooltip } from "@opencode/ui/tooltip"
import { useLanguage } from "@/runtime/i18n/language"
import { useSettingsSurface } from "@/settings/surface"
import { useLayout } from "@/shell/state/layout"
import type { TabGroup } from "./tab-groups"
import type { Tab } from "@/shell/tabs/tabs"

export function ProjectTabGroupHeader(props: {
  group: TabGroup
  collapsed: boolean
  dragging: boolean
  handleRef: (element: Element | undefined) => void
  sourceRef: (element: Element | undefined) => void
  targetRef: (element: Element | undefined) => void
  onToggle: () => void
  onClose: (tab: Tab) => void
}) {
  const language = useLanguage()
  const surface = useSettingsSurface()
  const layout = useLayout()
  const navigate = useNavigate()

  const edit = () => {
    if (!props.group.project) return
    surface.openProject({ server: props.group.server, project: props.group.directory })
  }

  const openSessions = () => {
    layout.home.setSelection(
      props.group.project
        ? { server: props.group.server, directory: props.group.directory }
        : { server: props.group.server },
    )
    navigate("/")
  }

  const close = () => {
    for (const tab of props.group.tabs) props.onClose(tab)
  }

  return (
    <div
      ref={(element) => {
        props.sourceRef(element)
        props.targetRef(element)
        props.handleRef(element)
      }}
      data-slot="tab-group-header"
      data-dragging={props.dragging}
      class="group/tab-group relative flex h-7 w-full min-w-0 shrink-0 items-center rounded-[6px] pe-1 text-[13px] text-v2-text-text-faint transition-[background-color,color] duration-[120ms] ease-in-out hover:bg-v2-overlay-simple-overlay-hover active:bg-v2-overlay-simple-overlay-pressed"
    >
      <button
        type="button"
        data-slot="tab-group-toggle"
        class="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-[6px] bg-transparent px-1.5 text-left font-medium outline-none focus-visible:bg-v2-overlay-simple-overlay-hover"
        aria-expanded={!props.collapsed}
        aria-label={language.t(props.collapsed ? "tab.group.expand" : "tab.group.collapse")}
        onClick={(event) => {
          // The drag sensor calls preventDefault on post-drag clicks.
          if (event.defaultPrevented) return
          props.onToggle()
        }}
      >
        <span
          data-slot="tab-group-icon"
          class="flex size-4 shrink-0 items-center justify-center text-v2-icon-icon-muted"
        >
          <Icon name={props.collapsed ? "folder" : "folder-opened"} size="small" />
        </span>
        <span data-slot="tab-group-title" dir="auto" class="min-w-0 flex-1 truncate leading-4">
          {props.group.name}
        </span>
      </button>
      <Menu gutter={6} modal={false} placement="bottom-end">
        <Tooltip placement="bottom" value={language.t("common.moreOptions")}>
          <Menu.Trigger
            as={IconButton}
            data-action="tab-group-menu"
            variant="ghost-muted"
            size="small"
            class="hover-reveal group-hover/tab-group:opacity-100 focus-visible:opacity-100 data-[expanded]:opacity-100"
            icon={<Icon name="outline-dots" />}
            aria-label={language.t("common.moreOptions")}
          />
        </Tooltip>
        <Menu.Portal>
          <Menu.Content>
            <Menu.Item disabled={!props.group.project} onSelect={edit}>
              {language.t("dialog.project.edit.title")}
            </Menu.Item>
            <Menu.Item onSelect={openSessions}>{language.t("tab.group.sessions")}</Menu.Item>
            <Menu.Separator />
            <Menu.Item onSelect={close}>{language.t("common.close")}</Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu>
    </div>
  )
}
