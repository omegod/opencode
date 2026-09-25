import { describe, expect, test } from "bun:test"
import type { ServerConnection } from "@/runtime/server/registry"
import type { LocalProject } from "@/shell/state/layout"
import type { Tab } from "@/shell/tabs/tabs"
import { groupTabEntries, parseProjectSortableId, projectMoveIndex, projectSortableId } from "./tab-groups"

const key = (value: string) => value as ServerConnection.Key
const session = (server: string, sessionId: string): Tab => ({ type: "session", server: key(server), sessionId })
const draft = (server: string, draftID: string, directory: string): Tab => ({
  type: "draft",
  draftID,
  server: key(server),
  directory,
})
const project = (worktree: string, name?: string): LocalProject => ({ worktree, expanded: true, name })

describe("groupTabEntries", () => {
  test("groups tabs by project following the project order and keeps unknown directories last", () => {
    const groups = groupTabEntries(
      [
        { tab: session("local", "1"), server: key("local"), directory: "/b", project: project("/b", "Beta") },
        { tab: draft("local", "d1", "/a"), server: key("local"), directory: "/a", project: project("/a", "Alpha") },
        { tab: session("local", "2"), server: key("local"), directory: "/a/sub", project: project("/a", "Alpha") },
        { tab: session("local", "3"), server: key("local"), directory: "/x", project: undefined },
        { tab: session("local", "4"), server: key("local"), directory: "/b", project: project("/b", "Beta") },
      ],
      { serverIndex: () => 0, projectOrder: () => ["/b", "/a"] },
    )

    expect(groups.map((group) => group.name)).toEqual(["Beta", "Alpha", "x"])
    expect(groups.map((group) => group.key)).toEqual(["local\n/b", "local\n/a", "local\n/x"])
    expect(groups[0]!.tabs.map((tab) => ("sessionId" in tab ? tab.sessionId : tab.draftID))).toEqual(["1", "4"])
    expect(groups[1]!.tabs.map((tab) => ("sessionId" in tab ? tab.sessionId : tab.draftID))).toEqual(["d1", "2"])
    expect(groups[2]!.project).toBeUndefined()
    expect(groups[2]!.directory).toBe("/x")
  })

  test("groups with the same worktree on different servers stay separate", () => {
    const groups = groupTabEntries(
      [
        { tab: session("remote", "r"), server: key("remote"), directory: "/a", project: project("/a") },
        { tab: session("local", "l"), server: key("local"), directory: "/a", project: project("/a") },
      ],
      {
        serverIndex: (server) => (server === "local" ? 0 : 1),
        projectOrder: () => ["/a"],
      },
    )

    expect(groups.map((group) => group.server)).toEqual([key("local"), key("remote")])
    expect(groups[0]!.tabs).toHaveLength(1)
    expect(groups[1]!.tabs).toHaveLength(1)
  })

  test("keeps unknown directories in first-appearance order after ranked projects", () => {
    const groups = groupTabEntries(
      [
        { tab: session("local", "1"), server: key("local"), directory: "/z", project: undefined },
        { tab: session("local", "2"), server: key("local"), directory: "/a", project: project("/a") },
        { tab: session("local", "3"), server: key("local"), directory: "/y", project: undefined },
      ],
      { serverIndex: () => 0, projectOrder: () => ["/a"] },
    )

    expect(groups.map((group) => group.directory)).toEqual(["/a", "/z", "/y"])
  })
})

describe("projectMoveIndex", () => {
  const full = ["/a", "/b", "/c", "/d"]

  test("moves within the full visible list", () => {
    expect(projectMoveIndex({ full, visible: full, from: 0, to: 2 })).toBe(2)
    expect(projectMoveIndex({ full, visible: full, from: 3, to: 0 })).toBe(0)
    expect(projectMoveIndex({ full, visible: full, from: 1, to: 3 })).toBe(3)
    expect(projectMoveIndex({ full, visible: full, from: 1, to: 1 })).toBeUndefined()
  })

  test("moves within a visible subsequence of the full list", () => {
    const visible = ["/a", "/c"]
    expect(projectMoveIndex({ full, visible, from: 0, to: 1 })).toBe(2)
    expect(projectMoveIndex({ full, visible, from: 1, to: 0 })).toBe(0)

    const tail = ["/b", "/d"]
    expect(projectMoveIndex({ full, visible: tail, from: 0, to: 1 })).toBe(3)
    expect(projectMoveIndex({ full, visible: tail, from: 1, to: 0 })).toBe(1)
  })

  test("ignores moves of unknown or out-of-range entries", () => {
    expect(projectMoveIndex({ full, visible: ["/b"], from: 0, to: 1 })).toBeUndefined()
    expect(projectMoveIndex({ full, visible: full, from: 0, to: -1 })).toBeUndefined()
    expect(projectMoveIndex({ full, visible: ["/missing"], from: 0, to: 0 })).toBeUndefined()
  })
})

describe("project sortable ids", () => {
  test("round trips server and worktree", () => {
    const id = projectSortableId(key("local"), "/a/b")
    expect(id).toBe("project:local\n/a/b")
    expect(parseProjectSortableId(id)).toEqual({ server: key("local"), worktree: "/a/b" })
  })

  test("ignores ids that are not project sortables", () => {
    expect(parseProjectSortableId("draft:d1")).toBeUndefined()
    expect(parseProjectSortableId("project:noseparator")).toBeUndefined()
  })
})
