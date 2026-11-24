# Releasing

Release procedure for maintainers.

## Cutting a release

1. Update `CHANGELOG.md` with a new version section.
2. Bump `version` in `package.json`, then in every distribution manifest:
   `plugin.json`, `.claude-plugin/marketplace.json`, `.cursor-plugin/marketplace.json`,
   `plugin/.claude-plugin/plugin.json`, `plugin/.cursor-plugin/plugin.json`,
   `gemini-extension.json`, `qwen-extension.json`.
   `tests/distribution.test.ts` fails if any of them disagree, so a release cannot ship an npm
   package and an agent plugin claiming different versions.
3. `npm test` and `npm run verify:pack`.
4. Commit and push to `main`, then release:

   ```bash
   npm run release -- --dry-run   # see what would be tagged
   npm run release                # tag, push, and move v2 once the release run succeeds
   ```

`npm run release` refuses unless `main` is clean and identical to `origin/main`, and, with the
GitHub CLI signed in, unless CI is green on the commit it tags. It tags the version in
`package.json` at HEAD, or at the commit that introduced the version when `CHANGELOG.md` still
has unreleased entries. Pushing the tag starts the release workflow. Once that run succeeds it
moves the moving major tag (`v2`) for Action users (see below); without the GitHub CLI it prints
the command to do that by hand.

`npm run release -- --backfill` also tags older `CHANGELOG.md` versions that never got a tag. Each
tag runs the release workflow of the commit it points at, and an older commit's workflow publishes
with npm's `latest` dist-tag, so the older tags go first, one push at a time, and the current
version is pushed only after their runs finish, which keeps the newest version on `latest`.
Without the GitHub CLI it pushes only the older tags; run `npm run release` again when their
runs are done.

`.github/workflows/release.yml` takes it from there: it checks the tag against `package.json`,
builds, runs the full suite, verifies the real tarball installs and runs, publishes to npm with
`npm publish --access public --provenance`, and creates the GitHub release with this version's
`CHANGELOG.md` section as its notes. Only the newest version takes npm's `latest` dist-tag and
GitHub's "Latest release" mark: an older tag publishes under `legacy`, a prerelease under `next`,
and a version already on npm is skipped, so a re-run or a late finisher cannot move users back. The version check runs
unconditionally, so a `workflow_dispatch` from a non-tag ref fails rather than publishing whatever
`package.json` happens to say.

## Provenance

The workflow publishes with `--provenance`, which attaches a Sigstore attestation binding the
tarball to this repository, this workflow file, and the commit it was built from. npm shows it as
the "Provenance" panel on the package page, and it is what lets somebody verify that the code on
GitHub is the code in the tarball.

Provenance is only available when npm can prove where the build ran, which in practice means
publishing from the GitHub Actions workflow with `id-token: write` (OIDC). It does not matter
whether the registry auth is trusted publishing or `NPM_TOKEN`; what matters is the environment.

A first publish made from a laptop has no provenance attestation. Publishing through this
workflow includes one, including for the first release when authenticated with `NPM_TOKEN`.
An attestation cannot be added retroactively to an already published version.

## The `v1` moving tag

Action consumers pin `catfish-1234/proctor@v2` and expect it to keep working across patch and minor
releases, the same convention `actions/checkout@v5` uses. `v2` is a mutable tag that always points
at the newest `v2.x.y` release commit. `npm run release` moves it once the release run succeeds;
the release workflow only runs for full version tags, so moving `v2` does not start a publish.

To move it by hand after the release workflow for `v2.1.0` goes green:

```bash
git tag -f v2 v2.1.0^{commit}   # move the local tag onto the release commit
git push origin v2 --force      # move it on the remote
```

Two rules for it:

- Move it only **after** the release workflow succeeds. A `v2` pointing at a commit whose publish
  failed sends every consumer to a half-released version.
- Never move a major tag across a major boundary. `v2.0.0` gets a new `v2` tag, and `v1` stays where it is
  so pinned consumers are not upgraded into a breaking change by a tag move.

Pinning to a full commit SHA (`catfish-1234/proctor@93ba04a...`) is also supported and is the
immutable option: a tag move cannot change the code a consumer runs. The README example pins the commit behind `v2.1.0`; `tests/release-hardening.test.ts` holds it to a full SHA.

## npm authentication, one time only

npm supports two ways in, and the first publish of a package can only use one of them.

**Trusted publishing (OIDC)** avoids a stored registry token. It is configured on the package's
settings page, so the package must already exist. It cannot authenticate the first publish
([npm/cli#8544](https://github.com/npm/cli/issues/8544)).

**For the first publish**, create a granular access token:

1. <https://www.npmjs.com/settings/~/tokens> → **Granular Access Token**
2. Scope: **Read and write** on the **`@kavishdua` scope** (a scope-level grant covers packages
   that do not exist yet, which a package-level grant cannot).
3. Tick **Bypass 2FA**, otherwise a CI publish needs an interactive OTP.
4. `gh secret set NPM_TOKEN` and paste it at the prompt.

Then tag and push, and the workflow publishes.

**After the first publish**, switch to OIDC and drop the secret:

1. npmjs.com → the package → Settings → **Trusted Publisher** → GitHub Actions
2. Owner `catfish-1234`, repository `proctor`, workflow filename `release.yml`, environment blank.
3. `gh secret delete NPM_TOKEN`.

The workflow needs no change: it already requests `id-token: write` and upgrades npm past 11.5.1,
which is what OIDC detection requires.

## Distribution channels

| Channel | How it is published | Needs a browser |
|---------|--------------------|-----------------|
| npm | `release.yml` on a `v*` tag | Once, for the token (see above) |
| Claude Code plugin | Already live: anyone can run `/plugin marketplace add catfish-1234/proctor`, which reads `.claude-plugin/marketplace.json` from the default branch | No |
| Gemini CLI / Qwen Code | Already live: `gemini extensions install <repo url>` reads the root `gemini-extension.json`. The gallery at geminicli.com auto-indexes public repos that have one | No |
| Agent Plugins 1.0.0 | Already live: the root `plugin.json` plus `skills/` is read by ChatGPT, Codex, Cursor, GitHub Copilot, Kiro and VS Code. No registry, no submission | No |
| Agent Skills | Already live: `.agents/skills/proctor/SKILL.md` is the convention Codex and VS Code scan for | No |
| GitHub Marketplace (Action) | Open `action.yml` on github.com → "Draft a release" banner → tick **Publish this Action to the GitHub Marketplace** → accept the terms → pick a category → publish. Needs 2FA on the account. `branding.icon` and `branding.color` are already set, and Marketplace rejects a listing without them | **Yes**, no CLI equivalent exists |
| Claude Code community catalog | <https://platform.claude.com/plugins/submit>. `claude plugin validate ./plugin` passes today | **Yes** |
| Cursor Marketplace | <https://cursor.com/marketplace/publish>. Manually reviewed; must be open source; each update is reviewed again | **Yes** |

Channels not used:

- **VS Code Marketplace and Open VSX.** VS Code reads `.agents/skills/` natively and is an Agent
  Plugins launch client, so an extension would add a publisher account, a PAT, and a release
  process for no additional reach.
- **The unscoped `proctor` name on npm.** Taken by an unrelated package since 2024.
- **MCP registries.** proctor is a CLI and a set of hooks, not an MCP server.

## After publishing

Check the package installs from the registry, not just from a local tarball:

```bash
npm view @kavishdua/proctor version
cd "$(mktemp -d)" && git init -q . && npx -y @kavishdua/proctor@latest check
```
