# Control-room demo runbook

This is the short operator-oriented entry point. For install and production-server commands, see [Run locally in the README](../README.md#run-locally). For the timed walkthrough, see the [three-minute demo script](demo-script.md).

## Start the application

```sh
bun install
bun run dev
```

Alternatively, use `npm install` and `npm run dev`. The app runs without a Gemini key using local deterministic behavior and fixed message templates. To enable Gemini-backed functions and explanations, provide `GEMINI_API_KEY` in a local `.env`; never commit that file or its contents.

## Operator sequence

1. Start **Run scenario** in the top bar. The control resets the demo state and replays its 14 scheduled events over 90 simulated seconds. Use 1x, 2x, or 4x, or pause/resume.
2. Inspect **Map (Schematic)**, **Incident Queue**, **Reports**, and **Timeline**. Inject a preset or typed/spoken report with **Inject Report (8 Scenarios)** if you want to exercise triage immediately.
3. Review the three strategies and simulated results in **Dispatch plan lattice**. Use **Compare plans** or **Explain this decision** to inspect alternatives and the event-backed decision trace.
4. Select a candidate and choose **Approve** or **Reject with reason**. Approval changes local assignment state; it does not dispatch a real responder.
5. If drafts appear, review them in **Comms Agent · operator review**. Approve only the individual draft you want to add to the local mock outbox. No SMS or WhatsApp message is transmitted.
6. Use **Kill Switch** and confirm to freeze the store; use **Resume** and confirm when ready to let agents react to future events again.

## Keep the demo claims accurate

- The scenario is synthetic and repeatable; the map, inventory, alerts, and reports are not live operational data.
- Simulation uses 300 seeded synthetic trials. It is not a validated forecast.
- Plan weights are heuristic ranking values, not calibrated success probabilities.
- Approval and the outbox are local UI state. No field units or public messaging channels are connected.
- Model-generated explanations are supplementary; use structured metrics and source events as the authoritative demo outputs.
