# Agentalize — web app

Frontend for the Agentalize control plane, built to `AGENTALIZE_ARCHITECTURE.md`.

Per §26, this builds **one complete story** rather than every screen: a production
support agent starts returning stale account balances after a deploy, the failure
is correlated into an incident, vector search surfaces a verified historical fix,
the repo agent reproduces it and proposes a tested patch behind a human approval
gate, and production verification confirms the recovery and writes it back to
memory.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
```

## What is built

| Route | Spec | State |
|---|---|---|
| `/overview` | §15.2 | Built — KPIs, agent health with deployment markers, needs-attention, evaluation + feedback breakdowns, active investigations, verified fixes, agents table |
| `/incidents` | §15.8 | Built — the six default views, full column set |
| `/incidents/:id` | §15.9 | Built — sticky header, summary strip, all six tabs |
| `/memory` | §15.11 | Built — NL search, structured filters, similarity explanations, retrieval control |
| everything else | §13 | Declared in nav, renders an honest "not part of the demo slice" state |

The incident detail tabs map 1:1 to §15.9: **Overview**, **Evidence**,
**Investigation** (the §15.10 workspace), **Fix**, **Verification**, **Timeline**.

Deep links carry state, so you can point a judge straight at a moment:

```
#/incidents/inc_123?tab=investigation
#/incidents/inc_123?tab=fix
#/memory?focus=mem_12
```

## Architecture

**Everything derives from a folded event log.** The investigation workspace holds
an append-only `InvestigationEvent[]` plus a cursor in ms; everything on screen is
`fold(events, cursor)` (`src/lib/investigationReducer.ts`). Live streaming and
scrubbed replay differ only in who moves the cursor, so:

- a reconnect mid-investigation cannot desync the view,
- replay is not a separate code path that can drift from live,
- `?after=<t>` resume works without replaying the whole log.

```
src/
  types/domain.ts      read models mirroring the §10 collections
  types/events.ts      the investigation SSE contract
  lib/                 reducer, stream client, formatting
  mock/dataset.ts      the §26 story as MongoDB-shaped documents
  mock/investigation.ts  the scripted agent run
  components/ui/       badges, panels, tabs, metric cards, empty/partial states
  components/charts/   hand-rolled SVG — time series, bars, sparkline
  components/shell/    sidebar, top bar, banners
  screens/             one file per route; incident tabs in screens/incident/
```

## The backend seam

Two things replace the mock. Nothing else changes.

### 1. Read APIs (§11)

The screens currently import from `src/mock/dataset.ts`. Swap those imports for
fetches against the §11 read APIs — the exported constants already match the
document shapes in `src/types/domain.ts`.

### 2. Investigation stream (§11 realtime)

`GET /v1/investigations/:id/events` — SSE, one `RunEvent` JSON object per `data:`
frame, `t` in ms since investigation start.

```jsonc
{"t":2600,"type":"stage.entered","stage":"memory","workMode":"retrieve_memory"}
{"t":4200,"type":"block","block":{
  "blockId":"blk_4","stage":"memory","workMode":"retrieve_memory",
  "kind":"result","status":"success",
  "text":"3 verified memories retrieved…",
  "artifacts":[{"label":"mem_12 · 0.94 · verified","ref":"/memory/mem_12"}]}}
{"t":32900,"type":"permission.required","stage":"approval",
  "label":"Open a pull request",
  "note":"Fixer mode cannot open a PR without approval."}
```

Full union in `src/types/events.ts`. The four block kinds are **observation**
(fact + required citations), **hypothesis** (claim + confidence + supporting /
contradicting), **action** (bounded tool call + the permission it consumed), and
**result** (outcome + artifacts).

Per §11, stream concise action / evidence / result / next step — **not** hidden
chain-of-thought.

To point the UI at a live orchestrator, flip the source in
`useInvestigationEngine(investigationId, 'live')`. `vite.config.ts` proxies `/api`
to `127.0.0.1:8000`; point it at `/v1` for the control-plane API.

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
- **Runs & Traces, Evaluations, Feedback, Agents, Deployments, Settings.**
  Specified in §13–§15 and reachable in nav, but not built. Trace inspection is
  available inside the incident Evidence tab instead of as a standalone workspace.
- **Real auth, RBAC and tenant scoping.** The UI assumes an Approver role.
- **Command APIs.** Buttons that would mutate (`Approve and open PR`, `Pause`,
  `Exclude from retrieval`) are present and correctly gated, but not wired.
