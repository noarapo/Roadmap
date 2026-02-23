# Technical Memory

## Gotchas

- **MULTI-SPRINT CARD LAYOUT IS FRAGILE**: After ANY change to card rendering, slot layout, spacers, or card heights in RoadmapPage.jsx, you MUST manually verify ALL combinations: (1) multi-sprint card alone in row, (2) multi-sprint + single-sprint in same cell, (3) multiple overlapping multi-sprint cards in same row, (4) multi-sprint cards with tags vs without tags in same row, (5) single-sprint cards in cells that a multi-sprint card passes through. Check for BOTH problems: overlapping cards AND wrong row heights (too big gaps OR too small gaps / no gaps). The overlap detector hook catches overlaps but NOT height/gap bugs. NEVER hardcode card heights separately from the actual card — always enforce the same fixed height on both the spacer AND the card inline style so they can never disagree.
- **Card height calculation**: The app uses `* { box-sizing: border-box }` globally. So `height: Npx` on a `.feature-card` means N includes padding (4+4=8px) and border (1+1=2px). Content area = N - 10. Card content: name 14px + footer-margin 2px + footer 12px = 28px min. With tags: +16px (tag-margin 2 + tags 14). So minimum height: no-tags = 38px, with-tags = 54px. ALWAYS check these values against the CSS when changing card heights.
- Card prop from grid does NOT include custom_fields -- always use getCard() API for full card data
- HubSpot API rate limit: 100 requests per 10 seconds -- use exponential backoff
- Linear API rate limit: 5000 requests per user per hour -- use api-client.js retry logic
- Linear uses GraphQL at https://api.linear.app/graphql -- all queries go through linearGraphQL()
- Linear OAuth requires PKCE (code_verifier/code_challenge with SHA-256)
- Vite HMR resets module-level variables -- do not use refs or module variables for cross-render state
- PostgreSQL parameterized queries use $1/$2 syntax, not ? placeholders
- Custom field values are stored as strings in the database -- always String() before saving
- workspace_id isolation is required on every database query -- never query without it
- JWT tokens must never be exposed in frontend API responses (only in auth endpoints)
- The settings.local.json is per-machine (not committed); settings.json is project-level (committed)
- `getLinearTeams` API returns `{ linear_teams: [...], roadway_teams: [...] }` — NOT a plain array. Extract `data?.linear_teams` before setting state.
- Linear `issueCreate` mutation requires teamId even though teams aren't mandatory in Linear UI — auto-select the first team as a sensible default
- Integration issues query must use LEFT JOIN on integration_entity_links (not INNER JOIN) — link_id can be NULL for cards imported via source_integration_id
- `gh` CLI is not installed on this dev machine — create PRs via GitHub web UI instead

## Workflow Patterns

- Fire-and-forget pattern for UI responsiveness: update local state immediately, then await API call
- snake_case (API/DB) <-> camelCase (frontend) mapping happens in api.js mappers
- All styles in single file: client/src/styles/index.css -- use CSS custom properties for theming
- WebSocket broadcasts exclude the sender (excludeWs parameter)
- Module-level caching pattern: `_cache`, `_cacheTime` variables with TTL check (used for HubSpot records, Linear integration/teams — 5 min TTL)
- SidePanel tabs: `activeTab` state controls which tab renders. Reset to "details" on card change. Tab bar only renders when Linear integration is connected.
- Actions menu import options: conditionally rendered based on `connectedIntegrations` array loaded on mount via `getIntegrations()`

## Evolver Experiment
- **What**: Evolver (github.com/eranshir/evolver) is an autonomous project evolution engine — Rust-based, uses competing AI agents to propose/test/merge improvements in evolutionary generations
- **Branch**: `claude/evolver-experiment` — ALL evolver changes isolated here. If we don't like results, delete branch, zero impact.
- **Safety**: Evolver itself uses git worktrees for isolation (never touches main branch). Our branch adds a second layer of safety.
- **Config**: `.evolver/config.toml` in project root. Uses ANTHROPIC_API_KEY. Runs on port 3742.
- **Cost**: ~$5/generation default cap. Monitor spend.
- **How to revert**: `git branch -D claude/evolver-experiment` — done, everything gone.

## Architecture Decisions

- Single CSS file chosen over CSS modules for simplicity and global theming
- PostgreSQL over SQLite for production (Render hosting)
- JWT in localStorage (not cookies) for simplicity with SPA
- Workspace-scoped data model for multi-tenant isolation
- Express serves both API and static frontend in production
- Integrations refactored from monolithic integrations.js to modular integrations/ directory (index, shared, hubspot, linear, notion)
- requireRole() middleware checks DB (not JWT) for current role -- prevents stale role in JWT
- Roles: admin (full access), editor (create/edit), viewer (read-only) -- per workspace
- Generic integration tables (integration_entity_links, integration_issues, etc.) alongside legacy hubspot_card_links
- Token manager handles OAuth refresh for all providers via PROVIDER_CONFIGS
- SidePanel uses tab architecture: Details tab (default) + Linear tab (when integration connected). Tab bar renders between header and content area.
- Landing page is static HTML/CSS in `landing/` directory — no build step, no dev server. Open index.html directly to preview.

## Notion Integration Plan
- Full plan at `.claude/plans/snuggly-sprouting-gem.md` (approved by user)
- Mirrors HubSpot enrichment pattern: discover schema → AI suggest mappings → user configures → bulk enrich
- 9 phases: Foundation → Settings UI → Enrichment backend → Enrichment UI → Import backend → Import UI → Page linking → AI context → Styles
- Backend is ~80% complete (OAuth, service layer, basic endpoints). Frontend not started.
- Key tables: `notion_card_links` (new), `custom_fields` with `source='notion'`, `integration_schema_cache`
- Notion tokens never expire (no refresh flow needed, unlike HubSpot)
