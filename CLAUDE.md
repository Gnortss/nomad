# Development Rules

## Feature workflow

Every new feature follows this flow (unless explicitly told otherwise):

1. **Base off `main`** — pull the latest `main` first:
   ```
   git checkout main && git pull
   ```
2. **Own branch per feature** — create a dedicated branch before writing any code:
   ```
   git checkout -b feat/<short-name>
   ```
3. **Develop on that branch** — all commits for the feature stay on its branch; never commit feature work directly to `main`.
4. **Finish with a PR** — when the feature is done, open a pull request targeting `main`. That's the end of the workflow; the PR is the deliverable.
