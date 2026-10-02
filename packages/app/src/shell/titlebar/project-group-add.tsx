import { createSignal, For, Show } from "solid-js"
import { Menu } from "@opencode/ui/menu"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Tooltip } from "@opencode/ui/tooltip"
import { ProjectAvatar } from "@opencode/ui/project-avatar"
import { addProjects } from "@/home/projects/add"
import { parseHomeSessionIndex } from "@/home/sessions/index"
import { useLanguage } from "@/runtime/i18n/language"
import { ServerConnection } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { displayName, getProjectAvatarSource, homeProjectDirectories } from "@/shell/layout/helpers"
import { getProjectAvatarVariant, type LocalProject } from "@/shell/state/layout"
import { useTabs } from "@/shell/tabs/tabs"
import { useDirectoryPicker } from "@/workspaces/selection/picker"
import { pathKey } from "@/workspaces/path-key"
import { projectGroupKey } from "./tab-groups"

// Cap for one index pull when loading a project's sessions; matching the home
// page's bounded-index approach so a huge project cannot open endless tabs.
const SESSION_INDEX_LIMIT = 100

const menuItemClass =
  "flex h-7 min-w-0 items-center gap-2 rounded-[6px] px-1.5 text-[13px] font-[440] leading-5 text-v2-text-text-muted [font-family:var(--v2-font-family-sans)] data-[highlighted]:bg-v2-background-bg-layer-01 data-[highlighted]:text-v2-text-text-base"

// Hover-revealed "add project" entry on the grouped list label row. Offers the
// server's projects that have no group yet, plus a pinned open-folder action.
export function ProjectGroupAdd(props: { exclude: () => Set<string> }) {
  const global = useGlobal()
  const tabs = useTabs()
  const language = useLanguage()
  const pickDirectory = useDirectoryPicker()
  // The menu content is force-mounted (see tab-nav.css), so the closed state must not run the
  // close fade before the menu ever opened; that would flash the popup on every mount.
  const [opened, setOpened] = createSignal(false)

  const addable = () =>
    global.servers.list().flatMap((conn) => {
      const key = ServerConnection.key(conn)
      const context = global.ensureServerCtx(conn)
      return context.projects
        .list()
        .filter((project) => !props.exclude().has(projectGroupKey(key, project.worktree)))
        .map((project) => ({ conn, project }))
    })

  // Load the project's sessions as background tabs: merge the fetched index
  // into the client store first, then add one idempotent tab per session.
  const loadSessions = (conn: ServerConnection.Any, project: LocalProject) => {
    const context = global.ensureServerCtx(conn)
    context.projects.open(project.worktree)
    void context.sdk.api.session
      .list({ limit: SESSION_INDEX_LIMIT, order: "desc", parentID: null })
      .then((response) => {
        for (const session of parseHomeSessionIndex(response.data)) context.data.session.remember(session)
      })
      .catch(() => undefined)
      .then(() => {
        const directories = new Set([project.worktree, ...(project.sandboxes ?? [])].map(pathKey))
        const sessions = context.data.session.list().filter(
          (session) =>
            !session.parentID &&
            typeof session.time.archived !== "number" &&
            (directories.has(pathKey(session.location.directory)) ||
              (!!project.id && session.projectID === project.id)),
        )
        // An empty project still needs its group, so fall back to the new-session flow.
        if (sessions.length === 0) {
          void tabs.newDraft({ server: ServerConnection.key(conn), directory: project.worktree })
          return
        }
        for (const session of sessions) {
          tabs.addSessionTab({ server: ServerConnection.key(conn), sessionId: session.id })
        }
      })
  }

  const openFolder = () => {
    const conn = global.servers.list()[0]
    if (!conn) return
    pickDirectory({
      server: conn,
      title: language.t("command.project.open"),
      multiple: false,
      onSelect: (result) => {
        const [directory] = homeProjectDirectories(result)
        if (!directory) return
        const key = ServerConnection.key(conn)
        addProjects(global.ensureServerCtx(conn), [directory])
        void tabs.newDraft({ server: key, directory })
      },
    })
  }

  return (
    <Menu
      forceMount
      gutter={6}
      modal={false}
      placement="bottom-end"
      onOpenChange={(open) => {
        if (open) setOpened(true)
      }}
    >
      <Tooltip placement="bottom" value={language.t("home.project.add")}>
        <Menu.Trigger
          as={IconButton}
          data-action="tab-list-add-project"
          variant="ghost-muted"
          size="small"
          class="hover-reveal group-hover/label:opacity-100 focus-visible:opacity-100 data-[expanded]:!opacity-0"
          icon={<Icon name="plus" size="small" />}
          aria-label={language.t("home.project.add")}
        />
      </Tooltip>
      <Menu.Portal>
        <Menu.Content
          data-slot="tab-list-add-content"
          data-opened={opened() ? "" : undefined}
          class="w-[243px] overflow-hidden rounded-md border-0 bg-v2-background-bg-layer-01 shadow-[var(--v2-elevation-floating)] focus:outline-none"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div class="max-h-[224px] overflow-y-auto">
            <For each={addable()}>
              {(entry) => (
                <Menu.Item class={menuItemClass} closeOnSelect onSelect={() => loadSessions(entry.conn, entry.project)}>
                  <ProjectAvatar
                    fallback={displayName(entry.project)}
                    src={getProjectAvatarSource(entry.project.id, entry.project.icon)}
                    variant={getProjectAvatarVariant(entry.project.icon?.color)}
                  />
                  <span class="min-w-0 truncate leading-5">{displayName(entry.project)}</span>
                </Menu.Item>
              )}
            </For>
          </div>
          <Show when={addable().length > 0}>
            <div class="h-px bg-v2-border-border-muted" />
          </Show>
          <Menu.Item class={menuItemClass} closeOnSelect onSelect={openFolder}>
            <Icon name="folder-add-left" size="small" />
            <span class="min-w-0 truncate leading-5">{language.t("tab.group.openFolder")}</span>
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  )
}
