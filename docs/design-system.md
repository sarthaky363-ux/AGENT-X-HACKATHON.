# ENTANGLE design system: Clay & Sage

This guide describes the tokens and recurring UI patterns present in `src/theme/tokens.ts`, `src/index.css`, and `src/ui`. The interface is a prototype; these notes are not an accessibility conformance claim.

## Design intent

The UI uses a warm paper-like canvas, dark brown ink, sage actions, and deep-teal agent accents. It favors cards, compact operational telemetry, and plain-language decision explanations over a dark, alarm-heavy dashboard. Severity and agent status should remain understandable without color.

## Tokens

### Colors

| Token | Value | Current role |
|---|---|---|
| `canvas` | `#FAF6EE` | Page background |
| `surface` | `#FFFDF8` | Cards and panels |
| `surfaceSunken` | `#F2EBDD` | Recessed surfaces and input backgrounds |
| `border` | `#E4D9C5` | Borders and dividers |
| `ink` | `#3A2E26` | Primary text |
| `inkMuted` | `#7A6A5A` | Supporting text and labels |
| `primary` / `primaryHover` | `#5F7A61` / `#4D664F` | Sage actions and selection |
| `agent` / `agentHover` | `#4F7C82` / `#3F656A` | Agent accents and focus rings |
| `clay` / `clayHover` | `#B0623A` / `#98532F` | Editorial/civic accent |
| `kill` / `killHover` | `#9E2F22` / `#84261B` | Freeze control |

Severity tokens are defined as:

| Level | Base | Tint | Text |
|---|---|---|---|
| Critical | `#B8412F` | `#F6DDD6` | `#7A1C0E` |
| High | `#C77A24` | `#F8E6CC` | `#844B0B` |
| Medium | `#B89A2E` | `#F5EBC4` | `#705C11` |
| Low | `#6E8F6A` | `#E3EDDF` | `#3D5939` |

Agent status colors: idle `#7A6A5A`, thinking `#4F7C82`, waiting `#C77A24`, frozen `#9E2F22` in the token object. The current `AgentChip` renders frozen as neutral grey (`#8A8A86` dot, `#E8E6E0` background, `#66645F` text), which is the more informative visible state treatment.

### Type, shape, spacing, elevation

- Headings: `"Inter Tight", sans-serif`; body: `"Inter", sans-serif`; telemetry: `"JetBrains Mono", monospace`.
- Token radii: card `20px`, pill `9999px`, subtle `12px`, input `14px`. Current cards use `20px`; pills are used for buttons and badges; local controls also use smaller `rounded-lg`/`rounded-xl` corners.
- Spacing tokens: `4`, `8`, `12`, `16`, `24`, `32`, and `48px`.
- Card shadows: `0 1px 2px rgba(58, 46, 38, 0.06)`; hover cards may use `0 4px 12px rgba(58, 46, 38, 0.08)`; dialogs use stronger elevation.
- The body uses the canvas/ink colors and antialiased body font. `html.demo-mode` increases the root font size to `17px`.

## Components and states

| Component | Pattern in current source |
|---|---|
| `Button` | `primary`, `secondary`, `ghost`, `danger`; sizes `sm`, `md`, `lg`; pill shape; minimum height 44px (48px for `lg`); visible teal focus ring; disabled opacity/cursor; optional icons/loading. |
| `Card` | Surface/sunken/canvas variants, 1px border, 20px radius, soft shadow; optional hover lift; composable header/title/description/content/footer. |
| `SeverityBadge` | Severity tint, matching border/text, icon, and uppercase text label. `showIcon` can hide the icon but the text label remains; do not make color the only signal. |
| `AgentChip` | Name, role description, and text status (Idle, Thinking, Waiting for Human, Frozen) plus a status dot. Frozen uses neutral grey styling. |
| `StatBlock` | Large number, uppercase monospace label, optional subtext/trend; `card`, `inline`, and `hero` variants. |
| `PlanLattice` | Three strategy candidates, relative probability ring, coverage/ETA/risk, assignment list, simulation summaries, plan comparison, decision trace, approve/reject actions, and outcome-distribution dialog. |
| `CommsBoard` | Area-by-language draft table and a local mock outbox. Each message has an individual approval button. |
| `TimelineItem` / `AgentActivityItem` | Event or tool-call summary with expandable structured payload/details. |
| `Toast` | `info`, `success`, `warning`, `error`; icon and border reinforce its text. Uses `role="alert"`. |
| `EmptyState` | Calm explanatory placeholder with an icon and optional action. |

Operational states are idle, thinking, waiting for human approval, and frozen. Plan states include candidate, approved, rejected, executed, superposition, and discarded. Comms drafts begin unapproved and enter the mock outbox only after a human action. Disabled actions should remain visibly disabled and explain why where possible.

## Accessibility notes

- **Severity is never communicated by color alone.** Keep the visible severity word and, by default, its distinct icon; retain textual severity in accessible names when rendering map markers or compact views.
- **Contrast:** The repository has no automated contrast checker. Test actual foreground/background pairs against WCAG AA (4.5:1 for normal text and 3:1 for large text and relevant non-text controls). Pay particular attention to muted `#7A6A5A`, small monospace labels, disabled text, tint surfaces, and hover/selected states. Do not infer compliance from the palette's intent.
- **Keyboard focus:** The shared `Button` has a 2px deep-teal focus ring with an offset. Several form controls and `AgentChip` also set focus styles, but some bespoke buttons/inputs do not. Prefer the shared component or add a clearly visible `:focus-visible` treatment; verify tab order and keyboard activation. `AgentChip` uses `role="button"`/`tabIndex` when clickable but currently does not implement Enter/Space activation.
- **Labels and announcements:** Associate visible `<label>` elements with inputs; provide accessible names for icon-only buttons; use status text alongside animated dots; preserve `aria-expanded`, dialog labels, `aria-live`, and `lang="en" | "hi" | "mr"` where present.
- **Motion:** Pulsing/pinging indicators and animated transitions are used. Keep status text present and honor reduced-motion preferences when adding or extending animation.
- **Targets and small text:** The reusable `Button` meets the component's 44px minimum-height rule, but many bespoke controls and compact plan actions are smaller. Check touch targets and text legibility at real display sizes; do not assume every clickable element meets the same minimum.
- **Dialogs:** Keep an accessible name, `aria-modal`, keyboard escape/close behavior, and sensible focus entry/return. Current modal patterns provide dialog labels, but focus trapping/return should be verified before operational use.

## Source of truth

`src/theme/tokens.ts` contains the token object; `src/index.css` duplicates primary values as Tailwind theme variables; several components use literal Tailwind colors directly. When changing a token, check all three locations/patterns so the rendered UI stays consistent.
