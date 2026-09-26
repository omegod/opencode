import { execFileSync } from "node:child_process"
import base from "./electron-builder.config"

// Local prod builds have no Team-ID signing certificate: electron-builder signs
// the bundle with hardened runtime using a teamless cert, and dyld then rejects
// every framework load ("different Team IDs"). Re-sign ad-hoc after signing and
// before the dmg/zip targets are built, so the images contain the fixed bundle.
export default {
  ...base,
  afterSign: async (context: {
    appOutDir: string
    packager: { appInfo: { productFilename: string } }
  }) => {
    const app = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" })
  },
}
