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
- `plans/<plan-id>.json`: optional residency plan; `plans/events.jsonl` is append-only.
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

## Continuity And Closure

- Product source development is separate from this runtime protocol. When explicitly asked to develop Los Alamos itself, do not start a residency or modify real project/session data.
- `brief.md` includes the optional `los-alamos:intake` JSON block of user-confirmed completed work, remaining actions, closing criteria, and starting estimate. Do not convert a self-reported percentage into calculated task completion.
- Use `project capsule <id> --file <capsule.json> --json` for confirmed handoffs: `summary`, `decisions`, `artifacts`, `blocker`, `nextAction`, `notDoing`, optional `taskId`, and `updatedAt`.
- Use `session close ... --handoff-file <capsule.json>` to retain the exact re-entry point. Time spent never awards progress. Partial/checkpoint results keep the parent open; explicit `task update --progress` is for evidence-based calibration.
- Use `session pause <id>` and `session resume <id>`. `residency_paused` requires confirmation before resuming. A paused session may be closed from user feedback.
- Use `session propose ... --project <id>` when the user selects one project. Preserve this selection in `agent context ... --project <id>`.
- `no_eligible_task` means inspect facts, dependencies, and closure criteria; never repeatedly propose or silently raise intensity. `modelNeedsReview` blocks stale graphs after facts change.
- `plan_attention` means a date, intensity, or capacity boundary has been reached. Never expand capacity automatically.
- `project resolve <id> --outcome <closed|parked|waiting|killed|active> --note <reason>` requires an explicit user decision. `closed` also needs `--evidence`; `parked` needs `--revisit YYYY-MM-DD`; `waiting` must name the external condition in the note. Resolution does not falsify progress.
- `plan save --file <plan.json> [--id <id>]`, `plan commit <id>`, `plan start <id>`, `plan close <id> --note <result>` manage one optional residency plan. The user must confirm starting/closing; draft/committed plans do not block one-off work.
- `open plans` opens the residency plan surface. Re-read context after every mutation.

## Attention Launcher

- The desktop defaults to `open home`, a focused entrance rather than the project library.
- `inbox add --text <verbatim-thought> [--session <id>]` saves an unstructured thought without creating a task or changing progress. Read with `inbox list`; use `inbox shelve <id>` / `inbox restore <id>` for reversible attention decisions.
- `inbox prepare <id> --title <title> --remaining <actions> --closing <criterion>` converts one capture only after the user confirms the remaining work and stopping point. Original text and append-only events remain under `inbox/`. Suggestions are not confirmed facts.
- `focus preview --minutes <n> --intensity <level> [--project <id>]` is read-only with respect to sessions. Present its exact task, action, completion criterion, boundary, and constraints.
- Only after explicit confirmation, `focus start` with the same constraints and `--token <preview-token>` atomically creates and starts that exact proposal. Stale tokens are rejected. Never silently refresh a token and start without renewed confirmation.
- Capturing a distraction during an active session does not authorize switching projects, pausing, increasing scope, or doing the captured work.
- Open materials only on an explicit user action. The desktop allows recorded HTTP(S) links and known document formats; executable/unknown local targets are revealed in the file manager, not executed.
