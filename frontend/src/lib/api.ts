const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')

const tenantHeaders = {
  ...(import.meta.env.VITE_ORGANIZATION_ID
    ? { 'x-organization-id': import.meta.env.VITE_ORGANIZATION_ID }
    : {}),
  ...(import.meta.env.VITE_PROJECT_ID
    ? { 'x-project-id': import.meta.env.VITE_PROJECT_ID }
    : {}),
  'x-actor-id': import.meta.env.VITE_ACTOR_ID || 'demo-user',
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface Page<T> {
  items: T[]
  count: number
  nextCursor: string | null
}

export interface HealthResponse {
  status: 'ok' | 'degraded'
  service: string
  version: string
  storage: string
  database: 'connected' | 'unavailable'
  workerMode: string
  timestamp: string
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    signal,
    headers: {
      accept: 'application/json',
      ...tenantHeaders,
      ...init.headers,
    },
  })

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    try {
      const body = (await response.json()) as { detail?: string }
      detail = body.detail || detail
    } catch {
      // Keep the HTTP fallback when the response has no JSON body.
    }
    throw new ApiError(response.status, detail)
  }

  return (await response.json()) as T
}

export function apiGet<T>(path: string, signal?: AbortSignal) {
  return apiRequest<T>(path, {}, signal)
}

export function apiPost<T>(path: string, body: unknown, signal?: AbortSignal) {
  return apiRequest<T>(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    signal,
  )
}

