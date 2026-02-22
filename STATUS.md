# Roadway - Project Status

## Current Sprint / Focus Area
- Governance system setup and development workflow improvements

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
- **Linear Integration (Backend)**: OAuth w/ PKCE, team/status mapping, project import, entity linking
- **Users & Permissions (Backend)**: Admin/Editor/Viewer roles, requireRole middleware, role management API
- **Teams**: Workspace-level teams with members, capacity planning, time-off tracking
- **Custom Fields**: Dynamic fields per workspace with card-level values
- **WebSocket Collaboration**: Real-time card updates, cursor sharing, user presence
- **Export/Import**: Roadmap data portability
- **Onboarding**: New user survey and tutorial walkthrough
- **Invites**: Email-based workspace invitations
- **Admin Panel**: User management, stats, roadmap oversight
- **Workspace Settings**: Effort units, custom statuses, status colors, field ordering

## In Progress
- Linear Integration Phase 1 (backend complete, frontend pending product decisions)
- Notion Integration (planning phase — to be discussed)
- Permissions frontend UI (backend complete, UI pending product decisions)

## Known Issues / Bugs
- (None documented yet -- add issues here as discovered)

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
| Production | https://roadway-1sse.onrender.com |

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
| `server/routes/integrations/linear.js` | Linear OAuth, team/status mapping, project import |
| `server/services/api-client.js` | Generic HTTP client with retry, rate limit, backoff |
| `server/services/token-manager.js` | Shared OAuth token refresh for all providers |
| `server/services/linear.js` | Linear GraphQL client, PKCE helpers, data fetchers |
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
| `client/src/pages/RoadmapPage.jsx` | Main roadmap canvas with sprint grid |
| `client/src/pages/RoadmapListPage.jsx` | Roadmap listing/selection |
| `client/src/pages/LensesPage.jsx` | Lens management for feature scoring |
| `client/src/pages/SettingsPage.jsx` | App settings and integrations |
| `client/src/pages/LoginPage.jsx` | Authentication page |
| `client/src/pages/OnboardingPage.jsx` | New user onboarding flow |
| `client/src/pages/AdminPage.jsx` | Admin dashboard |
| `client/src/components/SidePanel.jsx` | Card detail drawer |
| `client/src/components/Sidebar.jsx` | Navigation sidebar |
| `client/src/components/TopBar.jsx` | Top navigation bar |
| `client/src/components/ChatPanel.jsx` | AI chat interface |
| `client/src/components/CommentLayer.jsx` | Canvas comment pins and threads |
| `client/src/components/VersionHistoryPanel.jsx` | Snapshot management |
| `client/src/components/HubSpotMappingModal.jsx` | HubSpot field mapping UI |
| `client/src/components/TutorialOverlay.jsx` | Guided tutorial walkthrough |

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

## Last Updated
2026-02-22
