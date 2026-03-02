# Roadway

Real-time multiplayer roadmap planning tool.

## NON-NEGOTIABLE: Deployment & Branch Rules

**IRON RULE: Claude NEVER merges to production. Only the user (Noa) can merge to production.**

### Branch Strategy
- **`claude/roadway-app-setup-6wZ2p`** = production branch. Render auto-deploys from this branch. PROTECTED.
- **`claude/dev`** = development branch. Claude works here.
- PRs go from `claude/dev` → `claude/roadway-app-setup-6wZ2p`

### Deployment Procedure
1. Claude works on `claude/dev` and pushes commits there
2. When ready, Claude creates a **Pull Request** from `claude/dev` → `claude/roadway-app-setup-6wZ2p`
3. **Noa reviews and merges** the PR on GitHub — this triggers production deploy
4. Claude NEVER pushes directly to `claude/roadway-app-setup-6wZ2p`

### What Claude Must NOT Do
- Push directly to the production branch (`claude/roadway-app-setup-6wZ2p`)
- Merge any branch into the production branch
- Force push to any branch
- Skip PR review process
- Deploy to production in any way

### What Claude CAN Do
- Push to `claude/dev`
- Create Pull Requests targeting `claude/roadway-app-setup-6wZ2p`
- Run builds and tests on `claude/dev`

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
- **Backend:** Express.js + PostgreSQL via pg (port 3001)
- **Real-time:** WebSocket (ws) for collaborative editing
- **Icons:** Lucide React
- **Auth:** JWT + bcryptjs + Google OAuth (google-auth-library)
- **Hosting:** Render (web service + PostgreSQL database)
- **Production Domain:** `app.roadway-ai.com` / `roadway-ai.com`
- **Production URL:** https://app.roadway-ai.com

## Project Structure

```
client/
  src/
    pages/          # Page components (RoadmapPage, LensesPage, SettingsPage, LoginPage, OnboardingPage)
    components/     # Shared components (Sidebar, TopBar, SidePanel, VersionHistoryPanel, NumberStepper)
    hooks/          # useStore (global context)
    services/       # api.js (all API calls)
    styles/         # Feature-based CSS files imported via index.css barrel
    App.jsx         # Layout wrapper (Sidebar + TopBar + Outlet)
    main.jsx        # Router configuration
server/
  index.js          # Express server + WebSocket setup
  models/           # PostgreSQL database (db.js)
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

## Governance Documentation

The following documents form the project's governance layer. Keep them current.

- **`STATUS.md`** — Project state dashboard (sprint focus, completed features, known issues, file inventory)
- **`.claude/memory.md`** — Technical gotchas, workflow patterns, architecture decisions (keep under 200 lines)
- **`PRD.md`** — Product requirements document with acceptance criteria and priority levels
- **`TECH_SPEC.md`** — Technical specification (architecture, data model, API contracts, security)
- **`.claude/rules/constraints.md`** — Auto-loaded technical constraints for editing sessions

### Session Workflow
- **After every work session**, update `STATUS.md` with current state
- **Before committing**, run the review process (check hooks, verify no secrets, confirm scope)

## NON-NEGOTIABLE: Domain & URL Rules

**The production domain is `app.roadway-ai.com` / `roadway-ai.com`. NEVER use or reference the Render subdomain (`roadway-1sse.onrender.com`).**

- When setting redirect URIs, callback URLs, or any external-facing URLs: use `https://app.roadway-ai.com`
- When mentioning the app URL to the user or in code: use `https://app.roadway-ai.com`
- NEVER suggest, reference, or output the Render subdomain — it is internal infrastructure only
- OAuth redirect URIs in production: `https://app.roadway-ai.com/api/integrations/{provider}/callback`

## Learning Log

<!-- Record recurring mistakes and their fixes here to avoid repeating them -->
<!-- Format: [Date] Issue: ... Fix: ... -->
- [2026-02-22] Issue: Suggested Render subdomain URLs instead of the real domain. Fix: ALWAYS use app.roadway-ai.com / roadway-ai.com. NEVER reference the Render subdomain.
