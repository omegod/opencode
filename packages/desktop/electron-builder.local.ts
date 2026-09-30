import base from "./electron-builder.config"

// Local prod builds reuse an existing self-signed certificate ("RedixDevCert") instead of a
// Developer ID. macOS then reports an unidentified developer and offers the Privacy & Security
// "Open Anyway" flow, rather than treating the bundle as damaged, and the build never adds
// anything to the keychain. The certificate must already exist on the build machine.
//
// `hardenedRuntime` stays off: with a teamless certificate the runtime flag makes dyld reject
// framework loads, and notarization (which needs a Developer ID) is skipped as well.
export default {
  ...base,
  mac: {
    ...base.mac,
    identity: "RedixDevCert",
    hardenedRuntime: false,
    notarize: false,
  },
}
