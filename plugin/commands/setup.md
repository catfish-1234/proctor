---
description: "Set up proctor in this repository: the git pre-commit hook, plus the ruleset for every agent in use."
---

Set proctor up in the current repository.

1. Confirm this is a git repository. If it is not, stop and say so.
2. Run `npx @kavishdua/proctor install-hook` to install the git pre-commit hook. This catches a
   bad change even when it did not come from an agent turn.
3. Run `npx @kavishdua/proctor install-skill` to write the honest-completion ruleset to every
   supported agent's conventional path. Files proctor owns are written whole; shared instruction
   files like `AGENTS.md` are merged into a delimited block that leaves the rest of the file
   alone. Report which paths it wrote and which it merged.
4. Run `npx @kavishdua/proctor drift-check` and confirm it exits 0.
5. Tell the user which files to commit, including `.proctor-adapter-manifest.json` if it was
   created. That file is what lets drift-check tell a deleted ruleset apart from one that was
   never installed, so it needs to be committed alongside the rest.

The Stop hook is already active through this plugin, so do not also run `install-claude-hook`
unless the user wants proctor to keep working in repositories where the plugin is not installed.

Do not create a `proctor.config.json` unless the user asks. The defaults enable every check, and
an empty config file only adds a thing to keep in sync.
