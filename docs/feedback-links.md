# Feedback links

Settings → Feedback has a compact **Copy link** action for every written item and
shared Milo answer. Paste that link into a GitHub issue or a message to
Grayscale. It identifies the environment, opens the exact inbox sheet for a
signed-in feedback manager, and carries no credentials.

On the box, use the CLI against one feedback link at a time:

```sh
pnpm feedback show '<feedback-url>'
pnpm feedback link '<feedback-url>' --issue 'https://github.com/grayscale-development/canopy-hub/issues/123'
pnpm feedback status '<feedback-url>' --set resolved
```

The CLI gets production and staging service credentials only from their named
environment variables. Localhost URLs use the local Supabase service role on
the machine running the local stack. Unknown hosts require an explicit
`--env dev|staging|prod`; staging fails closed when its credentials are absent.
Neither the CLI nor this document prints or stores credentials.

Automated `resolved` and `verified` changes also require a non-secret service
actor UUID from the target Supabase project's `auth.users`: use
`CANOPY_PROD_FEEDBACK_SYNC_ACTOR_ID` or
`CANOPY_STAGING_FEEDBACK_SYNC_ACTOR_ID` for the CLI, and
`FEEDBACK_SYNC_ACTOR_ID` for a deployed app's internal endpoint. This keeps
the required audit columns truthful and makes missing setup fail closed.

After a PR is merged to `main`, **Sync feedback after merge** reads feedback
links in the PR body and in issue bodies referenced with `Closes`, `Fixes`, or
`Feedback:`. It calls the linked environment's
`POST /api/internal/feedback/sync` endpoint with status `resolved`. The action
leaves resolved and verified items alone, and a sync failure is visible on the
separate workflow without blocking deployment.

Before enabling the workflow for an environment, configure the same
`FEEDBACK_SYNC_SECRET` in that app deployment and as the GitHub Actions secret
of that name. The endpoint has no fallback authentication: an unset or wrong
secret returns unauthorized and does not write data.
