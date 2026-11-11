# Importing and publishing ENTANGLE with AI Studio

Follow these steps to publish the demo from the feature branch. This process does not turn the prototype into an emergency-response service.

1. **Push the feature branch to GitHub.** Review the changed files and confirm that `.env`, generated bundles, `node_modules`, and credentials are not included. Do not push until the repository owner authorizes it.
2. **Import from GitHub.** In AI Studio, choose the GitHub import option, select `sarthaky363-ux/entangle-app`, and choose the intended branch. Confirm the repository root contains `package.json`, `package-lock.json`, `vite.config.ts`, and `server.ts`.
3. **Resolve dependency or build errors.** Use the documented Node runtime, run `npm ci`, then `npm run build`. Keep the committed lockfile authoritative; do not work around peer-dependency errors with `--force` or `--legacy-peer-deps`.
4. **Configure the optional secret.** If Gemini-backed text is desired, add `GEMINI_API_KEY` only as a server-side secret in the hosting environment. Never add it to source files, frontend-prefixed variables, a public build artifact, or a ZIP. The app still runs without the key using deterministic/fixed fallbacks.
5. **Walk through the demo.** Start the scenario, inspect Reports and the Quantum Lab, review candidate plans, make any plan approval/rejection yourself, then review and individually approve any mock communications. Use the Director mode to see the approval pause and audit verification. No action contacts responders or sends a message.
6. **Share or deploy cautiously.** Label the result a demonstration prototype. Inputs, alerts, routes, inventories, and predictions are not operationally validated. The optional Gemini endpoint has an in-memory limit of about 20 requests per IP per minute, a 50 KB request-body limit, and a five-second timeout; these controls are not a substitute for production authentication, durable distributed rate limiting, monitoring, or abuse prevention.
7. **Test in a private window.** Open the deployed app in a private/incognito window, verify it loads without a stored session, check graceful behavior without a Gemini key, review the live/cached/seeded weather badge, test offline shell behavior after the first visit, and confirm microphone permission is requested only when voice capture is used. Inspect the built output and downloaded artifact for secrets before sharing.

## What remains a demo

Quantum-inspired calculations are classical and advisory. The event chain is in-memory, weather is a public precipitation feed rather than an official alert, routes are schematic, SMS/WhatsApp are mock previews, and human approval remains required. Do not rely on this app for real-world emergency coordination.
