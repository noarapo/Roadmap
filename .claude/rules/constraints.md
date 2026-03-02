# Technical Constraints

These constraints are auto-loaded during editing sessions. Follow them strictly.

## Data Access
- Card prop from grid does NOT include custom_fields -- always use `getCard()` for full card data
- Always use `workspace_id` isolation on every database query -- never query without it
- Custom field values are stored as strings -- always `String()` before saving
- PostgreSQL uses `$1`/`$2` parameterized queries, not `?` placeholders

## Integration
- HubSpot rate limit: 100 requests per 10 seconds -- use exponential backoff
- Integration tokens are AES-256 encrypted -- use ENCRYPTION_KEY env var for encrypt/decrypt

## Frontend
- Module-level caches reset on Vite HMR -- do not use refs for cross-render state
- Styles go in `client/src/styles/` -- one file per feature, imported via index.css barrel
- snake_case (API) <-> camelCase (frontend) mapping happens in `api.js` mappers

## Quality Assurance
- Never show work to the user without QA testing it first -- run build, run tests, verify the feature works
- Enriched/calculated custom fields MUST include `source` and `source_property` from the custom_fields table -- without these the UI cannot display enrichment indicators
- When modifying card detail queries, always verify custom_fields JOIN includes cf.source and cf.source_property

## Security
- JWT tokens: never expose in frontend API responses (except auth endpoints)
- All SQL must use parameterized queries -- never string concatenation
- Never commit `.env` files or secrets
