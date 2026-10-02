import { app } from "electron"

type Channel = "local" | "dev" | "beta" | "prod"
const raw = import.meta.env.OPENCODE_CHANNEL
export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"
export const VERSION = app.isPackaged ? app.getVersion() : (process.env.OPENCODE_VERSION ?? app.getVersion())

// Only production builds check for updates: the updater is created for the prod channel and
// reads this fork's GitHub releases via the embedded app-update.yml feed. Dev, beta, and local
// builds keep the updater off.
export const UPDATER_ENABLED = CHANNEL === "prod"

const appNames: Record<string, string> = {
  dev: "OpenCode Dev",
  beta: "OpenCode Beta",
  prod: "OpenCode",
}
const appIDs: Record<string, string> = {
  dev: "ai.opencode.desktop.dev",
  beta: "ai.opencode.desktop.beta",
  prod: "ai.opencode.desktop",
}
// Local renderer/server mode keeps the dev application identity.
export const APP_NAME = app.isPackaged ? appNames[CHANNEL] : "OpenCode Dev"
export const APP_ID = app.isPackaged ? appIDs[CHANNEL] : "ai.opencode.desktop.dev"
