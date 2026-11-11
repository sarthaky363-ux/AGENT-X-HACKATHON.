# ENTANGLE architecture

This note summarizes the current implementation. The user-facing overview and text diagram are in the [README](../README.md); per-agent triggers, tools, contracts, and errors are in [agents.md](agents.md).

## Shared WorldState

`src/state/store.ts` keeps an in-memory Zustand store with an event array and derived projections. `dispatchEvent` creates a versioned event, reduces it, then notifies subscribers. `reduceAllEvents` rebuilds the projections from the event history. The UI runs a replay/version self-check on startup.

The event shape is `{ id, ts, actor, type, payload, reason, version }`. Payloads are not covered by one runtime schema: each event producer/reducer applies its own checks. The store is append-oriented during a session, but the demo reset replaces the event history with seeded genesis events; it is not durable or tamper-proof storage.

## Processing flow

1. A report enters the store and receives a deterministic credibility score.
2. The store schedules credibility recomputation after report ingestion and official-alert release. Changed scores emit `CREDIBILITY_UPDATED`.
3. Triage reacts to report and credibility events. It uses Gemini function calling when available, with deterministic local triage when a request fails or its response is unusable.
4. Dispatch runs at startup and when relevant incident, volunteer, resource, credibility, rejection, alert, or road-closure events occur. TypeScript creates three candidate strategies; Gemini is optional for calling the deterministic plan builder and writing explanations.
5. Simulation runs 300 seeded trials for candidate plans after plan or seed changes. It computes the result metrics locally; Gemini may explain the finished numbers.
6. A human may approve one eligible plan or reject a candidate with a reason. Approval changes local assignments and resource state. It does not operate a real dispatch system.
7. Only a human-approved plan can trigger Comms draft creation. Each draft needs its own operator approval before it appears in a local mock outbox.

## Safety and integration boundary

The store restricts sensitive actions such as plan approval, message approval, freeze, and resume to the operator action path. While frozen, the store rejects writes other than an authorized human `UNFREEZE`. Agents check their generation/kill state around asynchronous work; network calls already in flight are not guaranteed to be cancelled at the transport layer.

Credibility, priority, route estimates, candidate-plan metrics, and Monte Carlo metrics are computed by TypeScript. Model prompts ask for tool use or prose only; generated prose is not proof of facts and is not comprehensively checked against the structured numbers.

The current system uses seeded reports, official alerts, resources, schematic coordinates, and synthetic simulation assumptions. It has no live IMD/NDMA feed, real road routing, responder dispatch, WhatsApp Business API, or Bhashini integration. See the [roadmap](../README.md#roadmap) and [known limitations](../README.md#known-limitations).
