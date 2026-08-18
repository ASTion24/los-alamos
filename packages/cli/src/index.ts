#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  cancelSessionProposal,
  closeWorkspaceSession,
  createProject,
  getWorkspaceRoot,
  inspectWorkspace,
  listProjects,
  listSessions,
  proposeSession,
  readProject,
  reanalyzeProject,
  requestOpen,
  setProjectArchived,
  startWorkspaceSession,
  updateProjectBrief,
  updateProjectTask
} from "../../workspace/src";
import type { Intensity, SessionResult, TaskStatus, WorkUnit } from "../../core/src";
import { agentCapabilities, buildAgentContext } from "./agent";

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [area, command, maybeId, maybeTaskId] = args.positionals;

  if (!area || area === "help" || area === "--help") {
    printHelp();
    return;
  }

  if (area === "agent" && command === "capabilities") {
    print(agentCapabilities, args);
    return;
  }

  if (area === "agent" && command === "context") {
    const minutesFlag = readFlag(args, "minutes", false);
    const intensityFlag = readFlag(args, "intensity", false);
    const minutes =
      minutesFlag === undefined ? undefined : parseNumber(minutesFlag, "minutes", 5, 180);
    const intensity =
      intensityFlag === undefined ? undefined : parseIntensity(intensityFlag);
    const [health, projects, sessions] = await Promise.all([
      inspectWorkspace(),
      listProjects(),
      listSessions()
    ]);
    print(
      buildAgentContext({
        workspaceRoot: getWorkspaceRoot(),
        health,
        projects,
        sessions,
        minutes,
        intensity
      }),
      args
    );
    return;
  }

  if (area === "project" && command === "add") {
    const title = readFlag(args, "title", true);
    const brief = readFlag(args, "brief", true);
    const project = await createProject({ title, brief });
    print(project, args);
    return;
  }

  if (area === "project" && command === "list") {
    print(await listProjects(), args);
    return;
  }

  if (area === "project" && command === "inspect") {
    if (!maybeId) {
      throw new Error("Missing project id.");
    }
    print(await readProject(maybeId), args);
    return;
  }

  if (area === "project" && command === "update-brief") {
    if (!maybeId) {
      throw new Error("Missing project id.");
    }
    const brief = readFlag(args, "brief", true);
    print(await updateProjectBrief({ projectId: maybeId, brief }), args);
    return;
  }

  if (area === "project" && command === "reanalyze") {
    if (!maybeId) {
      throw new Error("Usage: project reanalyze <project-id> --json");
    }
    print(await reanalyzeProject({ projectId: maybeId }), args);
    return;
  }

  if (area === "project" && (command === "archive" || command === "restore")) {
    if (!maybeId) {
      throw new Error("Missing project id.");
    }
    print(
      await setProjectArchived({
        projectId: maybeId,
        archived: command === "archive"
      }),
      args
    );
    return;
  }

  if (area === "task" && command === "update") {
    if (!maybeId || !maybeTaskId) {
      throw new Error("Usage: task update <project-id> <task-id> [flags]");
    }
    const patch: Partial<WorkUnit> = {};
    const status = readFlag(args, "status", false);
    const minutes = readFlag(args, "minutes", false);
    const intensity = readFlag(args, "intensity", false);
    const weight = readFlag(args, "weight", false);
    const title = readFlag(args, "title", false);
    const description = readFlag(args, "description", false);
    const dependsOn = readFlag(args, "depends-on", false);
    const progress = readFlag(args, "progress", false);
    const completion = readFlag(args, "completion", false);
    const start = readFlag(args, "start", false);
    const notDoing = readFlag(args, "not-doing", false);
    const notes = readFlag(args, "notes", false);
    if (status) patch.status = parseTaskStatus(status);
    if (minutes) patch.effortMinutes = parseNumber(minutes, "minutes", 1);
    if (intensity) patch.intensity = parseIntensity(intensity);
    if (weight) patch.weight = parseNumber(weight, "weight", 0);
    if (title !== undefined) patch.title = title;
    if (description !== undefined) patch.description = description;
    if (dependsOn !== undefined) {
      patch.dependsOn = dependsOn
        .split(",")
        .map((dependencyId) => dependencyId.trim())
        .filter(Boolean);
    }
    if (progress) patch.progressPercent = parseNumber(progress, "progress", 0, 100);
    if (completion !== undefined) patch.completionCriteria = completion;
    if (start !== undefined) patch.startAction = start;
    if (notDoing !== undefined) patch.notDoing = notDoing;
    if (notes !== undefined) patch.notes = notes;
    if (Object.keys(patch).length === 0) {
      throw new Error("task update requires at least one update flag.");
    }
    print(
      await updateProjectTask({
        projectId: maybeId,
        taskId: maybeTaskId,
        patch
      }),
      args
    );
    return;
  }

  if (area === "session" && command === "propose") {
    const minutes = parseNumber(readFlag(args, "minutes", true), "minutes", 5, 180);
    const intensity = parseIntensity(readFlag(args, "intensity", true));
    const session = await proposeSession(minutes, intensity);
    print(session ?? { error: "No eligible task found." }, args);
    return;
  }

  if (area === "session" && command === "list") {
    print(await listSessions(), args);
    return;
  }

  if (area === "session" && command === "start") {
    if (!maybeId) {
      throw new Error("Missing session id.");
    }
    print(await startWorkspaceSession(maybeId), args);
    return;
  }

  if (area === "session" && command === "cancel") {
    if (!maybeId) {
      throw new Error("Missing session id.");
    }
    print(await cancelSessionProposal(maybeId), args);
    return;
  }

  if (area === "session" && command === "close") {
    if (!maybeId) {
      throw new Error("Missing session id.");
    }
    const result = parseSessionResult(readFlag(args, "result", true));
    const note = readFlag(args, "note", false);
    print(await closeWorkspaceSession({ sessionId: maybeId, result, note }), args);
    return;
  }

  if (area === "workspace" && command === "health") {
    print(await inspectWorkspace(), args);
    return;
  }

  if (area === "open") {
    const target = command ?? "projects";
    const allowedTargets = new Set([
      "projects",
      "project",
      "archive",
      "create",
      "residency",
      "history",
      "settings",
      "about",
      "session"
    ]);
    if (!allowedTargets.has(target)) {
      throw new Error(
        `Unknown open target "${target}". Use projects, project, archive, create, residency, history, settings, about, or session.`
      );
    }
    if ((target === "project" || target === "session") && !maybeId) {
      throw new Error(`open ${target} requires an id.`);
    }
    await requestOpen({
      target,
      id: maybeId,
      source: "agent"
    });
    launchDesktop();
    print({ ok: true, target, id: maybeId ?? null }, args);
    return;
  }

  throw new Error(`Unknown command: ${args.positionals.join(" ")}`);
}

function launchDesktop(): void {
  const root = process.cwd();
  const configuredExecutable = process.env.LOS_ALAMOS_DESKTOP_EXECUTABLE;
  const configuredArgument = process.env.LOS_ALAMOS_DESKTOP_ARGUMENT;
  const macApp = join(root, "node_modules", "electron", "dist", "Electron.app");
  const windowsExe = join(root, "node_modules", "electron", "dist", "electron.exe");
  const unixBinary = join(root, "node_modules", "electron", "dist", "electron");

  let command: string;
  let launchArgs: string[];
  if (configuredExecutable && existsSync(configuredExecutable)) {
    const appMarker = ".app/Contents/MacOS/";
    const markerIndex = configuredExecutable.indexOf(appMarker);
    if (process.platform === "darwin" && markerIndex >= 0) {
      command = "open";
      launchArgs = ["-a", configuredExecutable.slice(0, markerIndex + 4)];
      if (configuredArgument) {
        launchArgs.push("--args", configuredArgument);
      }
    } else {
      command = configuredExecutable;
      launchArgs = configuredArgument ? [configuredArgument] : [];
    }
  } else if (process.platform === "darwin" && existsSync(macApp)) {
    command = "open";
    launchArgs = ["-a", macApp, "--args", root];
  } else if (process.platform === "darwin") {
    command = "open";
    launchArgs = ["-a", "Los Alamos"];
  } else if (process.platform === "win32" && existsSync(windowsExe)) {
    command = windowsExe;
    launchArgs = [root];
  } else if (existsSync(unixBinary)) {
    command = unixBinary;
    launchArgs = [root];
  } else {
    return;
  }

  const childEnvironment = { ...process.env };
  delete childEnvironment.ELECTRON_RUN_AS_NODE;
  const child = spawn(command, launchArgs, {
    detached: true,
    env: childEnvironment,
    stdio: "ignore"
  });
  child.unref();
}

function parseArgs(raw: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < raw.length; index += 1) {
    const token = raw[index];
    if (token.startsWith("--")) {
      const name = token.slice(2);
      const next = raw[index + 1];
      if (!next || next.startsWith("--")) {
        flags[name] = true;
      } else {
        flags[name] = next;
        index += 1;
      }
    } else {
      positionals.push(token);
    }
  }

  return { positionals, flags };
}

function readFlag(args: ParsedArgs, name: string, required: true): string;
function readFlag(args: ParsedArgs, name: string, required: false): string | undefined;
function readFlag(args: ParsedArgs, name: string, required: boolean): string | undefined {
  const value = args.flags[name];
  if (typeof value === "string") {
    return value;
  }
  if (required) {
    throw new Error(`Missing --${name}.`);
  }
  return undefined;
}

function parseNumber(value: string, name: string, minimum: number, maximum = Number.POSITIVE_INFINITY): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    const range = Number.isFinite(maximum) ? `${minimum}-${maximum}` : `>= ${minimum}`;
    throw new Error(`--${name} must be a number in range ${range}.`);
  }
  return parsed;
}

function parseIntensity(value: string): Intensity {
  if (!["low", "medium", "high", "xhigh"].includes(value)) {
    throw new Error("--intensity must be low, medium, high, or xhigh.");
  }
  return value as Intensity;
}

function parseTaskStatus(value: string): TaskStatus {
  if (!["todo", "in_progress", "done", "parked", "killed", "unknown"].includes(value)) {
    throw new Error(
      "--status must be todo, in_progress, done, parked, killed, or unknown."
    );
  }
  return value as TaskStatus;
}

function parseSessionResult(value: string): SessionResult {
  if (!["completed", "partial", "not_completed"].includes(value)) {
    throw new Error("--result must be completed, partial, or not_completed.");
  }
  return value as SessionResult;
}

function print(value: unknown, args: ParsedArgs): void {
  if (args.flags.json || typeof value !== "string") {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${value}\n`);
}

function printHelp(): void {
  process.stdout.write(`Los Alamos CLI

Usage:
  ./.los/los agent context --json
  ./.los/los agent context --minutes 25 --intensity medium --json
  ./.los/los agent capabilities --json
  ./.los/los project add --title "Paper polish" --brief "Draft is 80% done"
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
  ./.los/los session close <session-id> --result completed --note "Done" --json
  ./.los/los session list --json
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
`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes("--json")) {
    process.stderr.write(
      `${JSON.stringify(
        {
          ok: false,
          error: {
            code: "command_failed",
            message
          },
          recoveryCommand: "./.los/los agent context --json"
        },
        null,
        2
      )}\n`
    );
  } else {
    process.stderr.write(`${message}\n`);
  }
  process.exitCode = 1;
});
