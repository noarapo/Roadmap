# Roadway

Real-time multiplayer roadmap planning tool.

## NON-NEGOTIABLE: No Product Decisions Without User Approval

**EVERY agent, assistant, and tool MUST follow this rule without exception:**

No product decision — no matter how small — is made without explicit user approval. This includes but is not limited to:
- Adding, removing, or changing any UI element (buttons, text, layout, styling)
- Changing any user-facing behavior or flow
- Adding or removing features, states, or interactions
- Changing default values, text content, positioning, or visual design
- Making "improvements" or "cleanups" that affect what the user sees or experiences

**What to do instead:**
- Present options and wait for the user to choose
- If something needs a decision, ASK — do not assume
- If a task requires changes beyond what was explicitly requested, STOP and ask
- Never add extras, "nice to haves," or "while I'm here" changes

**This applies to ALL agents:** fullstack-executor, ux-designer, junior-pm, ux-qa-auditor, and the main assistant. No exceptions.

## Tech Stack

- **Frontend:** React 18 + Vite (port 5173)
- **Backend:** Express.js + SQLite via better-sqlite3 (port 3001)
- **Real-time:** WebSocket (ws) for collaborative editing
- **Icons:** Lucide React
- **Auth:** JWT + bcryptjs

## Project Structure

```
client/
  src/
    pages/          # Page components (RoadmapPage, LensesPage, SettingsPage, LoginPage, OnboardingPage)
    components/     # Shared components (Sidebar, TopBar, SidePanel, VersionHistoryPanel, NumberStepper)
    hooks/          # useStore (global context)
    services/       # api.js (all API calls)
    styles/         # index.css (all styles in one file)
    App.jsx         # Layout wrapper (Sidebar + TopBar + Outlet)
    main.jsx        # Router configuration
server/
  index.js          # Express server + WebSocket setup
  models/           # SQLite database
  routes/           # API route handlers (auth, roadmaps, cards, teams, lenses, tags, snapshots, comments)
```

## Commands

- `npm run dev` — Start both Vite dev server and Express backend
- `npm run build` — Build client for production
- `npm start` — Run production server

## Current Pages

- `/roadmap/:id` — Main roadmap canvas with sprint grid, feature cards, side panel
- `/lenses` — Lens management for scoring features
- `/settings` — App settings
- `/login`, `/signup` — Authentication
- `/onboarding` — New user onboarding flow
