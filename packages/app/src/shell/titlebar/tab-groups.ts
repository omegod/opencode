import type { ServerConnection } from "@/runtime/server/registry"
import { displayName } from "@opencode/ui/project-avatar"
import type { LocalProject } from "@/shell/state/layout"
import type { Tab } from "@/shell/tabs/tabs"

export type TabGroupEntry = {
  tab: Tab
  server: ServerConnection.Key
  directory: string
  project: LocalProject | undefined
}

export type TabGroup = {
  key: string
  server: ServerConnection.Key
  directory: string
  project: LocalProject | undefined
  name: string
  tabs: Tab[]
}

export const projectGroupKey = (server: ServerConnection.Key, worktree: string) => `${server}\n${worktree}`

export const projectSortableId = (server: ServerConnection.Key, worktree: string) =>
  `project:${server}\n${worktree}`

export function parseProjectSortableId(id: string) {
  if (!id.startsWith("project:")) return
  const body = id.slice("project:".length)
  const separator = body.indexOf("\n")
  if (separator === -1) return
  return { server: body.slice(0, separator) as ServerConnection.Key, worktree: body.slice(separator + 1) }
}

// Groups keep the global tab order inside each project; groups follow server order, then the
// server's project order, and directories that are not projects come last.
export function groupTabEntries(
  entries: TabGroupEntry[],
  ordering: {
    serverIndex: (server: ServerConnection.Key) => number
    projectOrder: (server: ServerConnection.Key) => string[]
  },
): TabGroup[] {
  const groups = new Map<string, TabGroup>()
  for (const entry of entries) {
    const worktree = entry.project?.worktree ?? entry.directory
    const key = projectGroupKey(entry.server, worktree)
    const existing = groups.get(key)
    if (existing) {
      existing.tabs.push(entry.tab)
      continue
    }
    groups.set(key, {
      key,
      server: entry.server,
      directory: worktree,
      project: entry.project,
      name: displayName(entry.project ?? { worktree }),
      tabs: [entry.tab],
    })
  }

  const position = new Map([...groups.keys()].map((key, index) => [key, index]))
  const ranks = new Map<ServerConnection.Key, Map<string, number>>()
  const projectRank = (group: TabGroup) => {
    if (!group.project) return Number.MAX_SAFE_INTEGER
    let rank = ranks.get(group.server)
    if (!rank) {
      rank = new Map(ordering.projectOrder(group.server).map((worktree, index) => [worktree, index]))
      ranks.set(group.server, rank)
    }
    return rank.get(group.project.worktree) ?? Number.MAX_SAFE_INTEGER
  }

  return [...groups.values()].sort((a, b) => {
    const server = ordering.serverIndex(a.server) - ordering.serverIndex(b.server)
    if (server !== 0) return server
    const rank = projectRank(a) - projectRank(b)
    if (rank !== 0) return rank
    return position.get(a.key)! - position.get(b.key)!
  })
}

// Translates a drop position within the visible project groups into the index `projects.move`
// expects in the full project list. The visible groups are a subsequence of the full list, and
// `move` splices the project out before inserting it again.
export function projectMoveIndex(input: {
  full: string[]
  visible: string[]
  from: number
  to: number
}): number | undefined {
  if (input.from === input.to) return undefined
  if (input.from < 0 || input.to < 0) return undefined
  if (input.from >= input.visible.length || input.to >= input.visible.length) return undefined
  const moved = input.visible[input.from]
  if (moved === undefined) return undefined
  const from = input.full.indexOf(moved)
  if (from === -1) return undefined

  const next = arrayMove(input.visible, input.from, input.to)
  const index = next.indexOf(moved)
  const following = next[index + 1]
  const previous = next[index - 1]
  const followingIndex = following !== undefined ? input.full.indexOf(following) : -1
  const previousIndex = previous !== undefined ? input.full.indexOf(previous) : -1
  const anchor = followingIndex !== -1 ? followingIndex : previousIndex !== -1 ? previousIndex + 1 : undefined
  if (anchor === undefined) return undefined
  return anchor - (from < anchor ? 1 : 0)
}

function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export type ProjectSortRow = {
  server: ServerConnection.Key
  project: string | undefined
}

// One dnd-kit sortable group spans every server section, so `from` and `to` are positions among all
// rendered rows. Translate a drop back to the dragged project's own server: a target in the same
// server names a project order position, while a target in another section (or a non-project row)
// clamps to this server's first or last project.
export function projectSectionMoveIndex(input: {
  full: string[]
  rows: ProjectSortRow[]
  from: number
  to: number
}): number | undefined {
  const source = input.rows[input.from]
  if (!source?.project) return undefined
  if (input.to < 0 || input.to >= input.rows.length) return undefined
  const visible = input.rows.flatMap((row) => (row.server === source.server && row.project ? [row.project] : []))
  const from = visible.indexOf(source.project)
  if (from === -1) return undefined

  const target = input.rows[input.to]
  const serverRows = input.rows.flatMap((row, index) =>
    row.server === source.server && row.project ? [index] : [],
  )
  const first = serverRows[0]
  if (first === undefined) return undefined
  const to =
    target?.server === source.server && target.project
      ? visible.indexOf(target.project)
      : input.to < first
        ? 0
        : visible.length - 1
  if (to < 0) return undefined
  return projectMoveIndex({ full: input.full, visible, from, to })
}
