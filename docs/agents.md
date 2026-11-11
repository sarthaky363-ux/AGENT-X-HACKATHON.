# Agent and event contracts

This page describes the behavior implemented in the current source, not a future deployment design. Paths are relative to the repository root.

## Shared event contract

`src/state/types.ts` defines the event shape:

```ts
interface Event {
  id: string;
  ts: number;
  actor: string;
  type: string;
  payload: any;
  reason: string;
  version: number;
}
```

`dispatchEvent` appends an event, increments the version, reduces it into the derived WorldState, and notifies subscribers. The event array and projections live in the browser's in-memory Zustand store. Event payloads are currently typed as `any`; payload shapes below are the concrete contracts found at each producer/reducer, not a universal runtime JSON Schema.

## Credibility module

**Implementation:** `src/tools/credibility.ts`, called by report/alert ingestion in `src/state/store.ts`. This role is shown in the UI but is not a separate LLM agent or a subscription module of its own.

**Trigger events:** A report is scored on ingestion (`REPORT_ADDED`); the store schedules recomputation for affected reports after report ingestion and `OFFICIAL_ALERT_RELEASED`. Changed results are emitted as `CREDIBILITY_UPDATED`, which can trigger Triage and Dispatch.

**Tools and input contracts:**

```ts
computeCredibility(
  report: Report,
  allReports: Report[],
  officialAlerts?: OfficialAlert[],
  volunteerTrustMap?: Record<string, number>
): CredibilityResult

evaluateAllAffectedReports(
  trigger: {
    area?: string;
    location?: { x: number; y: number };
    reporterId?: string;
    ts?: number;
    isAlert?: boolean;
  },
  allReports: Report[],
  officialAlerts: OfficialAlert[],
  volunteerTrustMap?: Record<string, number>
): AffectedReportEvaluation[]
```

The first function uses base source priors, independent reports within the code's schematic 300 m / 30 minute window, recent matching or contradicting official alerts, specificity, and reporter trust; it clamps the score to `0..1`. Reports below `0.35` are marked unverified and remain visible.

**Output contract:** There is no JSON Schema declaration. The actual TypeScript result is:

```ts
interface CredibilityResult {
  score: number;
  reasons: string[];
  isUnverified: boolean;
  reinforcementsCount: number;
  contradictedByAlert?: OfficialAlert;
  extremeClaimUncorroborated: boolean;
  specificityBreakdown: {
    hasStreetOrLandmark: boolean;
    hasPeopleCount: boolean;
    hasWaterDepth: boolean;
  };
  reporterTrustAdjustment: number;
}
```

Changed values are written as `CREDIBILITY_UPDATED` with payload `{ reportId, credibility, credibilityScore, explanation, reasons, isUnverified }`. `evaluateAllAffectedReports` returns `{ reportId, previousScore?, newScore, isUnverified, reasons, changed }`.

**Failure/eligibility behavior:** This path is deterministic and has no model/network fallback. A missing report in `score_priority` is handled separately by that triage tool. An unverified report is not deleted; Triage ignores it and Dispatch excludes an incident if it has report IDs but none are dispatchable. The data model has optional sensor-corroboration fields, but this scoring implementation does not read a live sensor feed.

## Triage agent

**Implementation:** `src/agents/triage.ts` and `src/tools/triageTools.ts`.

**Trigger events:** `REPORT_ADDED`, `REPORT_INGESTED`, and `CREDIBILITY_UPDATED`, when a report ID is present. Evaluation skips reports already merged, reports below the credibility threshold, duplicate in-flight jobs, and all work while frozen.

**Gemini function tools:** These are the six declarations passed to Gemini. Object schemas use the source's Gemini declaration notation (`OBJECT`, `STRING`, `NUMBER`, `ARRAY`).

| Tool | Input schema | Actual return |
|---|---|---|
| `get_open_reports` | `{ type: "OBJECT", properties: { area: { type: "STRING" } }, required: [] }` | Unmerged `Report[]`, optionally filtered by exact area name (case-insensitive). |
| `find_similar_reports` | `{ type: "OBJECT", properties: { reportId: { type: "STRING" }, radiusMeters: { type: "NUMBER" }, windowMinutes: { type: "NUMBER" } }, required: ["reportId"] }` | Related/unmerged `Report[]`; missing report ID returns `[]`; default radius/window are 300 m / 30 min. |
| `score_priority` | `{ type: "OBJECT", properties: { reportId: { type: "STRING" } }, required: ["reportId"] }` | `{ score: number, breakdown: { peopleAtRiskScore, peopleAtRiskCount, vulnerabilityScore, detectedVulnerabilities, waterDepthScore, detectedWaterDepth, timeElapsedScore, minutesSinceReport, roadBlockedScore, roadBlockedDetected, formulaDescription } }`. |
| `merge_reports` | `{ type: "OBJECT", properties: { primaryId: { type: "STRING" }, duplicateIds: { type: "ARRAY", items: { type: "STRING" } }, reason: { type: "STRING" } }, required: ["primaryId", "duplicateIds", "reason"] }` | `{ success: boolean, primaryId: string, duplicateIds: string[], reason: string }`; appends `REPORTS_MERGED`. |
| `create_incident` | `{ type: "OBJECT", properties: { area: { type: "STRING" }, summary: { type: "STRING" }, priority: { type: "NUMBER" }, needs: { type: "ARRAY", items: { type: "STRING" } }, reportIds: { type: "ARRAY", items: { type: "STRING" } } }, required: ["area", "summary", "priority", "needs", "reportIds"] }` | `{ success: boolean, incidentId: string, incident: Incident }`; severity is derived from the supplied priority and `INCIDENT_CREATED` is appended. |
| `translate_to_english` | `{ type: "OBJECT", properties: { text: { type: "STRING" } }, required: ["text"] }` | `Promise<string | null>`; cached translations are used for known example phrases, otherwise an API translation is attempted. |

The numerical priority formula is implemented in TypeScript. `score_priority` returns a base score of `10` with an explanatory breakdown if the report ID is missing; a valid report is scored using the fixed formula in `triageTools.ts`.

**Final output contract:** There is no standalone JSON Schema object. The prompt asks for raw JSON, and `validateTriageOutput` validates a TypeScript shape:

```ts
interface TriageFinalOutput {
  decision: 'merged' | 'new_incident' | 'ignored';
  incidentId?: string;
  reasoning: string;
}
```

The validator requires a supported decision and non-empty reasoning. For `new_incident`, it tolerates a missing `incidentId` because the runner may have captured the ID from an earlier tool call; the returned result fills it from that captured value if available.

**Failure behavior:** Gemini tool selection is limited to six turns. Network errors, non-OK responses, server fallback responses, invalid JSON, failed schema retry, and exhaustion fall back to deterministic local triage. Invalid JSON gets one retry. A tool exception is returned as `{ error }` and logged in agent activity. Unhandled failures emit `AGENT_ERROR_LOGGED` and attempt deterministic triage. Freeze or scenario reset supersedes work and returns an ignored decision. Translation failure returns `null`; triage retains the original report text for its summary.

## Dispatch agent

**Implementation:** `src/agents/dispatch.ts`.

**Trigger events:** One initial generation on subscription, then `INCIDENT_CREATED`, `INCIDENT_UPDATED`, `INCIDENT_STATUS_CHANGED`, `VOLUNTEER_REGISTERED`, `VOLUNTEER_UPDATED`, `VOLUNTEER_STATUS_CHANGED`, `RESOURCE_STOCKED`, `RESOURCE_ALLOCATED`, `CREDIBILITY_UPDATED`, `PLAN_REJECTED`, `OFFICIAL_ALERT_RELEASED`, and `ROAD_CLOSURE_REPORTED`. Events are debounced; reset/freeze cancels pending or stale runs.

**Gemini function tool:** `build_plan` is the only declared dispatch function:

```json
{
  "name": "build_plan",
  "parameters": {
    "type": "OBJECT",
    "properties": {
      "strategy": {
        "type": "STRING",
        "enum": ["maximise_coverage", "protect_critical", "minimise_risk"]
      }
    },
    "required": ["strategy"]
  }
}
```

It returns a deterministic `Plan` for the supplied strategy and snapshot. The Gemini loop requests each of the three strategies. Dispatch also exports deterministic TypeScript helpers; these are not separately declared as Gemini tools:

```ts
find_volunteers(
  skill: string,
  near: { x: number; y: number },
  radiusKm: number,
  volunteers?: Record<string, Volunteer>
): Volunteer[]

check_stock(
  type: string,
  depotArea?: string,
  resources?: Record<string, Resource>
): number

estimate_route_time(
  from: { x: number; y: number },
  to: { x: number; y: number },
  mode: 'none' | 'bike' | 'car' | 'boat' | 'foot',
  roadClosures?: RoadClosure[]
): number

build_plan(strategy: DispatchStrategy, snapshot?: DispatchSnapshot): Plan
```

**Output contract:** No separate JSON Schema is defined. The `Plan` TypeScript type has `id`, `assignments` (`volunteerId`, `incidentId`, optional `resourceId` and `qty`), `coverage`, `etaMinutes`, `riskScore`, `probability`, and `status`, plus optional explanation and simulation fields. The `DISPATCH_PLANS_UPDATED` payload is the `DispatchPlansUpdatedPayload` type:

```ts
{
  plans: Plan[];
  changes: Array<{
    strategy: DispatchStrategy;
    added: PlanAssignment[];
    removed: PlanAssignment[];
  }>;
  changeReason: string;
  probabilityChanges: Record<string, number>;
  triggerEventType: string;
}
```

Plan metrics, assignments, and pre-simulation plan weights are computed locally. Probabilities are a softmax over `coverage - riskScore`; they are relative ranking weights, not calibrated success odds. The simulation later updates ranking probabilities.

**Failure behavior:** Gemini is given at most four turns to supply all strategies. Incomplete/duplicate/invalid tool requests, API failure, or a thrown tool request falls back to all three locally built plans. If plan-explanation generation fails or cannot be parsed, fixed deterministic explanations are used. A failure outside those fallbacks emits `AGENT_ERROR_LOGGED`. A frozen/reset/stale run does not publish its result.

## Simulation agent

**Implementation:** `src/agents/simulation.ts` and `src/sim/monteCarlo.ts`.

**Trigger events:** `DISPATCH_PLANS_UPDATED`, `PLAN_CREATED`, `PLAN_SUPERPOSITION_GENERATED`, `SUPERPOSITION_PLANS_BATCH_SET`, `PLANS_SUPERPOSITION_UPDATED`, and `SIMULATION_SEED_UPDATED`. Runs are debounced; the agent evaluates only candidate plans.

**Tools and input contract:** There is no Gemini function tool. The TypeScript simulation function accepts:

```ts
monteCarlo(
  plan: Plan,
  worldState: MonteCarloWorldState,
  trials?: number, // agent supplies 300
  seed?: number    // default seed is 20261028
): MonteCarloResult
```

The simulation runs seeded synthetic worlds and computes arrival/reach outcomes using scenario data, schematic distance, vehicle speeds/delays, synthetic road closures, water-rise assumptions, resource-shortfall assumptions, and severity thresholds.

**Output contract:** No JSON Schema is defined. `SIMULATION_RESULTS_UPDATED` has `{ plans: Array<{ id, simulationMetrics, simulationExplanation, probability }>, seed, trials }`. Each `simulationMetrics` is `MonteCarloResult`:

```ts
{
  trials: number;
  seed: number;
  expectedReached: number;
  worstCase5pct: number;
  confidenceInterval95: { lower: number; upper: number };
  probabilityAllCriticalReached: number;
  outcomes: number[];
  rankScore?: number;
}
```

The `rankScore` is added during plan ranking. The agent runs 300 trials and ranks with normalized expected reach (60%), worst-5% reach (25%), and inverse risk (15%).

**Failure behavior:** Gemini is used only to phrase already-computed figures in up to two sentences. If unavailable, non-OK, empty, or cancelled, a deterministic explanation is used. A simulation exception is logged and emits `AGENT_ERROR_LOGGED`. Results are discarded when the seed, assignments, generation, or kill state changes before publication.

## Comms agent

**Implementation:** `src/agents/comms.ts` and `src/tools/commsValidation.ts`.

**Trigger events:** Only a `PLAN_APPROVED` event whose actor is `human` and whose payload has a plan ID. The plan must still be approved and the system must not be frozen. A reset/freeze cancels generation.

**Tools and input contract:** No function tools or external broadcast tools exist. For each distinct area assigned in the approved plan, the module requests a language object from `/api/gemini/agent`:

```json
{ "en": "string", "hi": "string", "mr": "string" }
```

The prompt requires a calm update, route/shelter placeholder, helpline `1916`, no panic language, and fewer than 280 characters; this is a prompt, not a formal JSON Schema.

**Output contract:** No JSON Schema is defined. The reducer accepts `COMMS_DRAFTS_CREATED` only from `agent:comms`, for an already-approved plan, and only when every draft is valid. Each `CommsDraft` has:

```ts
{
  id: string;
  incidentId: string;
  wardId: string;
  areaName: string;
  disasterType: 'flood' | 'heatwave' | 'compound';
  language: 'en' | 'hi' | 'mr';
  text: string;
  approvedByHuman: false;
  broadcastChannels: ['sms', 'whatsapp'];
}
```

The validator checks non-empty text, fewer than 280 Unicode code points, panic vocabulary, helpline inclusion, expected Latin/Devanagari script, localized update wording, and a route/shelter placeholder. It does not verify the truth of every statement. The UI requires a separate human approval per language message before adding it to the local mock outbox.

**Failure behavior:** A non-OK response, missing/invalid language text, parse error, or API failure uses a fixed template for that language. A thrown draft-generation error is logged and emits `AGENT_ERROR_LOGGED`; cancelled/stale work does not publish drafts. No SMS or WhatsApp API is called.

## Operator and system controls

These are not agents. They are important parts of the event contract:

- `approvePlan(planId)` accepts only an existing candidate while not frozen. It blocks a plan with linked incidents that have no dispatchable report; successful human approval marks that plan approved, discards other candidates, marks assigned volunteers unavailable, changes incidents to assigned, and allocates local stock.
- `rejectPlan(planId, reason)` accepts a candidate and non-empty reason, trims it to 240 characters, and appends the constraint. Dispatch recognizes explicit `avoid volunteer <id>` text; other text remains context and does not have a guaranteed planning effect.
- `approveCommsDraft(draftId)` adds that one human-approved draft to `commsOutbox`. The outbox is only an in-app preview for SMS/WhatsApp.
- `toggleKillSwitch(reason?)` writes `SYSTEM_FROZEN` or `UNFREEZE` as a human action. The store rejects non-operator writes while frozen and requires the authorized operator path to unfreeze.

Reducer and store enforcement are in `src/state/reducer.ts` and `src/state/store.ts`.
