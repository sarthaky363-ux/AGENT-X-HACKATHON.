# ENTANGLE

ENTANGLE is a simulated disaster-response control room for Mumbai flood and heatwave scenarios. Several cooperating agents share one event history, and a human operator approves every action that matters.

> **Prototype, not an emergency service.** All reports, alerts, map coordinates, volunteers, routes, inventories and simulations are demonstration data. The app does not contact responders, does not send public messages, and does not dispatch real vehicles. Messages are previewed in a local mock outbox only.

## The problem

During a fast-moving flood, control-room staff must reconcile noisy citizen reports, separate duplicates and rumors from corroborated facts, and allocate a small number of boats, vehicles and responders across competing incidents. A chat transcript cannot show which facts a recommendation rested on, or why it changed when new information arrived.

## What it does

- **Report intake:** typed or spoken reports, eight preset scenarios, and a replayable 90-second Mumbai scenario with 14 events.
- **Deterministic credibility:** every report is scored by fixed rules (corroboration, location, timing, official-alert contradiction, and extreme-claim checks). No language model is involved in scoring.
- **Triage:** merges duplicates, opens new incidents, or ignores a report. Uses typed tool calls when a Gemini key is configured, and a local fallback otherwise.
- **Dispatch:** builds three candidate plans (maximise coverage, protect critical incidents, minimise risk) with routes, coverage and risk computed in TypeScript.
- **Simulation:** 300 seeded trials per plan, computed in code.
- **Human approval gate:** only an operator can approve a plan, reject it with a reason, or approve each message. Unverified linked reports block plan approval.
- **Comms:** English, Hindi and Marathi drafts, created only after plan approval, each requiring its own approval before it reaches a local mock outbox.
- **Kill switch:** freezes all event writes until an operator explicitly resumes.

## Quantum Lab: quantum-inspired inventions

Open the **Quantum Lab** tab. Everything in it is classical mathematics that runs on an ordinary computer. No quantum hardware is used and no quantum speed-up is claimed. Results are relative scores from seeded simulations on demonstration data, not forecasts. The tab is advisory and never approves or sends anything.

1. **Entangled risk field** (`src/quantum/entangledSim.ts`, `src/ui/QuantumLab.tsx`). Incidents share a spatially correlated rain-surge field, correlated road closures, and scarce boats. Across 600 seeded worlds the app measures how strongly two incidents' outcomes depend on each other (phi coefficient and mutual information in bits). Marking one incident as reached or missed updates every linked incident's probability.
2. **Annealed, entanglement-aware dispatch** (`src/quantum/anneal.ts`). Plans several crews per incident by minimising expected people lost plus a penalty on correlated failure, while keeping at least 97% of the best expected reach. Simulated annealing with collective multi-volunteer moves searches the assignments. It is compared with the current one-crew-per-incident rule and a marginal-gain greedy baseline in the same simulation.
3. **Interference credibility** (`src/quantum/interference.ts`). Each source is a phasor whose length is the square root of its credibility. Independent corroboration adds up, an official contradiction cancels, and repeated messages from one reporter earn only 15% extra.
4. **Ward equity** (`src/quantum/equity.ts`). Expected reach per ward, weighted by vulnerability, with a flag for wards more than 20 points below the weighted average.
5. **Wait-or-act advisor** (`src/quantum/waitDecision.ts`). Compares the expected value of acting now on an unverified report with waiting for a second source.

Honest result on the seeded scenario (12 responders, 60 mm/hr, 600 trials, seed 42): planning several crews jointly reaches about 164 expected people, against about 140 for one crew per incident. Annealing roughly ties marginal-gain greedy on this five-incident case; its advantage should grow with more incidents.

## Other features

- **Correlated-neighbour pre-alerts** (`src/state/preAlerts.ts`, `src/ui/PreAlertPanel.tsx`): when an incident worsens, its entangled neighbours get a pre-alert that needs operator acknowledgement.
- **Counterfactual plan comparison** (`src/ui/PlanLattice.tsx`): each candidate plan is replayed on an isolated copy of the world. The result is labelled a simulated comparison, never a forecast.
- **Hash-chained audit log** (`src/state/auditChain.ts`): each event stores the hash of the previous event, and **Verify audit chain** recomputes the chain. Web Crypto is guarded, so the app shows "verification unavailable" instead of crashing when it is missing.
- **Heat-stress entanglement**: a heat factor raises correlation between ward incidents on hot days.
- **Route diversity**: when two crews are sent to one incident, the second prefers a different route.
- **Live weather with fallback** (`src/services/openMeteo.ts`): rainfall from the public Open-Meteo API, with a visible "cached" or "seeded" badge when offline. Weather is never presented as an official alert.
- **Offline and SMS mock** (`src/services/mockOutbox.ts`): an offline-first service worker and a 160-character Hindi or Marathi SMS preview. Nothing is transmitted.
- **Multilingual voice review** (`src/services/voiceTranscript.ts`): voice reports show a transcript and a language check, and low-confidence transcripts go to a human review step before triage.
- **Chaos controls** ( `src/ui/DemoScenarioControls.tsx`): "Boat capsized", "Road collapses" and "Alert contradicts rumour" re-run the analysis and re-plan live.
- **Director mode**: a guided, captioned tour of the app. It waits for a real operator approval click and does not approve on your behalf.

## Architecture

```text
Citizen and field reports   Official alerts   Operator actions
              \                  |                 /
               +-----------------+----------------+
                                 |
                  Shared WorldState (append-only event log)
                                 |
   Credibility   Triage   Dispatch   Simulation   Quantum Lab   Comms
   (rules, no LLM)  (tools + fallback)  (3 plans)  (300 trials)  (advisory)  (after approval)
                                 |
                       Human approval gate
                                 |
                  Local mock outbox only (nothing is sent)
```

The browser UI uses React, Vite, Tailwind CSS and Zustand. `server.ts` is an Express server that serves the production build and a single Gemini endpoint. The Gemini key is read only on the server.

Each agent's triggers, tools and failure behaviour are described in [`docs/agents.md`](docs/agents.md). Architecture notes are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Run locally

Requirements: Node.js 22 or newer and npm.

```sh
npm install
npm run dev
```

Open `http://localhost:3000`.

To run the production build with the Express server:

```sh
npm run build
npm start
```

### Optional: Gemini

The app works fully without a Gemini key, using deterministic rules and fixed templates. To enable Gemini-backed triage, dispatch explanations and translation, create a `.env` file from `.env.example` and set:

```sh
GEMINI_API_KEY=your-key-here
```

Never commit a real key. In Google AI Studio, the key is stored in the Secrets panel.

## Tests

```sh
npm run lint
npm test
```

Tests use `node:test` and cover approval flow, the demo scenario, voice transcripts, the quantum modules, the audit chain, pre-alerts, equity, the wait advisor, weather fallback, the offline outbox and fetch timeouts.

## How to demo

1. Click **Run scenario** and set speed to **4x**.
2. Open **Reports** and watch credibility scores update.
3. Click **Boat capsized** under *Demo chaos* and watch dispatch re-plan.
4. Open **Quantum Lab**, adjust the sliders, and mark one incident as missed to see the linked incident update.
5. In the plan lattice, approve one candidate. Approval changes only the local simulation state.
6. In **Comms**, approve one Hindi or Marathi draft and check the mock outbox.
7. Click **Verify audit chain** in the timeline, then try **Kill Switch**.

## Safety and trust boundaries

- **Human approval gate:** agents cannot approve plans or messages.
- **Kill switch:** freezes event writes until a human resumes.
- **Numbers from code:** credibility, priority, routes and simulation results are computed in TypeScript. Model prose is explanatory only and is not checked against every number.
- **No external action:** no responder is contacted and no public message is sent.
- **Audit log limits:** the hash chain makes edits detectable within the running session. It is not a durable or externally verified audit service.

## Known limitations

- Demo data and schematic map coordinates. There are no live IMD or NDMA feeds.
- Routes use straight-line distance with fixed vehicle speeds and demo inventories, not a road graph.
- Monte Carlo and quantum-inspired results come from seeded synthetic assumptions. Reproducibility does not make them operationally validated.
- Plan probabilities are relative scores, not calibrated forecasts.
- State is in memory. There is no login and no persistence across reloads.
- Quantum-inspired means classical mathematics. The app does not use quantum hardware.

## Roadmap

- Authenticated IMD and NDMA feeds with provenance and freshness checks.
- WhatsApp Business API, gated behind operator authorisation and delivery tracking.
- Bhashini evaluation for speech and translation, with human review and an offline fallback.
- A road-graph routing service for Mumbai.

## Licence and credits

Built for the hackathon as a prototype. Add your team name and licence here before submission.
