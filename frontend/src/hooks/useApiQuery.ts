import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '../lib/api'

export function useApiQuery<T>(path: string, refreshMs = 0) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await apiGet<T>(path, signal)
      setData(next)
      setError(null)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(caught instanceof Error ? caught : new Error('Request failed'))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [path])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)

    const timer = refreshMs > 0 ? window.setInterval(() => void load(), refreshMs) : undefined
    return () => {
      controller.abort()
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [load, refreshMs])

  return { data, error, loading, refresh: () => load() }
}

