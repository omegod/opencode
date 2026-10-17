// Fork-only bottom working indicator. Upstream renders a single "Working" shimmer; while the model
// reasons and the timeline keeps that thought inside the collapsed group (thinking placement
// `grouped`), this indicator shows the thinking label plus the newest line of the reasoning text.
// The line scrolls to the latest token and rolls when the reasoning moves on to another line.
import { createEffect, createMemo, on, onCleanup, Show, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { TextShimmer } from "@opencode/ui/text-shimmer"
import type { TimelineDetail } from "@opencode/session-ui/timeline/detail"
import { useLanguage } from "@/runtime/i18n/language"
import type { TimelineController } from "./controller"
import "./session-working.css"

// Roll timing follows the ZCode reasoning summary: one line plays for a transition plus a hold,
// a blocked main thread skips the lines it queued up instead of replaying stale thoughts.
const ROLL_TRANSITION_MS = 300
const ROLL_HOLD_MS = 500
const ROLL_TOTAL_MS = ROLL_TRANSITION_MS + ROLL_HOLD_MS
const ROLL_TIMER_DRIFT_SKIP_MS = 250
const ROLL_MAX_PENDING = 2

type ThoughtLine = { key: number; text: string }

export function SessionWorking(props: {
  projection: TimelineController["data"]["projection"]
  timelineDetail: Accessor<TimelineDetail>
}) {
  const language = useLanguage()

  // Separate and hidden placements render (or hide) the thought themselves, so the indicator only
  // picks it up while the collapsed group owns it.
  const thought = createMemo(() => {
    if (props.timelineDetail().thinking.placement !== "grouped") return undefined

    const active = props.projection.activeMessageID()
    if (!active) return undefined

    const assistant = props.projection.assistantMessagesByParent().get(active)?.at(-1)
    if (!assistant || assistant.time.completed !== undefined || assistant.error || assistant.retry) return undefined

    const content = assistant.content.at(-1)
    if (content?.type !== "reasoning" || content.time?.completed !== undefined) return undefined

    return content.text
  })

  return (
    <div data-component="session-working" role="status">
      <Show when={thought()} fallback={<TextShimmer text={language.t("session.timeline.working")} active />}>
        {(text) => (
          <>
            <TextShimmer
              text={language.t("ui.sessionTurn.status.thinking")}
              active
              class="shrink-0 whitespace-nowrap"
            />
            <span data-slot="session-working-separator" aria-hidden="true">
              ·
            </span>
            <ThoughtSummary text={text()} />
          </>
        )}
      </Show>
    </div>
  )
}

function ThoughtSummary(props: { text: string }) {
  const [state, setState] = createStore<{
    roll: number
    current?: ThoughtLine
    leaving?: ThoughtLine
    overflowing: boolean
  }>({ roll: 0, overflowing: false })

  let queue: ThoughtLine[] = []
  let animating = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let frame: number | undefined
  let viewport: HTMLSpanElement | undefined

  const reducedMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true

  const clearTimer = () => {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
  }

  // Reading scrollWidth forces layout, so the viewport sync waits for the next frame instead of
  // running once per streamed token.
  const syncScroll = () => {
    if (frame !== undefined) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      if (!viewport) return
      const rtl = getComputedStyle(viewport).direction === "rtl"
      viewport.scrollLeft = rtl ? -viewport.scrollWidth : viewport.scrollWidth
      setState("overflowing", viewport.scrollWidth > viewport.clientWidth + 1)
    })
  }

  const promote = (line: ThoughtLine) => {
    setState({ roll: state.roll + 1, current: line, leaving: state.current })
    syncScroll()

    if (reducedMotion()) {
      setState("leaving", undefined)
      return
    }

    animating = true
    const expected = performance.now() + ROLL_TOTAL_MS
    timer = setTimeout(() => {
      timer = undefined
      animating = false
      setState("leaving", undefined)

      const pending = performance.now() - expected > ROLL_TIMER_DRIFT_SKIP_MS ? queue.slice(-1) : queue.slice()
      queue = []
      const [next, ...rest] = pending
      if (!next) return

      queue = rest
      promote(next)
    }, ROLL_TOTAL_MS)
  }

  createEffect(
    on(
      () => props.text,
      (text) => {
        const line = lastThoughtLine(text)
        if (!line) return

        // Growth inside the same line refreshes in place, so streamed tokens never replay the roll.
        if (state.current?.key === line.key) {
          setState("current", line)
          syncScroll()
          return
        }

        if (reducedMotion()) {
          clearTimer()
          queue = []
          animating = false
          setState({ current: line, leaving: undefined })
          syncScroll()
          return
        }

        if (animating || queue.length > 0) {
          queue = enqueueThoughtLine(queue, line)
          return
        }

        promote(line)
      },
    ),
  )

  onCleanup(() => {
    clearTimer()
    if (frame !== undefined) cancelAnimationFrame(frame)
  })

  return (
    <span
      ref={viewport}
      data-slot="session-working-thought"
      data-overflowing={state.overflowing ? "true" : undefined}
      aria-hidden="true"
    >
      <span data-slot="session-working-thought-track">
        <Show when={state.roll} keyed>
          {(_roll) => (
            <span data-slot="session-working-thought-line" data-roll={state.leaving ? "in" : undefined}>
              {state.current?.text}
            </span>
          )}
        </Show>
        <Show when={state.leaving} keyed>
          {(leaving) => (
            <span data-slot="session-working-thought-line" data-roll="out">
              {leaving.text}
            </span>
          )}
        </Show>
      </span>
    </span>
  )
}

// The newest non-empty line plus its start offset as its identity. Scanning backwards keeps every
// token O(tail) instead of re-splitting the whole thought.
function lastThoughtLine(text: string): ThoughtLine | undefined {
  let end = text.length
  while (end > 0 && text[end - 1]!.trim() === "") end--
  if (end === 0) return undefined

  const start = text.lastIndexOf("\n", end - 1) + 1
  const line = text.slice(start, end).trim()
  if (!line) return undefined

  return { key: start, text: line }
}

function enqueueThoughtLine(queue: ThoughtLine[], line: ThoughtLine) {
  const existing = queue.findIndex((item) => item.key === line.key)
  if (existing >= 0) return queue.map((item, index) => (index === existing ? line : item))

  return queue.length === 0 ? [line] : [queue[0]!, line].slice(0, ROLL_MAX_PENDING)
}
