# Roadway - Project Status

## Current Sprint / Focus Area
- Integration UX improvements (Linear drawer tab, import menu)
- Landing page marketing rewrite
- Notion integration (plan complete, implementation started)

## Completed Features
- **Authentication**: JWT + bcryptjs + Google OAuth login/signup
- **Roadmap Grid**: Sprint-based grid layout with rows (team lanes) and columns (sprints)
- **Feature Cards**: Create, edit, move, reorder cards with drag-and-drop
- **Sprints**: Bulk generate, edit, delete sprints with date ranges
- **Lenses**: Scoring system for feature prioritization with AI-powered perspectives
- **Tags**: Workspace-level tags with color coding, assignable to cards
- **Snapshots**: Version history with save/restore capability
- **Comments**: Canvas-anchored comments with threads, reactions, and resolution
- **AI Chat**: Conversational AI assistant (Claude/Gemini) with roadmap context
- **HubSpot Integration**: OAuth connect, schema discovery, field mapping, card enrichment
- **Linear Integration**: OAuth w/ PKCE, team/status mapping, project import, entity linking, push-to-Linear, live progress tracking
- **Notion Integration**: OAuth, data enrichment, import, page linking, AI context (backend complete)
- **Users & Permissions**: Admin/Editor/Viewer roles, requireRole middleware, role management API
- **Teams**: Workspace-level teams with members, capacity planning, time-off tracking
- **Custom Fields**: Dynamic fields per workspace with card-level values
- **WebSocket Collaboration**: Real-time card updates, cursor sharing, user presence
- **Export/Import**: Roadmap data portability
- **Onboarding**: New user survey and tutorial walkthrough
- **Invites**: Email-based workspace invitations
- **Admin Panel**: User management, stats, roadmap oversight
- **Workspace Settings**: Effort units, custom statuses, status colors, field ordering
- **Privacy Policy + Terms of Use**: Static pages at /privacy and /terms

## Recently Completed (This Session — 2026-02-23)

### Linear Tab in SidePanel Drawer
- Added tab bar to SidePanel (Details | Linear) — shows when Linear integration is connected
- **Linked cards**: Progress bar showing % complete, issue list with status icons (done/active/todo)
- **Unlinked cards**: "Push to Linear" flow — auto-selects team if only one, dropdown if multiple
- Backend: `GET /api/integrations/cards/:cardId/linear-issues` endpoint with LEFT JOIN fix
- Backend: `POST /api/integrations/linear/:id/push-card` — creates Linear issue via GraphQL, stores entity link
- Service: `createIssue()` added to `server/services/linear.js` (GraphQL `issueCreate` mutation)
- Module-level caching for Linear integration data and teams (5-minute TTL)

### Import Menu in Actions Dropdown
- Added conditional import options to RoadmapPage Actions menu based on connected integrations
- "Import from Linear" → opens LinearSetupWizard modal
- "Import from Notion" → opens NotionImportWizard modal
- "Enrich from HubSpot" → opens HubSpotMappingModal
- "Upload File" always available
- Added `dropdown-section-label` CSS for "Import" header

### HubSpot Fixes
- Fixed ARR enrichment data integrity bugs
- Fixed entity links LEFT JOIN for integration issues query
- Fixed field source tracking for enrichment indicators

### Landing Page Rewrite
- Full marketing overhaul of `landing/index.html` and `landing/style.css`
- Updated meta tags, OG tags, structured data with all 16 features
- New sections: Social proof, Integrations strip (HubSpot/Linear/Notion cards), AI chat demo, CRM enrichment showcase, Linear progress demo, 6-card features grid, mid-page CTA, capabilities checklist (12 items)
- Fully responsive CSS (desktop → tablet 1024px → mobile 768px)

## In Progress
- Notion Integration frontend (plan approved — see `.claude/plans/snuggly-sprouting-gem.md`)
- **PR pending merge**: `claude/dev` → `claude/roadmap-planning-tool-oqAnO` — "Linear drawer tab, import menu, landing page rewrite"

## Pending (Next Up)
- Fix Linear & Notion import: cards not assigned to correct sprints (CRITICAL)
- Notion frontend: MappingModal, ImportWizard, SidePanel section, Settings page card
- Landing page dev server (no hot-reload setup currently — static files only)
- Redesign card drawer integration sections (UX overhaul)

## Known Issues / Bugs
- `gh` CLI not installed on dev machine — PRs must be created manually via GitHub web UI
- Landing page has no dev server — open `landing/index.html` directly in browser to preview
- Linear teams loading can be slow on first load (cached after first fetch, 5-min TTL)

## Technology Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite (port 5173) |
| Backend | Express.js (port 3001) |
| Database | PostgreSQL via pg |
| Real-time | WebSocket (ws) |
| Auth | JWT + bcryptjs + Google OAuth |
| Icons | Lucide React |
| AI | Anthropic Claude, Google Gemini |
| Hosting | Render (web service + PostgreSQL) |
| Production | https://app.roadway-ai.com |

## Key File Inventory

### Server
| File | Purpose |
|------|---------|
| `server/index.js` | Express server, WebSocket setup, rate limiting, CORS |
| `server/models/db.js` | PostgreSQL connection pool, schema initialization, migrations |
| `server/routes/auth.js` | Login, signup, Google OAuth, JWT token generation |
| `server/routes/roadmaps.js` | CRUD for roadmaps, rows, capacity calculation |
| `server/routes/cards.js` | CRUD for cards, positioning, dependencies, teams, custom fields |
| `server/routes/sprints.js` | Sprint CRUD and bulk generation |
| `server/routes/lenses.js` | Lens CRUD and scoring perspectives |
| `server/routes/tags.js` | Tag CRUD and card-tag associations |
| `server/routes/comments.js` | Canvas comments, threads, reactions, resolution |
| `server/routes/snapshots.js` | Version snapshots save/restore |
| `server/routes/chat.js` | AI chat with Claude/Gemini, conversation management |
| `server/routes/integrations/index.js` | Shared integration endpoints, mounts sub-routers |
| `server/routes/integrations/shared.js` | Shared helpers (getIntegration, upsertEntityLink, etc.) |
| `server/routes/integrations/hubspot.js` | HubSpot OAuth, schema discovery, field mapping, enrichment |
| `server/routes/integrations/linear.js` | Linear OAuth, team/status mapping, project import, push-to-Linear |
| `server/routes/integrations/notion.js` | Notion OAuth, enrichment, import, page linking, AI context |
| `server/services/api-client.js` | Generic HTTP client with retry, rate limit, backoff |
| `server/services/token-manager.js` | Shared OAuth token refresh for all providers |
| `server/services/linear.js` | Linear GraphQL client, PKCE helpers, data fetchers, createIssue |
| `server/services/hubspot.js` | HubSpot API client, deal aggregation, schema helpers |
| `server/services/notion.js` | Notion API client, database querying, aggregation |
| `server/routes/teams.js` | Team CRUD, members, time-off, capacity |
| `server/routes/custom-fields.js` | Custom field definitions and values |
| `server/routes/admin.js` | Admin stats, user management |
| `server/routes/invites.js` | Workspace invitation system |
| `server/routes/onboarding.js` | New user onboarding survey |
| `server/routes/workspace-settings.js` | Workspace configuration |

### Client
| File | Purpose |
|------|---------|
| `client/src/main.jsx` | Router configuration, app entry point |
| `client/src/App.jsx` | Layout wrapper (Sidebar + TopBar + Outlet) |
| `client/src/services/api.js` | All API calls, data mapping (snake_case <-> camelCase) |
| `client/src/hooks/useStore.jsx` | Global state context (auth, roadmaps, cards, UI state) |
| `client/src/styles/index.css` | All application styles in single file |
| `client/src/pages/RoadmapPage.jsx` | Main roadmap canvas with sprint grid, Actions menu with imports |
| `client/src/pages/RoadmapListPage.jsx` | Roadmap listing/selection |
| `client/src/pages/LensesPage.jsx` | Lens management for feature scoring |
| `client/src/pages/SettingsPage.jsx` | App settings and integrations |
| `client/src/pages/LoginPage.jsx` | Authentication page |
| `client/src/pages/OnboardingPage.jsx` | New user onboarding flow |
| `client/src/pages/AdminPage.jsx` | Admin dashboard |
| `client/src/components/SidePanel.jsx` | Card detail drawer with Details/Linear tabs |
| `client/src/components/Sidebar.jsx` | Navigation sidebar |
| `client/src/components/TopBar.jsx` | Top navigation bar |
| `client/src/components/ChatPanel.jsx` | AI chat interface |
| `client/src/components/CommentLayer.jsx` | Canvas comment pins and threads |
| `client/src/components/VersionHistoryPanel.jsx` | Snapshot management |
| `client/src/components/HubSpotMappingModal.jsx` | HubSpot field mapping UI |
| `client/src/components/LinearSetupWizard.jsx` | Linear import wizard |
| `client/src/components/NotionImportWizard.jsx` | Notion import wizard |
| `client/src/components/TutorialOverlay.jsx` | Guided tutorial walkthrough |

### Landing Page
| File | Purpose |
|------|---------|
| `landing/index.html` | Marketing landing page (fully rewritten with integration showcases) |
| `landing/style.css` | Landing page styles (responsive, all sections styled) |

### Configuration
| File | Purpose |
|------|---------|
| `CLAUDE.md` | Development rules, branch strategy, project structure |
| `STATUS.md` | This file -- project state dashboard |
| `PRD.md` | Product requirements document |
| `TECH_SPEC.md` | Technical specification |
| `.claude/memory.md` | Technical gotchas and architecture decisions |
| `.claude/rules/constraints.md` | Auto-loaded technical constraints |
| `.claude/settings.json` | Claude Code hooks and configuration |
| `.claude/plans/snuggly-sprouting-gem.md` | Notion integration implementation plan (approved) |

## Last Updated
2026-02-23
