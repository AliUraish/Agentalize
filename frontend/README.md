# Agentalize — web app

Frontend for the Agentalize control plane, built to `AGENTALIZE_ARCHITECTURE.md`.

This demo follows one agent only: **Python SDK Test Agent**
(`python-sdk-test-agent`). It captures article-fetch failures, correlates them
into incidents, and shows the complete `Python_gpt_gemini` repository architecture,
the suspected source line, why fetching failed, and the proposed regression test.

```bash
# Start the FastAPI backend first on http://127.0.0.1:8000.
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
```

Copy `.env.example` to `.env` only when you need to override the local API or
demo tenant. The default `/api/v1` URL is proxied to the local backend.

## What is built

| Route | Spec | State |
|---|---|---|
| `/overview` | §15.2 | Live — MongoDB-backed KPIs, incidents, evaluations, feedback, deployments, investigations and agents |
| `/incidents` | §15.8 | Live — filters and incident rows refresh every 10 seconds |
| `/incidents/:id` | §15.9 | Live — incident header, production summary and backend timeline |
| Agents, runs, evaluations, feedback, investigations, deployments, settings | Live API | MongoDB-backed operational views; investigations include repository evidence and source context |

The incident detail tabs map 1:1 to §15.9: **Overview**, **Evidence**,
**Investigation** (the §15.10 workspace), **Fix**, **Verification**, **Timeline**.

Deep links carry state, so you can point a judge straight at a moment:

```
#/incidents/inc_123?tab=investigation
#/incidents/inc_123?tab=fix
#/investigations?focus=inv_123
```

## Architecture

The investigation workspace reads live investigation, incident, repository, and
remediation records from the backend. Repository file reads are scoped to the
investigation root, limited to supported source formats and file sizes, redacted,
and returned as a small context window around the selected line.

```
src/
  types/domain.ts      read models mirroring the §10 collections
  lib/                 API client, live-data mapping, demo scope, formatting
  components/ui/       badges, panels, tabs, metric cards, empty/partial states
  components/charts/   hand-rolled SVG — time series, bars, sparkline
  components/shell/    sidebar, top bar, banners
  screens/             one file per route; incident tabs in screens/incident/
```

## Backend connection

`src/lib/api.ts` is the shared typed client. Dashboard requests are parallelized
and the main views poll the FastAPI read APIs every 10 seconds. Vite proxies
`/api` to `http://127.0.0.1:8000`, so provider and database credentials never
enter the browser bundle.

The static dataset remains only for a few presentation-only incident panels.

## Design system

Follows §17. Colour is semantic and never decorative:

| Role | Use |
|---|---|
| neutral | surfaces, borders, text |
| accent (blue) | primary action, selected state |
| ai (violet) | active AI investigation — **never** a correctness status |
| good (green) | verified pass / resolved **only** |
| warning (amber) | inconclusive, degraded, waiting |
| critical (red) | confirmed failure, high severity, destructive |

**Status is always icon + label + colour, never colour alone** — `Badge` in
`components/ui/Badge.tsx` requires an `icon` prop, so a bare coloured pill is not
expressible.

Charts follow the data-viz method: one y-axis everywhere (no dual-axis), bars
grow from a zero baseline, line charts use a labelled non-zero floor where a
compressed band would otherwise hide the signal, a legend is present for ≥2
series, and every chart has a hover layer. The categorical trio
(`#3987e5`, `#d95926`, `#9085e9`) was validated against the `#12151A` chart
surface — all checks pass, worst adjacent CVD ΔE 26.0.

## Deliberate gaps

- **Light theme.** Tokens are structured for it (semantic roles, single
  `@theme` block) but only dark is shipped.
- **Real auth, RBAC and tenant scoping.** The UI assumes an Approver role.
- **Command APIs.** Buttons that would mutate (`Approve and open PR`, `Pause`,
  `Exclude from retrieval`) are present and correctly gated, but not wired.
