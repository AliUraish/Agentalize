import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { foldInvestigation } from '../lib/investigationReducer'
import { INVESTIGATION_DURATION, INVESTIGATION_EVENTS } from '../mock/investigation'
import type { InvestigationEvent } from '../types/events'
import {
  openInvestigationStream,
  type ConnectionState,
  type StreamHandle,
} from '../lib/stream'

export type Source = 'mock' | 'live'

/**
 * Drives the investigation workspace.
 *
 * One append-only event log plus a cursor; everything visible is
 * `fold(events, cursor)`. Live streaming and scrubbed replay differ only in who
 * moves the cursor, so §20's "live" and "conflict" states share one code path
 * and a reconnect mid-run cannot desync the view.
 */
export function useInvestigationEngine(investigationId: string, source: Source = 'mock') {
  const [events, setEvents] = useState<InvestigationEvent[]>([])
  const [cursor, setCursor] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [connection, setConnection] = useState<ConnectionState>('offline')

  const cursorRef = useRef(0)
  const streamRef = useRef<StreamHandle | null>(null)

  const writeCursor = useCallback((v: number) => {
    cursorRef.current = v
    setCursor(v)
  }, [])

  const lastT = events.length ? events[events.length - 1].t : 0
  const finished = events.some((e) => e.type === 'investigation.completed')
  const duration = source === 'mock' ? INVESTIGATION_DURATION : Math.max(lastT, cursor)

  // Load the log. Mock has it all up front; the clock reveals it.
  useEffect(() => {
    if (source === 'mock') {
      setEvents(INVESTIGATION_EVENTS)
      setConnection('streaming')
      writeCursor(INVESTIGATION_DURATION) // open on the finished state
      return
    }
    setEvents([])
    streamRef.current = openInvestigationStream(
      investigationId,
      (ev) => setEvents((prev) => [...prev, ev]),
      setConnection,
    )
    setPlaying(true)
    return () => {
      streamRef.current?.close()
      streamRef.current = null
    }
  }, [source, investigationId, writeCursor])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      const next = cursorRef.current + dt * speed
      if ((source === 'mock' || finished) && next >= duration) {
        writeCursor(duration)
        setPlaying(false)
        return
      }
      writeCursor(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, duration, finished, source, writeCursor])

  const state = useMemo(() => foldInvestigation(events, cursor), [events, cursor])

  const replay = useCallback(() => {
    writeCursor(0)
    setPlaying(true)
  }, [writeCursor])

  const seek = useCallback(
    (t: number) => writeCursor(Math.max(0, Math.min(t, duration))),
    [duration, writeCursor],
  )

  const toggle = useCallback(() => {
    if (!playing && cursorRef.current >= duration) replay()
    else setPlaying((p) => !p)
  }, [playing, duration, replay])

  return {
    state,
    events,
    cursor,
    duration,
    playing,
    speed,
    connection,
    setSpeed,
    replay,
    seek,
    toggle,
  }
}

export type InvestigationEngine = ReturnType<typeof useInvestigationEngine>
