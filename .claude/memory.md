# Technical Memory

## Gotchas

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

## Workflow Patterns

- Fire-and-forget pattern for UI responsiveness: update local state immediately, then await API call
- snake_case (API/DB) <-> camelCase (frontend) mapping happens in api.js mappers
- All styles in single file: client/src/styles/index.css -- use CSS custom properties for theming
- WebSocket broadcasts exclude the sender (excludeWs parameter)

## Architecture Decisions

- Single CSS file chosen over CSS modules for simplicity and global theming
- PostgreSQL over SQLite for production (Render hosting)
- JWT in localStorage (not cookies) for simplicity with SPA
- Workspace-scoped data model for multi-tenant isolation
- Express serves both API and static frontend in production
- Integrations refactored from monolithic integrations.js to modular integrations/ directory (index, shared, hubspot, linear)
- requireRole() middleware checks DB (not JWT) for current role -- prevents stale role in JWT
- Roles: admin (full access), editor (create/edit), viewer (read-only) -- per workspace
- Generic integration tables (integration_entity_links, integration_issues, etc.) alongside legacy hubspot_card_links
- Token manager handles OAuth refresh for all providers via PROVIDER_CONFIGS
