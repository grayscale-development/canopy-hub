# Releasing Canopy Hub

For every release:

1. Choose the next version using the existing major.minor scheme (for example, 2.0 → 2.1). Update `package.json` and both root version fields in `package-lock.json`. The login screen reads the version from `package.json`.
2. Add a concise, user-facing note in `docs/releases/<version>.md`. Describe the changes users will notice, without internal implementation details.
3. Include the version and notes in the release PR, run the relevant checks, and have them reviewed before merge and deployment.
4. After deployment, publish the reviewed note in the wiki under Canopy Wiki → Hub → Release Notes. Create the group if needed. Keep older release pages; do not overwrite them.

The release owner is responsible for these steps on every release; ordinary feature PRs need not bump the version independently.
