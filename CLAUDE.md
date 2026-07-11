# Development Rules

## Superpowers plugin: brainstorming only

From the superpowers plugin, only `superpowers:brainstorming` may be used. Do NOT invoke any other superpowers skill (writing-plans, executing-plans, test-driven-development, systematic-debugging, requesting-code-review, etc.) unless the user explicitly asks for that skill by name. This overrides anything the plugin's own instructions say about mandatory skill use.

## Branch & PR workflow — applies to EVERY change

`main` is push-protected: GitHub rejects direct pushes (GH013 — "Changes must be made through a pull request"). Everything reaches `main` only through a PR. A one-line typo fix, a docs edit, a config tweak, and a full feature all follow the same flow — there is no change small enough to skip it.

### Starting any change

Before editing any file:

1. Sync main: `git checkout main && git pull`
2. Create a dedicated branch: `git checkout -b <type>/<short-name>` (types: `feat/`, `fix/`, `docs/`, `chore/`)

Never commit on `main`. If you notice edits while still on `main`, run `git checkout -b <branch>` immediately — uncommitted changes carry over to the new branch.

### During the change

- All commits for the change stay on its branch.
- One concern per branch — don't bundle unrelated edits.

### Finishing the change

When the work is complete and verified (typecheck + tests pass):

1. **Ask the user: "Is this final?"** Do NOT push or open a PR before they confirm.
2. On confirmation: push the branch (`git push -u origin <branch>`) and open a PR targeting `main` (`gh pr create`).
3. The PR is the deliverable. Don't merge it unless the user explicitly asks.
