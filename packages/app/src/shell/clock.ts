import { createSignal, onCleanup } from "solid-js"

const [now, setNow] = createSignal(Date.now())

let consumers = 0
let timer: number | undefined

/** Read in a reactive scope to keep relative-time copy current. */
export function clockNow() {
  return now()
}

/** Refcounted driver for the shared clock; call during component setup. */
export function useClock() {
  consumers += 1
  if (timer === undefined) timer = window.setInterval(() => setNow(Date.now()), 60_000)
  onCleanup(() => {
    consumers -= 1
    if (consumers > 0 || timer === undefined) return
    window.clearInterval(timer)
    timer = undefined
  })
}
