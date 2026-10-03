// @refresh reload

import "./diagnostics"
import "./styles.css"
import { render } from "solid-js/web"
import { api } from "./api"
import { DesktopApp } from "./desktop-app"
import { startDesktopMenu } from "./platform/menu"
import { startDeepLinks } from "./startup/deep-links"
import { requireRendererRoot } from "./startup/root"
import { desktopVersion, initializeSentry } from "./startup/sentry"

// The macOS window is drawn with native vibrancy; mark the document so the shell paints translucent
// chrome over the blur.
if (navigator.userAgent.includes("Mac")) document.documentElement.dataset.vibrancy = "true"

const root = requireRendererRoot()
const version = desktopVersion()

startDesktopMenu(api)
startDeepLinks(api)

render(() => <DesktopApp api={api} version={version} />, root)
void initializeSentry(version)
