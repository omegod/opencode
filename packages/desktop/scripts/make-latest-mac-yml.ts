#!/usr/bin/env bun
// Generates dist/latest-mac.yml for a fork release. electron-builder no longer emits it:
// publish is explicitly null (otherwise it falls back to the root package.json repository
// field and embeds an app-update.yml pointing at upstream), and the updater feed is
// configured in code via setFeedURL. Layout replicates electron-builder's latest-mac.yml
// byte-for-byte in structure: version + files (zip first, then dmg) + top-level path/sha512
// pointing at the zip + releaseDate.
//
// Usage (from packages/desktop, after electron-builder finishes):
//   OPENCODE_VERSION=2.0.21-fork.1 bun ./scripts/make-latest-mac-yml.ts

import { createHash } from "node:crypto"
import path from "node:path"

const version = process.env.OPENCODE_VERSION
if (!version) throw new Error("OPENCODE_VERSION is required (e.g. 2.0.21-fork.1)")

const dist = path.resolve(import.meta.dir, "../dist")
const names = ["opencode-desktop-mac-arm64.zip", "opencode-desktop-mac-arm64.dmg"] as const

type Entry = { url: string; sha512: string; size: number }

const entries = await Promise.all(
  names.map(async (name): Promise<Entry> => {
    const file = Bun.file(path.join(dist, name))
    if (!(await file.exists())) throw new Error(`Missing release asset: ${file.name}`)
    const bytes = Buffer.from(await file.arrayBuffer())
    return { url: name, sha512: createHash("sha512").update(bytes).digest("base64"), size: bytes.length }
  }),
)

const [zip] = entries
const lines = [
  `version: ${version}`,
  "files:",
  ...entries.flatMap((entry) => [`  - url: ${entry.url}`, `    sha512: ${entry.sha512}`, `    size: ${entry.size}`]),
  `path: ${zip.url}`,
  `sha512: ${zip.sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  "",
]
await Bun.write(path.join(dist, "latest-mac.yml"), lines.join("\n"))
console.log(`Wrote dist/latest-mac.yml for ${version}`)
