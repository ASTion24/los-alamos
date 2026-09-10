import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export interface WorkspacePaths {
  root: string;
  manifest: string;
  projects: string;
  sessions: string;
  plans: string;
  inbox: string;
  schemas: string;
  runtime: string;
  openRequest: string;
}

export function assertSafeId(value: string, label = "ID"): string {
  const id = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id) || id === "." || id === "..") {
    throw new Error(`${label} 必须是单个安全路径段。`);
  }
  return id;
}

export function getWorkspaceRoot(explicitRoot?: string): string {
  if (explicitRoot) return resolve(explicitRoot);
  if (process.env.LOS_ALAMOS_WORKSPACE) {
    return resolve(process.env.LOS_ALAMOS_WORKSPACE);
  }
  const currentDirectory = process.cwd();
  return existsSync(join(currentDirectory, "residency.json"))
    ? resolve(currentDirectory)
    : resolve(currentDirectory, "workspace");
}

export function getWorkspacePaths(explicitRoot?: string): WorkspacePaths {
  const root = getWorkspaceRoot(explicitRoot);
  const runtime = join(root, ".runtime");
  return {
    root,
    manifest: join(root, "residency.json"),
    projects: join(root, "projects"),
    sessions: join(root, "sessions"),
    plans: join(root, "plans"),
    inbox: join(root, "inbox"),
    schemas: join(root, "schemas"),
    runtime,
    openRequest: join(runtime, "open-request.json")
  };
}

export function projectDir(root: string, projectId: string): string {
  return join(getWorkspacePaths(root).projects, assertSafeId(projectId, "项目 ID"));
}

export function projectModelPath(root: string, projectId: string): string {
  return join(projectDir(root, projectId), "model.json");
}

export function projectBriefPath(root: string, projectId: string): string {
  return join(projectDir(root, projectId), "brief.md");
}

export function projectEventsPath(root: string, projectId: string): string {
  return join(projectDir(root, projectId), "events.jsonl");
}

export function sessionPath(root: string, sessionId: string): string {
  return join(getWorkspacePaths(root).sessions, `${assertSafeId(sessionId, "驻留 ID")}.json`);
}
