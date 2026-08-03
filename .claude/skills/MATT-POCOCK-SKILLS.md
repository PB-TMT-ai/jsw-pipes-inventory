# Matt Pocock's skills (vendored)

22 skills copied into this repo from [mattpocock/skills](https://github.com/mattpocock/skills).

| | |
|---|---|
| Upstream | `https://github.com/mattpocock/skills` |
| Version | `1.1.0` (package.json) / `1.2.0` (marketplace manifest) |
| Commit | `2ab958093e83e0ec752e6c1c5932da465bf23e0c` (2026-07-28) |
| Vendored | 2026-08-03 |
| Licence | MIT |

## Why vendored instead of `claude plugin install`

The plugin route (`/plugin install mattpocock-skills`) installs into the machine's
Claude config, not the repo. Remote/web sessions run in throwaway containers, so a
plugin install disappears when the container is reclaimed. Files in `.claude/skills/`
are in git, so every session — local, web, CI — gets them.

Trade-off: no automatic updates. Refresh manually (see below).

## What was taken

The 22 skills listed in upstream `package.json`, from `skills/engineering/` and
`skills/productivity/`. Category directories were flattened, because Claude Code
discovers skills at `.claude/skills/<name>/SKILL.md` and does not recurse.

**Engineering:** ask-matt, code-review, codebase-design, diagnosing-bugs,
domain-modeling, grill-with-docs, implement, improve-codebase-architecture,
prototype, research, resolving-merge-conflicts, setup-matt-pocock-skills, tdd,
to-spec, to-tickets, triage, wayfinder

**Productivity:** grill-me, grilling, handoff, teach, writing-great-skills

Not taken: `skills/deprecated/`, `skills/in-progress/`, `skills/personal/`,
`skills/misc/` — upstream excludes them from the published set.

## Invoking them

Vendored skills are plain repo skills, so they are `/code-review`, `/tdd`,
`/triage` — **not** `/mattpocock-skills:code-review`. That namespaced form only
exists when installed as a plugin.

Run `/setup-matt-pocock-skills` once to configure the issue tracker, triage labels,
and docs location for this repo.

## Refreshing

```bash
git clone --depth 1 https://github.com/mattpocock/skills.git /tmp/mp-skills
for d in /tmp/mp-skills/skills/engineering/*/ /tmp/mp-skills/skills/productivity/*/; do
  n=$(basename "$d")
  [ -f "$d/SKILL.md" ] && rm -rf ".claude/skills/$n" && cp -R "$d" ".claude/skills/$n"
done
```

Then update the version/commit rows above. Review the diff before committing —
these files shape agent behaviour in this repo.
