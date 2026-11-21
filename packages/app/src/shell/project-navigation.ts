import { createMediaQuery } from "@solid-primitives/media"
import { usePlatform } from "@/runtime/platform/platform"
import { useSettings } from "@/settings/model"

export function useProjectNavigation() {
  const platform = usePlatform()

  if (platform.platform !== "desktop") return () => false

  const settings = useSettings()

  const mobile = createMediaQuery("(max-width: 767px)")

  return () => {
    // Classic project grouping replaces the organize modes, so Home keeps its own overview.
    if (settings.appearance.groupTabsByProject()) return false
    if (mobile() || settings.appearance.tabLayout() !== "vertical") return false
    const mode = settings.general.sidebarOrganize()

    return mode === "projects" || mode === "customize"
  }
}
