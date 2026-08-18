# Los Alamos Agent Protocol

Los Alamos is a local desktop tool for closing long-tail projects through short, focused residency sessions.

Agents may help with context management, task graph modeling, scope reduction, session planning, progress judgement, and compact logging. Agents must not directly perform the user's substantive work unless the user separately asks for that outside this project.

## Agent Entry Point

Do not infer the workflow from files or UI state. Always begin with:

```bash
./.los/los agent context --json
```

Follow only the returned `phase` and `nextActions`. After every mutation, run the command again. Use this command to discover every supported operation and GUI surface:

```bash
./.los/los agent capabilities --json
```

On Windows use `.los\los.cmd` with the same arguments. `npm run los -- ...` remains an optional alias when npm is available.

The complete deterministic workflow is in:

- `skills/los-alamos-residency/SKILL.md`
- `.trae/skills/los-alamos-residency/SKILL.md`

Read the absolute data root from `workspace.root` in the context output. Never infer whether the current directory or `workspace/` is the data root.

## Authoritative Data

The files below `workspace.root` are the public protocol:

- `projects/<project-id>/brief.md`: user-provided facts.
- `projects/<project-id>/model.json`: task graph and progress model.
- `projects/<project-id>/events.jsonl`: append-only audit log.
- `sessions/<session-id>.json`: session record.
- `schemas/*.schema.json`: JSON contracts.

Do not add fields casually. Preserve `schemaVersion`, `revision`, `updatedAt`, and `updatedBy`.

## Allowed Agent Actions

- Clarify a project brief.
- Improve `model.json` when facts justify it.
- Update `brief.md` when the user provides newer project facts.
- Split tasks into serial or parallel work units.
- Adjust task weights, effort estimates, intensity, and dependencies.
- Propose a session through the CLI.
- Start or cancel a proposed session through the CLI.
- Close a session from user feedback.
- Archive or restore a project when the user explicitly requests it.
- Write concise compact summaries.

## Forbidden Actions

- Do not complete the user's real project work inside this repository.
- Do not invent facts about external projects.
- Do not rewrite audit history.
- Do not inflate completion percentages by marking low-value side tasks as done.
- Do not assign a task whose intensity exceeds the user's requested intensity.

## CLI

Use:

```bash
./.los/los agent context --json
./.los/los agent capabilities --json
./.los/los project list --json
./.los/los project inspect <project-id> --json
./.los/los project update-brief <project-id> --brief "Latest facts" --json
./.los/los project reanalyze <project-id> --json
./.los/los project archive <project-id> --json
./.los/los project restore <project-id> --json
./.los/los task update <project-id> <task-id> [update flags] --json
./.los/los session propose --minutes 30 --intensity medium --json
./.los/los session start <session-id> --json
./.los/los session cancel <session-id> --json
./.los/los session close <session-id> --result completed --note "User said it is done" --json
./.los/los workspace health --json
./.los/los open projects
./.los/los open project <project-id>
./.los/los open archive
./.los/los open create
./.los/los open residency
./.los/los open history
./.los/los open settings
./.los/los open about
./.los/los open session <session-id>
```

Completion is computed from leaf task weights. If the task graph changes, update the model first, then let the app or CLI recompute progress when possible.

Completing a session with `scope: checkpoint` must leave the parent task `in_progress`; only `scope: full_task` may close it.

`session propose` only creates a reviewable proposal. Time begins when `session start` changes it to `active`.
