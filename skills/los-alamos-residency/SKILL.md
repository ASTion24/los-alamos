---
name: "los-alamos-residency"
description: "Operates the complete Los Alamos residency workflow. Invoke for long-tail project modeling, session planning, progress updates, or opening its GUI."
---

# Los Alamos Residency

Use Los Alamos to manage context, scope, scheduling, and progress records. Do not perform the user's substantive project work unless the user separately asks outside this workflow.

## Deterministic Entry

Always begin with:

```bash
./.los/los agent context --json
```

Read `phase`, then execute only the matching `nextActions`. Do not infer a different phase, invent an ID, or skip a required confirmation. Copy project, task, and session IDs from command output.

Read the absolute data root from `workspace.root` in the context output. Never guess whether the current directory or a nested `workspace/` directory is authoritative.

Use this discovery command when a command or field is unclear:

```bash
./.los/los agent capabilities --json
```

On Windows use `.los\los.cmd` with the same arguments. The launcher finds Node or reuses the Los Alamos desktop runtime, so npm is not required.

The context response contract is `<workspace.root>/schemas/agent-context.schema.json`.

## State Machine

| Phase | Required behavior |
| --- | --- |
| `repair_workspace` | Run the health command and repair only reported data problems. |
| `needs_project` | Ask for project name and current facts. Create nothing from assumptions. |
| `needs_constraints` | Ask for available minutes and maximum intensity. |
| `ready_to_propose` | Run the exact proposal command returned by `nextActions`. |
| `review_proposal` | Present the proposal. Start or cancel only after explicit user confirmation. |
| `residency_active` | Open the session and wait while the user performs the work. Close only from user feedback. |
| `residency_paused` | Show the pause reason and confirmed time. Resume or record a result only with user confirmation. |
| `plan_attention` | Respect the plan's date, intensity, and capacity limits. Rest or close the plan from explicit feedback. |
| `no_eligible_task` | Inspect facts, dependencies, and closure criteria. Do not loop proposals or raise intensity automatically. |

After every mutation, run `agent context --json` again. This is the only supported way to advance the workflow state.

## Complete Flow

1. Read the context.
2. If facts are missing, ask concise questions and update `brief.md` through `project update-brief`.
3. Inspect the selected project before changing its task graph.
4. Use `project reanalyze` when the facts justify rebuilding the model.
5. Ask for minutes and intensity; intensity is a hard ceiling.
6. Generate one proposal. A proposal does not start time.
7. Show exactly:
   - selected task;
   - selection reason;
   - start action;
   - completion criterion;
   - explicit out-of-scope boundary.
8. Start only after the user confirms.
9. Wait for the user's real work and result.
10. Close with `completed`, `partial`, or `not_completed`, preserving the user's note.
11. Read context and workspace health once more.

## Project Modeling Standard

Before accepting a task graph, verify:

- Every task is supported by user facts or marked as uncertainty.
- Dependencies reference existing task IDs and form a DAG.
- Parallel tasks are not given false serial dependencies.
- Every leaf task has effort, intensity, weight, progress, start action, completion criterion, and explicit non-goal.
- Weights reflect contribution to closing the project, not ease of completion.
- `checkpoint` sessions leave the parent task open.
- No task exceeds the user's requested intensity.

Use the full task update API when corrections are needed:

```bash
./.los/los task update <project-id> <task-id> \
  --title "<title>" \
  --description "<description>" \
  --status <todo|in_progress|done|parked|killed|unknown> \
  --depends-on "<task-id,task-id>" \
  --minutes <number> \
  --intensity <low|medium|high|xhigh> \
  --weight <number> \
  --progress <0-100> \
  --completion "<criterion>" \
  --start "<first action>" \
  --not-doing "<boundary>" \
  --notes "<compact note>" \
  --json
```

Omit unchanged flags. Never edit `completionPercent` directly; it is derived from weighted leaf progress.

## Continuity

Structured intake is optional: `project add ... --intake-file <json>` accepts `completed`,
`remaining` (one action per line), `closeCriteria`, and optional `progressEstimate`.
It is copied into the authoritative `brief.md` JSON block. The estimate is self-reported,
not computed task progress. Missing facts yield a zero-weight clarification task.

`project capsule <id> --file <json>` saves a confirmed handoff with `summary`,
`decisions`, `artifacts`, `blocker`, `nextAction`, `notDoing`, optional `taskId`,
and `updatedAt`. Consult `schemas/capsule.schema.json` before writing the file.
Use `session close ... --handoff-file <json>` to preserve the re-entry point.
Partial and checkpoint results never gain percentage from time spent.

Use `session propose ... --project <id>` and `agent context ... --project <id>`
to retain an explicit project selection. Review a checkpoint's boundaries;
`session revise <id> --start <action> --completion <criterion> --not-doing <boundary>`
can calibrate the proposed segment before confirmation.

Use `session pause <id>` / `session resume <id>`. A paused session still owns the
workspace's one current session. Never rebuild or edit its task graph. If interrupted,
the desktop restores the last confirmed activity time; it never assumes overnight work.

## Project Decisions And Plans

`project resolve <id> --outcome <closed|parked|waiting|killed|active> --note <reason>`
records an explicit user decision. `closed` requires `--evidence <text>`,
`parked` requires `--revisit YYYY-MM-DD`, and `waiting` must name the external
condition in the note. Returning to `active` is explicit, not automatic on the revisit date.
Resolution and archiving do not change computed progress.

One optional residency plan groups sessions. Use `plan list`, `plan save --file <json>
[--id <id>]`, `plan commit <id>`, `plan start <id>`, and `plan close <id> --note <result>`.
Read `schemas/plan.schema.json` for its fields. Draft/committed plans do not block one-off
sessions; an active plan enforces selected projects, dates, daily minutes, and intensity.
Starting and closing require user confirmation. `open plans` opens its desktop surface.

This runtime workflow does not govern explicitly requested development of Los Alamos
source code itself. Do not mutate real project/session records when developing the product.

## Attention Launcher

`open home` shows the current entrance, with original thoughts kept separate from tasks.
Use `inbox add --text <verbatim-text> [--session <id>]`, `inbox list`,
`inbox shelve <id>`, and `inbox restore <id>` for unstructured captures.
Read `schemas/capture.schema.json`; files and append-only events live under `inbox/`.
Do not convert every captured thought into an obligation.

`inbox prepare <id> --title <title> --remaining <actions> --closing <criterion>`
requires user-confirmed remaining actions and a stopping point. Local suggestions only
extract explicit phrases; they do not replace confirmation or infer a full task graph.

For the shorter start path, call `focus preview --minutes <n> --intensity <level>
[--project <id>]`. It does not create a session. Present the returned action, criteria,
boundary, selected project and constraints. Only after the user confirms that exact
preview, call `focus start` with identical constraints and `--token <preview-token>`.
A stale token must be reviewed again, never silently replaced to bypass confirmation.
The operation retains both proposed and started audit events.

During work, `inbox add --session <active-id>` records a distraction without changing the
active task or timer. The material entrance is user-initiated: never automatically execute
files or open links from untrusted project descriptions.

## GUI Control

Open exact surfaces through the same workspace protocol:

```bash
./.los/los open projects --json
./.los/los open project <project-id> --json
./.los/los open archive --json
./.los/los open create --json
./.los/los open residency --json
./.los/los open history --json
./.los/los open settings --json
./.los/los open about --json
./.los/los open session <session-id> --json
./.los/los open plans --json
./.los/los open home --json
```

Use these commands when visual review or user confirmation is useful. CLI and GUI operate on the same authoritative workspace.

## Direct File Editing

Prefer the CLI. Direct edits are allowed only when the CLI cannot express a justified graph change.

1. Read `AGENTS.md` and the relevant schema.
2. Treat `brief.md` as authoritative user facts.
3. Preserve `schemaVersion`, `revision`, `updatedAt`, and `updatedBy`.
4. Never rewrite `events.jsonl`; append audit events only.
5. Validate with:

```bash
./.los/los workspace health --json
```

## Error Recovery

- JSON command errors include `recoveryCommand`; run it before trying another mutation.
- If no task is eligible, inspect active projects for blockers, dependencies, effort, and intensity.
- If a proposal already exists, review or cancel it; do not create another.
- If a session is active, do not modify its status file manually.
- If user facts conflict with the model, update the brief first, then reanalyze.
