import type { InvestigationEvent } from '../types/events'

export type ConnectionState = 'offline' | 'connecting' | 'streaming' | 'error'

export interface StreamHandle {
  close: () => void
}

/**
 * §11 realtime channel. The control plane sends each `InvestigationEvent` as one
 * SSE `data:` frame of JSON. Reconnecting with `?after=<t>` resumes mid-run
 * without replaying the whole log.
 */
export function openInvestigationStream(
  investigationId: string,
  onEvent: (ev: InvestigationEvent) => void,
  onState: (s: ConnectionState) => void,
  after = 0,
): StreamHandle {
  const url = `/v1/investigations/${encodeURIComponent(investigationId)}/events?after=${after}`
  const es = new EventSource(url)
  onState('connecting')

  es.onopen = () => onState('streaming')
  es.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data) as InvestigationEvent)
    } catch {
      // A malformed frame must not tear down the stream.
    }
  }
  es.onerror = () => {
    onState(es.readyState === EventSource.CLOSED ? 'error' : 'connecting')
  }

  return {
    close: () => {
      es.close()
      onState('offline')
    },
  }
}

/** §11 command API. Every command carries an idempotency key and the expected version. */
export async function command<T>(
  path: string,
  body: unknown,
  expectedVersion?: number,
): Promise<T> {
  const res = await fetch(`/v1${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
      ...(expectedVersion !== undefined ? { 'If-Match': String(expectedVersion) } : {}),
    },
    body: JSON.stringify(body),
  })
  if (res.status === 409) {
    // §20 conflict state — the caller reconciles against the newer resource.
    throw Object.assign(new Error('conflict'), { conflict: await res.json() })
  }
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`)
  return (await res.json()) as T
}
