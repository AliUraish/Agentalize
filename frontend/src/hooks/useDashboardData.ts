import { useCallback, useEffect, useState } from 'react'
import { apiGet, type Page } from '../lib/api'
import {
  mapAgent,
  mapDeployment,
  mapIncident,
  mapInvestigation,
  overviewKpis,
  type BackendAgent,
  type BackendDeployment,
  type BackendEvaluation,
  type BackendFeedback,
  type BackendIncident,
  type BackendInvestigation,
  type BackendOverview,
} from '../lib/liveData'
import type { Agent, Deployment, Incident, Investigation, OverviewKpi } from '../types/domain'

export interface DashboardData {
  overview: BackendOverview
  kpis: OverviewKpi[]
  agents: Agent[]
  incidents: Incident[]
  deployments: Deployment[]
  evaluations: BackendEvaluation[]
  feedback: BackendFeedback[]
  investigations: Investigation[]
}

export function useDashboardData(environment: string, hours: number) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (signal?: AbortSignal) => {
    const environmentQuery = environment ? `&environment=${encodeURIComponent(environment)}` : ''
    try {
      const [overview, agentPage, incidentPage, deploymentPage, evaluationPage, feedbackPage, investigationPage] =
        await Promise.all([
          apiGet<BackendOverview>(`/overview?hours=${hours}${environmentQuery}`, signal),
          apiGet<Page<BackendAgent>>('/agents?limit=200', signal),
          apiGet<Page<BackendIncident>>(`/incidents?limit=200${environment ? `&environment=${encodeURIComponent(environment)}` : ''}`, signal),
          apiGet<Page<BackendDeployment>>(`/deployments?limit=200${environment ? `&environment=${encodeURIComponent(environment)}` : ''}`, signal),
          apiGet<Page<BackendEvaluation>>('/evaluations?limit=200', signal),
          apiGet<Page<BackendFeedback>>('/feedback?limit=200', signal),
          apiGet<Page<BackendInvestigation>>('/investigations?limit=200', signal),
        ])

      const incidents = incidentPage.items.map((item) => mapIncident(item, agentPage.items))
      setData({
        overview,
        kpis: overviewKpis(overview),
        agents: agentPage.items.map((item) => mapAgent(item, overview, incidents)),
        incidents,
        deployments: deploymentPage.items.map(mapDeployment),
        evaluations: evaluationPage.items,
        feedback: feedbackPage.items,
        investigations: investigationPage.items.map(mapInvestigation),
      })
      setError(null)
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return
      setError(caught instanceof Error ? caught : new Error('Dashboard request failed'))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [environment, hours])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    const timer = window.setInterval(() => void load(), 10_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [load])

  return { data, error, loading, refresh: () => load() }
}

