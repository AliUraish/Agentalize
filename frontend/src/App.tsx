import { useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Construction } from 'lucide-react'
import { Sidebar } from './components/shell/Sidebar'
import { TopBar, type TimeRange } from './components/shell/TopBar'
import { ContentCaptureBanner } from './components/shell/Banner'
import { EmptyState } from './components/ui/Primitives'
import { Overview } from './screens/Overview'
import { Incidents } from './screens/Incidents'
import { IncidentDetail } from './screens/IncidentDetail'
import { MemoryExplorer } from './screens/MemoryExplorer'
import { INCIDENTS } from './mock/dataset'
import type { Environment } from './types/domain'

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}

function Shell() {
  const [collapsed, setCollapsed] = useState(false)
  const [environment, setEnvironment] = useState<Environment>('production')
  const [range, setRange] = useState<TimeRange>('24h')
  const location = useLocation()

  const onIncidentDetail = location.pathname.startsWith('/incidents/')

  return (
    <div className="flex h-full">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          breadcrumb={useBreadcrumb()}
          environment={environment}
          onEnvironment={setEnvironment}
          range={range}
          onRange={setRange}
          live
        />
        {location.pathname === '/overview' && <ContentCaptureBanner />}

        <main
          className={`min-h-0 flex-1 ${onIncidentDetail ? 'flex flex-col' : 'overflow-y-auto'}`}
        >
          <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<Overview />} />
            <Route path="/incidents" element={<Incidents />} />
            <Route path="/incidents/:incidentId" element={<IncidentDetail />} />
            <Route path="/memory" element={<MemoryExplorer />} />
            <Route path="*" element={<NotBuilt />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

/** Breadcrumbs are derived from the route so deep links label themselves. */
function useBreadcrumb() {
  const location = useLocation()
  const parts = location.pathname.split('/').filter(Boolean)
  const crumbs: { label: string }[] = [{ label: 'Support Platform' }]

  if (parts[0] === 'incidents') {
    crumbs.push({ label: 'Incidents' })
    if (parts[1]) {
      const inc = INCIDENTS.find((i) => i.incidentId === parts[1])
      crumbs.push({ label: inc?.title ?? parts[1] })
    }
  } else if (parts[0]) {
    crumbs.push({ label: parts[0][0].toUpperCase() + parts[0].slice(1) })
  }
  return crumbs
}

/**
 * §26 says to build one complete story rather than every screen. The remaining
 * routes are declared so navigation is honest about what exists.
 */
function NotBuilt() {
  const location = useLocation()
  const name = location.pathname.split('/').filter(Boolean).join(' / ')
  return (
    <EmptyState
      icon={Construction}
      title={`${name} is not part of the demo slice`}
      detail="This build carries the complete detect → evidence → investigate → fix → verify → remember loop for one incident. The remaining screens are specified in the architecture document but intentionally not built yet."
    />
  )
}
