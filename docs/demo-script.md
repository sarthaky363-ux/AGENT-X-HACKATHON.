# Three-minute demo script

The script uses the current React control-room UI and seeded local scenario. It does not require Gemini; if the key is absent or a request fails, deterministic plans/templates remain available. No action in this demo contacts responders or sends a public message.

| Time | On-screen action | Narration |
|---|---|---|
| **0:00–0:20** | Show the top-bar state version, agent roster, map, and dispatch lattice. | “ENTANGLE is a simulated Mumbai disaster coordination desk. Reports, incidents, responders, candidate plans, and operator actions share one event-backed WorldState. The map and feeds are demo data.” |
| **0:20–0:40** | Open **Reports**, then **Timeline**; expand an event if useful. | “Reports and official alerts become events. The credibility module uses deterministic rules, not a chatbot, and changed credibility can trigger triage and dispatch to reconsider.” |
| **0:40–1:05** | Open **Inject Report (8 Scenarios)**; inject a report about a rumor or local flooding. Return to the incident/timeline view and show activity as it appears. | “A report enters the same state pipeline. Triage can call typed tools for nearby reports, deterministic priority, translation, merging, or incident creation. If Gemini is unavailable, the local fallback handles the demo.” |
| **1:05–1:25** | Point to the three strategies in **Dispatch plan lattice** and their assignments/metrics. | “Dispatch keeps three alternatives: maximise coverage, protect critical incidents, and minimise risk. The calculations use this prototype’s schematic routes, demo inventory, and deterministic rules—not live traffic or real fleet data.” |
| **1:25–1:50** | Click **Run scenario** and set speed to **4x**. While it runs, show the timeline/official alert feed; let the schedule finish (about 23 seconds at 4x). | “This reproducible 90-second scenario resets to a baseline and replays 14 events: reports, two official alerts, a road closure, a boat stock-out, and a Powai rumor followed by a field report. The speed control changes playback, not the scenario ordering.” |
| **1:50–2:10** | Return to the lattice. Show a simulation summary, **Compare plans**, or **Explain this decision**. | “The simulation runs 300 seeded synthetic trials. Its numeric results are computed in TypeScript; the displayed probability is a relative ranking weight, not a guarantee or validated forecast.” |
| **2:10–2:30** | Select a candidate and click **Approve**. Show the approved state, then the Comms review if drafts have arrived. | “The operator—not an agent—chooses a plan. Approval changes only the local simulation state: assignments, incident status, and resource allocation. It does not dispatch a real unit.” |
| **2:30–2:45** | Approve one language draft in the Comms board and point to **Mock outbox**. | “Comms runs only after plan approval. Each language needs its own approval, and the outbox is a local preview for SMS and WhatsApp; nothing is sent.” |
| **2:45–3:00** | Click **Kill Switch**, confirm, show frozen banner; do not resume unless time permits. | “The kill switch blocks event writes while frozen; an operator must explicitly resume. This is a hackathon prototype with simulated data, no real feeds, and no external action integrations.” |

## Timing notes

- At 1x the scenario takes 90 seconds; at 2x, 45 seconds; at 4x, approximately 22.5 seconds. The demo reserves about 25 seconds for it.
- If an LLM call is slow, continue with the structured local metrics and deterministic fallbacks. Do not present model-generated prose as a verified fact.
- If draft generation has not completed by 2:30, show the Comms board after it appears or explain that drafts are post-approval and can take a moment. Do not imply that a message was transmitted.
