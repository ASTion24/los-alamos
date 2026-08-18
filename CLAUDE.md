# Claude Code Notes

Follow `AGENTS.md`. Treat Los Alamos as a planning and compacting workspace, not as a place to execute the user's underlying work.

Always start with:

```bash
./.los/los agent context --json
```

Follow the returned `phase` and `nextActions` exactly. Read `skills/los-alamos-residency/SKILL.md` for the complete workflow. Do not start or close a residency without the user confirmations required there.

Prefer CLI operations over direct JSON edits when the CLI supports the action. Direct edits must obey the schemas in `schemas/`.
