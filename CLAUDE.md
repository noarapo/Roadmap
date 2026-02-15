# Roadway

Real-time multiplayer roadmap planning tool.

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
