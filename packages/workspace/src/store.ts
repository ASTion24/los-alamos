import { randomUUID } from "node:crypto";
import {
  access,
  appendFile,
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile
} from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import {
  analyzeProjectFast,
  closeSession,
  proposeSessionTask,
  refreshProjectProgress,
  type AnalyzeProjectInput,
  type Intensity,
  type LongTailProject,
  type ProjectEvent,
  type ResidencySession,
  type SessionAssessment,
  type SessionResult,
  type WorkUnit
} from "../../core/src";
import {
  getWorkspacePaths,
  assertSafeId,
  projectBriefPath,
  projectDir,
  projectEventsPath,
  projectModelPath,
  sessionPath
} from "./paths";

export interface WorkspaceManifest {
  schemaVersion: "1";
  product: "Los Alamos";
  workspaceVersion: 1;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  title: string;
  brief: string;
  workspaceRoot?: string;
  analyzer?: (input: AnalyzeProjectInput) => Promise<LongTailProject>;
}

export interface CloseWorkspaceSessionInput {
  sessionId: string;
  result: SessionResult;
  note?: string;
  workspaceRoot?: string;
  assessor?: (input: {
    project: LongTailProject;
    session: ResidencySession;
    result: SessionResult;
    note?: string;
  }) => Promise<SessionAssessment | undefined>;
}

export interface UpdateTaskInput {
  projectId: string;
  taskId: string;
  patch: Partial<
    Pick<
      WorkUnit,
      | "title"
      | "description"
      | "status"
      | "dependsOn"
      | "effortMinutes"
      | "intensity"
      | "weight"
      | "progressPercent"
      | "completionCriteria"
      | "startAction"
      | "notDoing"
      | "notes"
    >
  >;
  workspaceRoot?: string;
}

export interface ReanalyzeProjectInput {
  projectId: string;
  analyzer?: (input: AnalyzeProjectInput) => Promise<LongTailProject>;
  workspaceRoot?: string;
}

export interface UpdateProjectBriefInput {
  projectId: string;
  brief: string;
  workspaceRoot?: string;
}

export interface SetProjectArchivedInput {
  projectId: string;
  archived: boolean;
  workspaceRoot?: string;
}

export interface WorkspaceHealthIssue {
  severity: "warning" | "error";
  code: string;
  message: string;
  path: string;
}

export interface WorkspaceHealth {
  ok: boolean;
  checkedAt: string;
  projectCount: number;
  sessionCount: number;
  backupCount: number;
  issues: WorkspaceHealthIssue[];
}

export async function ensureWorkspace(workspaceRoot?: string): Promise<string> {
  const paths = getWorkspacePaths(workspaceRoot);
  await mkdir(paths.projects, { recursive: true });
  await mkdir(paths.sessions, { recursive: true });
  await mkdir(paths.schemas, { recursive: true });
  await mkdir(paths.runtime, { recursive: true });

  if (!(await exists(paths.manifest))) {
    const now = new Date().toISOString();
    const manifest: WorkspaceManifest = {
      schemaVersion: "1",
      product: "Los Alamos",
      workspaceVersion: 1,
      createdAt: now,
      updatedAt: now
    };
    await writeJson(paths.manifest, manifest);
  }
  await syncPublicProtocol(paths.root);

  return paths.root;
}

export async function createProject(input: CreateProjectInput): Promise<LongTailProject> {
  const root = await ensureWorkspace(input.workspaceRoot);
  const title = input.title.trim();
  const brief = input.brief.trim();
  if (!title) {
    throw new Error("项目标题不能为空。");
  }
  if (!brief) {
    throw new Error("项目事实不能为空。");
  }
  const now = new Date().toISOString();
  const analysisInput: AnalyzeProjectInput = {
    id: slugWithRandom(title),
    title,
    brief,
    now
  };
  const project = input.analyzer
    ? await input.analyzer(analysisInput)
    : analyzeProjectFast(analysisInput);

  const dir = projectDir(root, project.id);
  await mkdir(dir, { recursive: true });
  assertSafeId(project.id, "项目 ID");
  await writeTextAtomic(projectBriefPath(root, project.id), `${brief}\n`, {
    keepBackup: true
  });
  await writeJson(projectModelPath(root, project.id), project);
  await appendProjectEvent(root, {
    schemaVersion: "1",
    id: randomUUID(),
    projectId: project.id,
    kind: "project.created",
    at: now,
    actor: "app",
    summary: `创建项目“${project.title}”。`
  });
  await touchManifest(root);

  return project;
}

export async function listProjects(workspaceRoot?: string): Promise<LongTailProject[]> {
  const root = await ensureWorkspace(workspaceRoot);
  const paths = getWorkspacePaths(root);
  const entries = await readdir(paths.projects, { withFileTypes: true });
  const projects = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readProject(entry.name, root).catch(() => null))
  );

  return projects
    .filter((project): project is LongTailProject => project !== null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function readProject(projectId: string, workspaceRoot?: string): Promise<LongTailProject> {
  const root = await ensureWorkspace(workspaceRoot);
  const project = normalizeProject(
    await readJsonRecoverable<LongTailProject>(projectModelPath(root, projectId))
  );
  try {
    const brief = (await readFile(projectBriefPath(root, projectId), "utf8")).trim();
    return brief && brief !== project.brief ? { ...project, brief } : project;
  } catch {
    return project;
  }
}

export async function writeProject(project: LongTailProject, workspaceRoot?: string): Promise<void> {
  const root = await ensureWorkspace(workspaceRoot);
  await writeJson(projectModelPath(root, project.id), project);
}

export async function proposeSession(
  minutes: number,
  intensity: Intensity,
  workspaceRoot?: string
): Promise<ResidencySession | null> {
  const root = await ensureWorkspace(workspaceRoot);
  const sessions = await listSessions(root);
  const activeSession = sessions.find((session) => session.status === "active");
  if (activeSession) {
    return activeSession;
  }
  const proposedSession = sessions.find((session) => session.status === "proposed");
  if (proposedSession) {
    return proposedSession;
  }
  const projects = await listProjects(root);
  const proposal = proposeSessionTask({
    projects,
    minutes,
    intensity,
    now: new Date().toISOString(),
    makeId: () => randomUUID()
  });

  if (!proposal) {
    return null;
  }

  await writeJson(sessionPath(root, proposal.session.id), proposal.session);
  await appendProjectEvent(root, {
    schemaVersion: "1",
    id: randomUUID(),
    projectId: proposal.project.id,
    sessionId: proposal.session.id,
    kind: "session.proposed",
    at: proposal.session.startedAt,
    actor: "app",
    summary: `为 ${proposal.session.minutesPlanned} 分钟驻留分配“${proposal.session.taskTitle}”。`
  });
  await touchManifest(root);

  return proposal.session;
}

export async function startWorkspaceSession(
  sessionId: string,
  workspaceRoot?: string
): Promise<ResidencySession> {
  const root = await ensureWorkspace(workspaceRoot);
  const session = await readSession(sessionId, root);
  if (session.status === "active") {
    return session;
  }
  if (session.status !== "proposed") {
    throw new Error("只有待确认的驻留提案可以开始。");
  }

  const now = new Date().toISOString();
  const activeSession: ResidencySession = {
    ...session,
    status: "active",
    startedAt: now,
    updatedAt: now,
    updatedBy: "user",
    revision: session.revision + 1
  };
  await writeJson(sessionPath(root, session.id), activeSession);
  await appendProjectEvent(root, {
    schemaVersion: "1",
    id: randomUUID(),
    projectId: session.projectId,
    sessionId: session.id,
    kind: "session.started",
    at: now,
    actor: "user",
    summary: `确认驻留提案“${session.taskTitle}”。`
  });
  await touchManifest(root);
  return activeSession;
}

export async function cancelSessionProposal(
  sessionId: string,
  workspaceRoot?: string
): Promise<ResidencySession> {
  const root = await ensureWorkspace(workspaceRoot);
  const session = await readSession(sessionId, root);
  if (session.status !== "proposed") {
    throw new Error("只有待确认的驻留提案可以取消。");
  }

  const now = new Date().toISOString();
  const cancelledSession: ResidencySession = {
    ...session,
    status: "cancelled",
    endedAt: now,
    judgement: "提案未启动，约束已返回重新配置。",
    updatedAt: now,
    updatedBy: "user",
    revision: session.revision + 1
  };
  await writeJson(sessionPath(root, session.id), cancelledSession);
  await appendProjectEvent(root, {
    schemaVersion: "1",
    id: randomUUID(),
    projectId: session.projectId,
    sessionId: session.id,
    kind: "session.cancelled",
    at: now,
    actor: "user",
    summary: `放弃驻留提案“${session.taskTitle}”。`
  });
  await touchManifest(root);
  return cancelledSession;
}

export async function listSessions(workspaceRoot?: string): Promise<ResidencySession[]> {
  const root = await ensureWorkspace(workspaceRoot);
  const paths = getWorkspacePaths(root);
  const entries = await readdir(paths.sessions, { withFileTypes: true });
  const sessions = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) =>
        readJsonRecoverable<ResidencySession>(`${paths.sessions}/${entry.name}`)
          .then(normalizeSession)
          .catch(() => null)
      )
  );

  return sessions
    .filter((session): session is ResidencySession => session !== null)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

export async function readSession(sessionId: string, workspaceRoot?: string): Promise<ResidencySession> {
  const root = await ensureWorkspace(workspaceRoot);
  return normalizeSession(
    await readJsonRecoverable<ResidencySession>(sessionPath(root, sessionId))
  );
}

export async function updateProjectTask(input: UpdateTaskInput): Promise<LongTailProject> {
  const root = await ensureWorkspace(input.workspaceRoot);
  const project = await readProject(input.projectId, root);
  const task = project.taskGraph.tasks.find((candidate) => candidate.id === input.taskId);
  if (!task) {
    throw new Error(`任务“${input.taskId}”不存在。`);
  }
  assertTaskPatch(input.patch);

  const updatedTask = normalizeTaskPatch({ ...task, ...input.patch });
  const tasks = project.taskGraph.tasks.map((candidate) =>
    candidate.id === input.taskId ? updatedTask : candidate
  );
  assertValidTaskGraph(tasks);

  const now = new Date().toISOString();
  const updatedProject = refreshProjectProgress({
    ...project,
    taskGraph: { tasks },
    compact: `${updatedTask.title}：${taskStatusLabel(updatedTask.status)}。下一动作：${updatedTask.startAction}`,
    updatedAt: now,
    updatedBy: "app",
    revision: project.revision + 1
  });

  await writeProject(updatedProject, root);
  await appendProjectEvent(root, {
    schemaVersion: "1",
    id: randomUUID(),
    projectId: project.id,
    kind: "task.updated",
    at: now,
    actor: "app",
    summary: `将“${updatedTask.title}”更新为${taskStatusLabel(updatedTask.status)}。`
  });
  await touchManifest(root);

  return updatedProject;
}

export async function updateProjectBrief(input: UpdateProjectBriefInput): Promise<LongTailProject> {
  const root = await ensureWorkspace(input.workspaceRoot);
  const project = await readProject(input.projectId, root);
  const brief = input.brief.trim();
  if (!brief) {
    throw new Error("项目事实不能为空。");
  }

  const now = new Date().toISOString();
  const updatedProject: LongTailProject = {
    ...project,
    brief,
    currentState: brief.length > 220 ? `${brief.slice(0, 220)}...` : brief,
    compact: "项目事实已更新，任务图需要根据最新事实重新校准。",
    updatedAt: now,
    updatedBy: "user",
    revision: project.revision + 1
  };

  await writeTextAtomic(projectBriefPath(root, project.id), `${brief}\n`, {
    keepBackup: true
  });
  await writeProject(updatedProject, root);
  await appendProjectEvent(root, {
    schemaVersion: "1",
    id: randomUUID(),
    projectId: project.id,
    kind: "project.updated",
    at: now,
    actor: "user",
    summary: "更新项目事实。"
  });
  await touchManifest(root);
  return updatedProject;
}

export async function setProjectArchived(input: SetProjectArchivedInput): Promise<LongTailProject> {
  const root = await ensureWorkspace(input.workspaceRoot);
  const project = await readProject(input.projectId, root);
  if (
    input.archived &&
    (await listSessions(root)).some(
      (session) =>
        (session.status === "active" || session.status === "proposed") &&
        session.projectId === project.id
    )
  ) {
    throw new Error("进行中的驻留结束前不能归档该项目。");
  }
  const now = new Date().toISOString();
  const updatedProject: LongTailProject = {
    ...project,
    archivedAt: input.archived ? now : undefined,
    updatedAt: now,
    updatedBy: "user",
    revision: project.revision + 1
  };

  await writeProject(updatedProject, root);
  await appendProjectEvent(root, {
    schemaVersion: "1",
    id: randomUUID(),
    projectId: project.id,
    kind: input.archived ? "project.archived" : "project.restored",
    at: now,
    actor: "user",
    summary: input.archived ? "归档项目。" : "恢复项目。"
  });
  await touchManifest(root);
  return updatedProject;
}

export async function reanalyzeProject(input: ReanalyzeProjectInput): Promise<LongTailProject> {
  const root = await ensureWorkspace(input.workspaceRoot);
  const current = await readProject(input.projectId, root);
  const now = new Date().toISOString();
  const analysisInput: AnalyzeProjectInput = {
    id: current.id,
    title: current.title,
    brief: current.brief,
    now
  };
  const analysis = input.analyzer
    ? await input.analyzer(analysisInput)
    : analyzeProjectFast(analysisInput);
  const updated = refreshProjectProgress({
    ...analysis,
    id: current.id,
    taskGraph: {
      tasks: mergeReanalyzedTasks(current.taskGraph.tasks, analysis.taskGraph.tasks)
    },
    createdAt: current.createdAt,
    updatedAt: now,
    updatedBy: analysis.updatedBy,
    revision: current.revision + 1,
    archivedAt: current.archivedAt
  });

  await writeProject(updated, root);
  await appendProjectEvent(root, {
    schemaVersion: "1",
    id: randomUUID(),
    projectId: current.id,
    kind: "project.updated",
    at: now,
    actor: analysis.updatedBy === "llm" ? "llm" : "app",
    summary: `重建任务图，共 ${updated.taskGraph.tasks.length} 个任务。`
  });
  await touchManifest(root);
  return updated;
}

export async function closeWorkspaceSession(input: CloseWorkspaceSessionInput): Promise<ResidencySession> {
  const root = await ensureWorkspace(input.workspaceRoot);
  assertSessionResult(input.result);
  const session = await readSession(input.sessionId, root);
  if (session.status === "closed") {
    throw new Error(`驻留“${input.sessionId}”已经关闭，不能重复提交结果。`);
  }
  if (session.status !== "active") {
    throw new Error(`驻留“${input.sessionId}”不在进行中，不能提交结果。`);
  }
  const project = await readProject(session.projectId, root);
  const assessment = input.assessor
    ? await input.assessor({
        project,
        session,
        result: input.result,
        note: input.note
      })
    : undefined;
  const output = closeSession({
    project,
    session,
    result: input.result,
    note: input.note,
    now: new Date().toISOString(),
    assessment
  });

  await writeProject(output.project, root);
  await writeJson(sessionPath(root, output.session.id), output.session);
  await appendProjectEvent(root, {
    schemaVersion: "1",
    id: randomUUID(),
    projectId: output.project.id,
    sessionId: output.session.id,
    kind: "session.closed",
    at: output.session.endedAt ?? output.session.updatedAt,
    actor: "app",
    summary: output.summary
  });
  await touchManifest(root);

  return output.session;
}

export async function inspectWorkspace(workspaceRoot?: string): Promise<WorkspaceHealth> {
  const root = await ensureWorkspace(workspaceRoot);
  const paths = getWorkspacePaths(root);
  const issues: WorkspaceHealthIssue[] = [];
  let backupCount = 0;

  const projectEntries = await readdir(paths.projects, { withFileTypes: true });
  const projectIds = new Set(
    projectEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  );
  for (const projectId of projectIds) {
    const modelPath = projectModelPath(root, projectId);
    const result = await inspectJsonFile(modelPath);
    backupCount += result.hasBackup ? 1 : 0;
    if (result.issue) issues.push(result.issue);
    if (!(await exists(projectBriefPath(root, projectId)))) {
      issues.push({
        severity: "warning",
        code: "missing_project_brief",
        message: `项目“${projectId}”缺少 brief.md。`,
        path: projectBriefPath(root, projectId)
      });
    }
  }

  const sessionEntries = await readdir(paths.sessions, { withFileTypes: true });
  const sessionFiles = sessionEntries.filter(
    (entry) => entry.isFile() && entry.name.endsWith(".json")
  );
  let activeSessions = 0;
  let proposedSessions = 0;
  for (const entry of sessionFiles) {
    const path = join(paths.sessions, entry.name);
    const result = await inspectJsonFile(path);
    backupCount += result.hasBackup ? 1 : 0;
    if (result.issue) {
      issues.push(result.issue);
      continue;
    }
    try {
      const session = await readJson<ResidencySession>(path);
      if (session.status === "active") activeSessions += 1;
      if (session.status === "proposed") proposedSessions += 1;
      if (!projectIds.has(session.projectId)) {
        issues.push({
          severity: "warning",
          code: "orphan_session",
          message: `驻留“${session.id}”引用了不存在的项目。`,
          path
        });
      }
    } catch {
      // The parse failure is already represented by inspectJsonFile.
    }
  }
  if (activeSessions > 1) {
    issues.push({
      severity: "error",
      code: "multiple_active_sessions",
      message: `检测到 ${activeSessions} 个同时进行的驻留。`,
      path: paths.sessions
    });
  }
  if (proposedSessions > 1) {
    issues.push({
      severity: "error",
      code: "multiple_session_proposals",
      message: `检测到 ${proposedSessions} 个待确认的驻留提案。`,
      path: paths.sessions
    });
  }

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    checkedAt: new Date().toISOString(),
    projectCount: projectIds.size,
    sessionCount: sessionFiles.length,
    backupCount,
    issues
  };
}

export async function appendProjectEvent(root: string, event: ProjectEvent): Promise<void> {
  await mkdir(dirname(projectEventsPath(root, event.projectId)), { recursive: true });
  await appendFile(projectEventsPath(root, event.projectId), `${JSON.stringify(event)}\n`, "utf8");
}

export async function requestOpen(payload: unknown, workspaceRoot?: string): Promise<void> {
  const root = await ensureWorkspace(workspaceRoot);
  const paths = getWorkspacePaths(root);
  await writeJson(paths.openRequest, {
    at: new Date().toISOString(),
    payload
  });
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readJsonRecoverable<T>(path: string): Promise<T> {
  try {
    return await readJson<T>(path);
  } catch (primaryError) {
    try {
      return await readJson<T>(`${path}.bak`);
    } catch {
      throw primaryError;
    }
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`, {
    keepBackup: true,
    validateJsonBackup: true
  });
}

async function writeTextAtomic(
  path: string,
  content: string,
  options: { keepBackup?: boolean; validateJsonBackup?: boolean } = {}
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, content, { encoding: "utf8", flag: "wx" });
    if (options.keepBackup && (await exists(path))) {
      try {
        if (options.validateJsonBackup) {
          JSON.parse(await readFile(path, "utf8"));
        }
        await copyFile(path, `${path}.bak`);
      } catch {
        // Preserve the previous valid backup when the primary file is already damaged.
      }
    }
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function slugWithRandom(title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 36) || "project";
  return `${slug}-${randomUUID().slice(0, 8)}`;
}

async function syncPublicProtocol(workspaceRoot: string): Promise<void> {
  const sourceRoot = process.env.LOS_ALAMOS_PROTOCOL_ROOT ?? process.cwd();
  const protocolFiles = [
    "README.md",
    "AGENTS.md",
    "CLAUDE.md",
    "skills/los-alamos-residency/SKILL.md",
    ".trae/skills/los-alamos-residency/SKILL.md"
  ];
  for (const relativePath of protocolFiles) {
    const source = join(sourceRoot, relativePath);
    if (await exists(source)) {
      const target = join(workspaceRoot, relativePath);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target);
    }
  }

  const schemaNames = [
    "project.schema.json",
    "session.schema.json",
    "event.schema.json",
    "agent-context.schema.json"
  ];
  const targetSchemaDir = join(workspaceRoot, "schemas");
  await mkdir(targetSchemaDir, { recursive: true });
  for (const schemaName of schemaNames) {
    const source = join(sourceRoot, "schemas", schemaName);
    if (await exists(source)) {
      await copyFile(source, join(targetSchemaDir, schemaName));
    }
  }

  const agentRuntimeRoots = [
    join(sourceRoot, "agent"),
    join(sourceRoot, "out", "agent")
  ];
  for (const runtimeRoot of agentRuntimeRoots) {
    const cliSource = join(runtimeRoot, "los.mjs");
    const packageSource = join(runtimeRoot, "package.json");
    if (!(await exists(cliSource)) || !(await exists(packageSource))) continue;
    const cliTarget = join(workspaceRoot, ".los", "los.mjs");
    await mkdir(dirname(cliTarget), { recursive: true });
    await copyFile(cliSource, cliTarget);
    await copyFile(packageSource, join(workspaceRoot, "package.json"));
    break;
  }

  if (await exists(join(workspaceRoot, ".los", "los.mjs"))) {
    const runtime = process.execPath.replace(/'/g, "'\\''");
    const desktopArgument = process.env.LOS_ALAMOS_PROTOCOL_ROOT
      ? ""
      : process.cwd().replace(/'/g, "'\\''");
    const launcher = `#!/bin/sh
set -eu
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export LOS_ALAMOS_DESKTOP_EXECUTABLE='${runtime}'
export LOS_ALAMOS_DESKTOP_ARGUMENT='${desktopArgument}'
if command -v node >/dev/null 2>&1; then
  exec node "$SCRIPT_DIR/los.mjs" "$@"
fi
if [ -x '${runtime}' ]; then
  export ELECTRON_RUN_AS_NODE=1
  exec '${runtime}' "$SCRIPT_DIR/los.mjs" "$@"
fi
printf '%s\\n' "Los Alamos requires Node.js or the Los Alamos desktop app." >&2
exit 127
`;
    const windowsLauncher = `@echo off
setlocal
set "LOS_ALAMOS_DESKTOP_EXECUTABLE=${process.execPath}"
set "LOS_ALAMOS_DESKTOP_ARGUMENT=${process.env.LOS_ALAMOS_PROTOCOL_ROOT ? "" : process.cwd()}"
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  node "%~dp0los.mjs" %*
  exit /b %ERRORLEVEL%
)
set ELECTRON_RUN_AS_NODE=1
"${process.execPath}" "%~dp0los.mjs" %*
`;
    const launcherPath = join(workspaceRoot, ".los", "los");
    await writeFile(launcherPath, launcher, "utf8");
    await chmod(launcherPath, 0o755);
    await writeFile(join(workspaceRoot, ".los", "los.cmd"), windowsLauncher, "utf8");
  }
}

async function touchManifest(root: string): Promise<void> {
  const paths = getWorkspacePaths(root);
  const current = await readJsonRecoverable<WorkspaceManifest>(paths.manifest);
  await writeJson(paths.manifest, {
    ...current,
    updatedAt: new Date().toISOString()
  });
}

async function inspectJsonFile(path: string): Promise<{
  hasBackup: boolean;
  issue?: WorkspaceHealthIssue;
}> {
  const hasBackup = await exists(`${path}.bak`);
  try {
    JSON.parse(await readFile(path, "utf8"));
    return { hasBackup };
  } catch {
    if (hasBackup) {
      try {
        JSON.parse(await readFile(`${path}.bak`, "utf8"));
        return {
          hasBackup,
          issue: {
            severity: "warning",
            code: "recoverable_json",
            message: "主文件损坏，但存在可读取的备份。",
            path
          }
        };
      } catch {
        // Fall through to the unrecoverable issue.
      }
    }
    return {
      hasBackup,
      issue: {
        severity: "error",
        code: "invalid_json",
        message: "文件无法解析，且没有有效备份。",
        path
      }
    };
  }
}

function normalizeSession(session: ResidencySession): ResidencySession {
  return {
    ...session,
    scope: session.scope ?? "full_task",
    selectionReason:
      session.selectionReason ??
      "符合本轮时间与强度约束，是当前未阻塞任务中的优先入口。"
  };
}

function normalizeTaskPatch(task: WorkUnit): WorkUnit {
  const progressPercent =
    task.status === "done"
      ? 100
      : Math.min(100, Math.max(0, Math.round(task.progressPercent ?? 0)));
  const status =
    progressPercent >= 100
      ? "done"
      : progressPercent > 0 && task.status === "todo"
        ? "in_progress"
        : task.status;
  return {
    ...task,
    status,
    title: task.title.trim(),
    description: task.description.trim(),
    dependsOn: [...new Set(task.dependsOn)],
    effortMinutes: Math.max(1, Math.round(task.effortMinutes)),
    weight: Math.max(0, task.weight),
    progressPercent,
    completionCriteria: task.completionCriteria.trim(),
    startAction: task.startAction.trim(),
    notDoing: task.notDoing.trim()
  };
}

function assertTaskPatch(patch: UpdateTaskInput["patch"]): void {
  if (
    patch.status !== undefined &&
    !["todo", "in_progress", "done", "parked", "killed", "unknown"].includes(
      patch.status
    )
  ) {
    throw new Error("任务状态无效。");
  }
  if (
    patch.intensity !== undefined &&
    !["low", "medium", "high", "xhigh"].includes(patch.intensity)
  ) {
    throw new Error("任务强度无效。");
  }
}

function assertSessionResult(result: SessionResult): void {
  if (!["completed", "partial", "not_completed"].includes(result)) {
    throw new Error("驻留结果必须是 completed、partial 或 not_completed。");
  }
}

function mergeReanalyzedTasks(previousTasks: WorkUnit[], nextTasks: WorkUnit[]): WorkUnit[] {
  const previousById = new Map(previousTasks.map((task) => [task.id, task]));
  const previousByTitle = new Map(
    previousTasks.map((task) => [normalizeMatchKey(task.title), task])
  );
  return nextTasks.map((task) => {
    const previous =
      previousById.get(task.id) ?? previousByTitle.get(normalizeMatchKey(task.title));
    if (!previous) {
      return task;
    }
    return {
      ...task,
      status: previous.status,
      progressPercent: previous.progressPercent,
      notes: previous.notes
    };
  });
}

function normalizeMatchKey(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function normalizeProject(project: LongTailProject): LongTailProject {
  return refreshProjectProgress({
    ...project,
    taskGraph: {
      tasks: project.taskGraph.tasks.map((task) =>
        normalizeTaskPatch({
          ...task,
          progressPercent:
            typeof task.progressPercent === "number"
              ? task.progressPercent
              : task.status === "done"
                ? 100
                : 0
        })
      )
    }
  });
}

function assertValidTaskGraph(tasks: WorkUnit[]): void {
  const ids = new Set(tasks.map((task) => task.id));
  for (const task of tasks) {
    if (!task.title) {
      throw new Error("任务标题不能为空。");
    }
    if (task.dependsOn.includes(task.id)) {
      throw new Error("任务不能依赖自身。");
    }
    if (task.dependsOn.some((dependencyId) => !ids.has(dependencyId))) {
      throw new Error(`任务“${task.title}”包含未知依赖。`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visit = (taskId: string): void => {
    if (visiting.has(taskId)) {
      throw new Error("任务依赖不能形成循环。");
    }
    if (visited.has(taskId)) {
      return;
    }
    visiting.add(taskId);
    for (const dependencyId of byId.get(taskId)?.dependsOn ?? []) {
      visit(dependencyId);
    }
    visiting.delete(taskId);
    visited.add(taskId);
  };

  for (const task of tasks) {
    visit(task.id);
  }
}

function taskStatusLabel(status: WorkUnit["status"]): string {
  const labels: Record<WorkUnit["status"], string> = {
    todo: "待办",
    in_progress: "进行中",
    done: "已完成",
    parked: "已暂停",
    killed: "已终止",
    unknown: "待确认"
  };
  return labels[status];
}
