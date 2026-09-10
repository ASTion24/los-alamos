import { createHash, randomUUID } from "node:crypto";
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
  projectCapsule,
  projectIsAvailable,
  sessionElapsedSeconds,
  validateCapsule,
  validateDate,
  localDate,
  planMinutesUsed,
  canUseIntensity,
  isDependencyOpen,
  INTENSITIES,
  validateCaptureText,
  type AttentionCapture,
  type CaptureConversion,
  type FocusConstraints,
  type FocusPreview,
  type ContextCapsule,
  type ProjectIntake,
  type ProjectOutcome,
  type ResidencyPlan,
  type PlanDraft,
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
import { withWorkspaceLock } from "./lock";

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
  intake?: ProjectIntake;
  workspaceRoot?: string;
  analyzer?: (input: AnalyzeProjectInput) => Promise<LongTailProject>;
}

export interface CloseWorkspaceSessionInput {
  sessionId: string;
  result: SessionResult;
  note?: string;
  handoff?: ContextCapsule;
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
  intake?: ProjectIntake;
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
  await mkdir(paths.plans, { recursive: true });
  await mkdir(paths.inbox, { recursive: true });
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

async function createProjectUnlocked(input: CreateProjectInput, fixedId?: string): Promise<LongTailProject> {
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
    id: fixedId ?? slugWithRandom(title),
    title,
    brief,
    intake: input.intake ? validateIntake(input.intake) : undefined,
    now
  };
  const project = input.analyzer
    ? await input.analyzer(analysisInput)
    : analyzeProjectFast(analysisInput);

  const dir = projectDir(root, project.id);
  await mkdir(dir, { recursive: true });
  assertSafeId(project.id, "项目 ID");
  await writeTextAtomic(projectBriefPath(root, project.id), serializeBrief(brief, analysisInput.intake), {
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
    const facts = parseBrief(await readFile(projectBriefPath(root, projectId), "utf8"));
    if (facts.brief && (facts.brief !== project.brief || JSON.stringify(facts.intake) !== JSON.stringify(project.intake))) {
      return {
        ...project, ...facts, intake: facts.intake, modelNeedsReview: true,
        currentState: facts.brief,
        capsule: { ...projectCapsule(project), summary: facts.brief, nextAction: "", taskId: undefined,
          blocker: "项目事实已更新，任务图待校准。" }
      };
    }
    return project;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return project;
    throw error;
  }
}

export async function writeProject(project: LongTailProject, workspaceRoot?: string): Promise<void> {
  const root = await ensureWorkspace(workspaceRoot);
  await writeJson(projectModelPath(root, project.id), project);
}

async function proposeSessionUnlocked(
  minutes: number,
  intensity: Intensity,
  workspaceRoot?: string,
  projectId?: string
): Promise<ResidencySession | null> {
  const root = await ensureWorkspace(workspaceRoot);
  const sessions = await listSessions(root);
  const activeSession = sessions.find((session) => ["active", "paused"].includes(session.status));
  if (activeSession) {
    return activeSession;
  }
  const proposedSession = sessions.find((session) => session.status === "proposed");
  if (proposedSession) {
    return proposedSession;
  }
  let projects = await listProjects(root);
  if (projectId) {
    const selected = await readProject(projectId, root);
    if (!projectIsAvailable(selected)) throw new Error("该项目已收起或归档，请先恢复。");
  }
  const plan = (await listPlans(root)).find((item) => item.status === "active");
  if (plan) {
    assertPlanSession(plan, sessions, minutes, intensity, projectId);
    projects = projects.filter((project) => plan.projectIds.includes(project.id));
  }
  const proposal = proposeSessionTask({
    projects,
    minutes,
    intensity,
    projectId,
    now: new Date().toISOString(),
    makeId: () => randomUUID()
  });

  if (!proposal) {
    return null;
  }
  proposal.session.planId = plan?.id;
  proposal.session.workDate = localDate();
  if (plan) proposal.session.notDoing = `${proposal.session.notDoing}\n${plan.notDoing}`;

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

async function startWorkspaceSessionUnlocked(
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
  await assertSessionCanStart(root, session);

  const now = new Date().toISOString();
  const activeSession: ResidencySession = {
    ...session,
    status: "active",
    startedAt: now,
    lastResumedAt: now,
    heartbeatAt: now,
    elapsedSeconds: 0,
    workDate: localDate(),
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

async function cancelSessionProposalUnlocked(
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

async function updateProjectTaskUnlocked(input: UpdateTaskInput): Promise<LongTailProject> {
  const root = await ensureWorkspace(input.workspaceRoot);
  await assertProjectIdle(root, input.projectId);
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
    capsule: project.capsule?.taskId === updatedTask.id ? {
      ...project.capsule,
      nextAction: updatedTask.status === "done" ? "" : input.patch.startAction ?? project.capsule.nextAction,
      notDoing: input.patch.notDoing ?? project.capsule.notDoing,
      updatedAt: now
    } : project.capsule,
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

async function updateProjectBriefUnlocked(input: UpdateProjectBriefInput): Promise<LongTailProject> {
  const root = await ensureWorkspace(input.workspaceRoot);
  await assertProjectIdle(root, input.projectId);
  const project = await readProject(input.projectId, root);
  const brief = input.brief.trim();
  if (!brief) {
    throw new Error("项目事实不能为空。");
  }

  const now = new Date().toISOString();
  const intake = input.intake ? validateIntake(input.intake) : undefined;
  const updatedProject: LongTailProject = {
    ...project,
    brief,
    intake,
    modelNeedsReview: true,
    capsule: { ...projectCapsule(project), summary: intake?.completed || brief,
      taskId: undefined, nextAction: "", blocker: "项目事实已更新，任务图待校准。", updatedAt: now },
    closeCriteria: intake?.closeCriteria.trim() ? [intake.closeCriteria.trim()] : project.closeCriteria,
    currentState: brief.length > 220 ? `${brief.slice(0, 220)}...` : brief,
    compact: "项目事实已更新，任务图需要根据最新事实重新校准。",
    updatedAt: now,
    updatedBy: "user",
    revision: project.revision + 1
  };

  await writeTextAtomic(projectBriefPath(root, project.id), serializeBrief(brief, intake), {
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

async function setProjectArchivedUnlocked(input: SetProjectArchivedInput): Promise<LongTailProject> {
  const root = await ensureWorkspace(input.workspaceRoot);
  const project = await readProject(input.projectId, root);
  if (
    input.archived &&
    (await listSessions(root)).some(
      (session) =>
        (["active", "paused", "proposed"].includes(session.status)) &&
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

async function reanalyzeProjectUnlocked(input: ReanalyzeProjectInput): Promise<LongTailProject> {
  const root = await ensureWorkspace(input.workspaceRoot);
  await assertProjectIdle(root, input.projectId);
  const current = await readProject(input.projectId, root);
  const now = new Date().toISOString();
  const analysisInput: AnalyzeProjectInput = {
    id: current.id,
    title: current.title,
    brief: current.brief,
    intake: current.intake,
    context: projectCapsule(current),
    now
  };
  if (!input.analyzer && !current.intake?.remaining.trim() && current.taskGraph.tasks.some((task) => task.weight > 0)) {
    throw new Error("本地重建需要明确的剩余工作，原任务图已保留。");
  }
  const analysis = input.analyzer
    ? await input.analyzer(analysisInput)
    : analyzeProjectFast(analysisInput);
  const previousTitle = current.taskGraph.tasks.find((task) => task.id === current.capsule?.taskId)?.title;
  const reboundTask = analysis.taskGraph.tasks.find((task) => task.title === previousTitle);
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
    archivedAt: current.archivedAt,
    resolution: current.resolution,
    modelNeedsReview: false,
    compact: current.capsule?.summary ?? analysis.compact,
    currentState: current.capsule?.summary ?? analysis.currentState,
    capsule: current.modelNeedsReview ? analysis.capsule : current.capsule ? {
      ...current.capsule, taskId: reboundTask?.id,
      nextAction: reboundTask ? current.capsule.nextAction : ""
    } : analysis.capsule
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

async function closeWorkspaceSessionUnlocked(input: CloseWorkspaceSessionInput): Promise<ResidencySession> {
  const root = await ensureWorkspace(input.workspaceRoot);
  assertSessionResult(input.result);
  const session = await readSession(input.sessionId, root);
  if (session.status === "closed") {
    throw new Error(`驻留“${input.sessionId}”已经关闭，不能重复提交结果。`);
  }
  if (!["active", "paused"].includes(session.status)) {
    throw new Error(`驻留“${input.sessionId}”不在进行中，不能提交结果。`);
  }
  const project = await readProject(session.projectId, root);
  const handoff = input.handoff ? validateCapsule(input.handoff) : undefined;
  if (handoff?.taskId && !project.taskGraph.tasks.some((task) => task.id === handoff.taskId)) {
    throw new Error("交接引用了不存在的任务。");
  }
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
    assessment,
    handoff
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
    if (!result.issue) {
      try {
        const project = await readProject(projectId, root);
        assertValidTaskGraph(project.taskGraph.tasks);
      } catch (error) {
        issues.push({ severity: "error", code: "invalid_task_graph", path: modelPath,
          message: error instanceof Error ? error.message : String(error) });
      }
    }
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
      if (["active", "paused"].includes(session.status)) activeSessions += 1;
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
  if (activeSessions && proposedSessions) {
    issues.push({ severity: "error", code: "conflicting_sessions", message: "存在尚未结束的驻留及另一份提案。", path: paths.sessions });
  }
  let openPlans = 0;
  for (const file of (await readdir(paths.plans)).filter((file) => file.endsWith(".json"))) {
    const path = join(paths.plans, file);
    const result = await inspectJsonFile(path);
    backupCount += result.hasBackup ? 1 : 0;
    if (result.issue) issues.push(result.issue);
    if (!result.issue) {
      const plan = await readJson<ResidencyPlan>(path);
      try {
        validateDate(plan.startDate, "开始日期");
        validateDate(plan.endDate, "结束日期");
        if (!["draft", "committed", "active", "closed"].includes(plan.status) ||
          !Array.isArray(plan.projectIds) || plan.projectIds.some((id) => !projectIds.has(id))) throw new Error("计划状态或项目引用无效。");
        if (plan.status !== "closed") openPlans += 1;
      } catch (error) {
        issues.push({ severity: "error", code: "invalid_plan", path,
          message: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  if (openPlans > 1) issues.push({ severity: "error", code: "multiple_open_plans", path: paths.plans, message: "存在多个未结束的驻留计划。" });
  for (const file of (await readdir(paths.inbox)).filter((name) => name.endsWith(".json"))) {
    const path = join(paths.inbox, file);
    const result = await inspectJsonFile(path);
    backupCount += result.hasBackup ? 1 : 0;
    if (result.issue) issues.push(result.issue);
    try {
      const capture = await readJsonRecoverable<AttentionCapture>(path);
      validateCaptureText(capture.text);
      if (!["inbox", "shelved", "converted"].includes(capture.status)) throw new Error("收纳状态无效。");
      if (capture.status === "converted" && (!capture.projectId || !projectIds.has(capture.projectId))) throw new Error("收纳事项引用的项目不存在。");
    } catch (error) {
      issues.push({ severity: "error", code: "invalid_capture", path, message: String(error) });
    }
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
    "CHANGELOG.md",
    "docs/assets/attention-launcher.png",
    "docs/continuity-acceptance.md",
    "docs/launcher-acceptance.md",
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
    "capsule.schema.json",
    "plan.schema.json",
    "capture.schema.json",
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
    const desktopExecutable =
      process.env.APPIMAGE || process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    const runtime = desktopExecutable.replace(/'/g, "'\\''");
    const desktopArgument = process.env.LOS_ALAMOS_PROTOCOL_ROOT
      ? ""
      : process.cwd().replace(/'/g, "'\\''");
    const windowsRuntimeInvocation = process.env.PORTABLE_EXECUTABLE_FILE
      ? `set "LOS_ALAMOS_CLI_OUTPUT=%TEMP%\\los-alamos-cli-%RANDOM%-%RANDOM%.txt"
set ELECTRON_RUN_AS_NODE=1
"${desktopExecutable}" "%~dp0los.mjs" %*
set "LOS_ALAMOS_CLI_EXIT=%ERRORLEVEL%"
if exist "%LOS_ALAMOS_CLI_OUTPUT%" type "%LOS_ALAMOS_CLI_OUTPUT%"
if exist "%LOS_ALAMOS_CLI_OUTPUT%" del /q "%LOS_ALAMOS_CLI_OUTPUT%"
exit /b %LOS_ALAMOS_CLI_EXIT%`
      : `set ELECTRON_RUN_AS_NODE=1
"${desktopExecutable}" "%~dp0los.mjs" %*
exit /b %ERRORLEVEL%`;
    const launcher = `#!/bin/sh
set -eu
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export LOS_ALAMOS_DESKTOP_EXECUTABLE='${runtime}'
export LOS_ALAMOS_DESKTOP_ARGUMENT='${desktopArgument}'
if [ "\${LOS_ALAMOS_FORCE_DESKTOP_RUNTIME:-}" != "1" ] && command -v node >/dev/null 2>&1; then
  exec node "$SCRIPT_DIR/los.mjs" "$@"
fi
case "$LOS_ALAMOS_DESKTOP_EXECUTABLE" in
  *.AppImage)
    cache_base="\${XDG_CACHE_HOME:-\${HOME:-/tmp}/.cache}"
    signature="$(ls -dn "$LOS_ALAMOS_DESKTOP_EXECUTABLE" | cksum | cut -d ' ' -f 1)"
    runtime_dir="$cache_base/los-alamos/appimage-$signature"
    runtime_binary="$runtime_dir/los-alamos"
    if [ ! -x "$runtime_binary" ]; then
      temporary_dir="$(mktemp -d "\${TMPDIR:-/tmp}/los-alamos-appimage.XXXXXX")"
      trap 'rm -rf "$temporary_dir"' EXIT HUP INT TERM
      (
        cd "$temporary_dir"
        "$LOS_ALAMOS_DESKTOP_EXECUTABLE" --appimage-extract >/dev/null
      )
      mkdir -p "$(dirname "$runtime_dir")"
      if [ ! -d "$runtime_dir" ]; then
        mv "$temporary_dir/squashfs-root" "$runtime_dir"
      fi
      rm -rf "$temporary_dir"
      trap - EXIT HUP INT TERM
    fi
    export ELECTRON_RUN_AS_NODE=1
    exec "$runtime_binary" "$SCRIPT_DIR/los.mjs" "$@"
    ;;
  *)
    if [ -x "$LOS_ALAMOS_DESKTOP_EXECUTABLE" ]; then
      export ELECTRON_RUN_AS_NODE=1
      exec "$LOS_ALAMOS_DESKTOP_EXECUTABLE" "$SCRIPT_DIR/los.mjs" "$@"
    fi
    ;;
esac
printf '%s\\n' "Los Alamos requires Node.js or the Los Alamos desktop app." >&2
exit 127
`;
    const windowsLauncher = `@echo off
setlocal
set "LOS_ALAMOS_DESKTOP_EXECUTABLE=${desktopExecutable}"
set "LOS_ALAMOS_DESKTOP_ARGUMENT=${process.env.LOS_ALAMOS_PROTOCOL_ROOT ? "" : process.cwd()}"
if not "%LOS_ALAMOS_FORCE_DESKTOP_RUNTIME%"=="1" (
  where node >nul 2>nul
  if not errorlevel 1 (
    node "%~dp0los.mjs" %*
    exit /b
  )
)
${windowsRuntimeInvocation}
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
  for (const key of ["effortMinutes", "weight", "progressPercent"] as const) {
    if (patch[key] !== undefined && (!Number.isFinite(patch[key]) || patch[key]! < (key === "effortMinutes" ? 1 : 0) ||
      (key === "progressPercent" && patch[key]! > 100))) throw new Error("任务数值无效。");
  }
  if (patch.dependsOn !== undefined && (!Array.isArray(patch.dependsOn) ||
    patch.dependsOn.some((id) => typeof id !== "string"))) throw new Error("依赖格式无效。");
  for (const key of ["title", "description", "startAction", "completionCriteria", "notDoing", "notes"] as const) {
    if (patch[key] !== undefined && typeof patch[key] !== "string") throw new Error("任务文本无效。");
  }
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
  const previousByTitle = new Map(
    previousTasks.map((task) => [normalizeMatchKey(task.title), task])
  );
  return nextTasks.map((task) => {
    const previous = previousByTitle.get(normalizeMatchKey(task.title));
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
  if (ids.size !== tasks.length) throw new Error("任务 ID 不能重复。");
  for (const task of tasks) {
    assertTaskPatch(task);
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

export const createProject = (input: CreateProjectInput) =>
  withWorkspaceLock(input.workspaceRoot, () => createProjectUnlocked(input));
export const proposeSession = (minutes: number, intensity: Intensity, root?: string, projectId?: string) =>
  withWorkspaceLock(root, () => proposeSessionUnlocked(minutes, intensity, root, projectId));
export const startWorkspaceSession = (id: string, root?: string) =>
  withWorkspaceLock(root, () => startWorkspaceSessionUnlocked(id, root));
export const cancelSessionProposal = (id: string, root?: string) =>
  withWorkspaceLock(root, () => cancelSessionProposalUnlocked(id, root));
export const updateProjectTask = (input: UpdateTaskInput) =>
  withWorkspaceLock(input.workspaceRoot, () => updateProjectTaskUnlocked(input));
export const updateProjectBrief = (input: UpdateProjectBriefInput) =>
  withWorkspaceLock(input.workspaceRoot, () => updateProjectBriefUnlocked(input));
export const setProjectArchived = (input: SetProjectArchivedInput) =>
  withWorkspaceLock(input.workspaceRoot, () => setProjectArchivedUnlocked(input));
export const reanalyzeProject = (input: ReanalyzeProjectInput) =>
  withWorkspaceLock(input.workspaceRoot, () => reanalyzeProjectUnlocked(input));
export const closeWorkspaceSession = (input: CloseWorkspaceSessionInput) =>
  withWorkspaceLock(input.workspaceRoot, () => closeWorkspaceSessionUnlocked(input));

export function reviseProposal(input: {
  id: string; startAction: string; completionCriteria: string; notDoing: string; workspaceRoot?: string;
}): Promise<ResidencySession> {
  return withWorkspaceLock(input.workspaceRoot, async () => {
    const root = await ensureWorkspace(input.workspaceRoot);
    const session = await readSession(input.id, root);
    if (session.status !== "proposed") throw new Error("只有待确认提案可以调整边界。");
    if (![input.startAction, input.completionCriteria, input.notDoing].every((text) => typeof text === "string" && text.trim())) {
      throw new Error("开始动作、完成标准和不做边界不能为空。");
    }
    const updated: ResidencySession = {
      ...session, startAction: input.startAction.trim(), completionCriteria: input.completionCriteria.trim(),
      notDoing: input.notDoing.trim(), updatedAt: new Date().toISOString(), updatedBy: "user", revision: session.revision + 1
    };
    await writeJson(sessionPath(root, input.id), updated);
    await appendProjectEvent(root, { schemaVersion: "1", id: randomUUID(), projectId: session.projectId,
      sessionId: session.id, kind: "session.proposed", at: updated.updatedAt, actor: "user", summary: "校准驻留边界。" });
    return updated;
  });
}

function validateIntake(input: ProjectIntake): ProjectIntake {
  for (const key of ["completed", "remaining", "closeCriteria"] as const) {
    if (typeof input[key] !== "string" || input[key].length > 20_000) throw new Error("收尾事实无效。");
  }
  if (input.remaining.split("\n").filter((line) => line.trim()).length > 50) {
    throw new Error("请将本次收尾范围收敛到 50 个动作以内。");
  }
  if (input.progressEstimate !== undefined &&
    (!Number.isFinite(input.progressEstimate) || input.progressEstimate < 0 || input.progressEstimate > 100)) {
    throw new Error("自述进度必须在 0-100 之间。");
  }
  return {
    completed: input.completed.trim(), remaining: input.remaining.trim(),
    closeCriteria: input.closeCriteria.trim(), progressEstimate: input.progressEstimate
  };
}

const intakeMarker = "\n\n<!-- los-alamos:intake -->\n";
function serializeBrief(brief: string, intake?: ProjectIntake): string {
  return intake
    ? `${brief.trim()}${intakeMarker}\`\`\`json\n${JSON.stringify(intake, null, 2)}\n\`\`\`\n`
    : `${brief.trim()}\n`;
}

function parseBrief(content: string): { brief: string; intake?: ProjectIntake } {
  const marker = content.lastIndexOf(intakeMarker);
  if (marker < 0) return { brief: content.trim() };
  const block = content.slice(marker + intakeMarker.length).trim();
  if (!block.startsWith("```json\n") || !block.endsWith("\n```")) throw new Error("brief.md 中的收尾事实格式无效。");
  return {
    brief: content.slice(0, marker).trim(),
    intake: validateIntake(JSON.parse(block.slice(8, -4)))
  };
}

async function assertProjectIdle(root: string, projectId: string): Promise<void> {
  if ((await listSessions(root)).some((session) =>
    session.projectId === projectId && ["active", "paused", "proposed"].includes(session.status))) {
    throw new Error("请先结束、取消或记录当前驻留，再修改项目。");
  }
}

export function updateProjectCapsule(input: {
  projectId: string; capsule: ContextCapsule; workspaceRoot?: string;
}): Promise<LongTailProject> {
  return withWorkspaceLock(input.workspaceRoot, async () => {
    const root = await ensureWorkspace(input.workspaceRoot);
    await assertProjectIdle(root, input.projectId);
    const project = await readProject(input.projectId, root);
    const capsule = validateCapsule(input.capsule);
    if (capsule.taskId && !project.taskGraph.tasks.some((task) => task.id === capsule.taskId)) {
      throw new Error("交接引用了不存在的任务。");
    }
    const updated: LongTailProject = {
      ...project, capsule, compact: capsule.summary, currentState: capsule.summary,
      updatedAt: capsule.updatedAt, updatedBy: "user", revision: project.revision + 1
    };
    await writeProject(updated, root);
    await appendProjectEvent(root, {
      schemaVersion: "1", id: randomUUID(), projectId: project.id,
      kind: "project.updated", actor: "user", at: updated.updatedAt, summary: "更新交接上下文。"
    });
    return updated;
  });
}

export function resolveProject(input: {
  projectId: string; outcome: ProjectOutcome | "active"; note: string;
  evidence?: string; revisitAt?: string; workspaceRoot?: string;
}): Promise<LongTailProject> {
  return withWorkspaceLock(input.workspaceRoot, async () => {
    const root = await ensureWorkspace(input.workspaceRoot);
    await assertProjectIdle(root, input.projectId);
    if (!["active", "closed", "parked", "waiting", "killed"].includes(input.outcome)) {
      throw new Error("项目收尾状态无效。");
    }
    if (!input.note?.trim()) throw new Error("请记录本次决定的原因。");
    if (input.outcome === "closed" && !input.evidence?.trim()) throw new Error("关闭项目需要交付证据或验收说明。");
    if (input.outcome === "parked" && !input.revisitAt) throw new Error("暂存项目需要回看日期。");
    if (input.revisitAt) validateDate(input.revisitAt, "回看日期");
    if (input.outcome === "parked" && input.revisitAt! < localDate()) throw new Error("回看日期不能早于今天。");
    const project = await readProject(input.projectId, root);
    const now = new Date().toISOString();
    const updated: LongTailProject = {
      ...project,
      resolution: input.outcome === "active" ? undefined : {
        outcome: input.outcome, note: input.note.trim(), evidence: input.evidence?.trim() ?? "",
        revisitAt: input.revisitAt || undefined, decidedAt: now
      },
      archivedAt: input.outcome === "active" ? undefined : project.archivedAt,
      updatedAt: now, updatedBy: "user", revision: project.revision + 1
    };
    await writeProject(updated, root);
    await appendProjectEvent(root, {
      schemaVersion: "1", id: randomUUID(), projectId: project.id, kind: "project.updated",
      actor: "user", at: now, summary: `${input.outcome}：${input.note.trim()}`
    });
    return updated;
  });
}

async function assertSessionCanStart(root: string, session: ResidencySession): Promise<void> {
  const sessions = await listSessions(root);
  if (sessions.some((other) => other.id !== session.id && ["active", "paused"].includes(other.status))) {
    throw new Error("已有未结束的驻留。");
  }
  const project = await readProject(session.projectId, root);
  const task = project.taskGraph.tasks.find((item) => item.id === session.taskId);
  if (!projectIsAvailable(project) || project.modelNeedsReview || !task || !["todo", "in_progress", "unknown"].includes(task.status) ||
    !isDependencyOpen(task, project.taskGraph.tasks) || !canUseIntensity(task, session.intensity)) {
    throw new Error("提案已失效，请取消后重新生成。");
  }
  const activePlan = (await listPlans(root)).find((plan) => plan.status === "active");
  if (session.planId !== activePlan?.id) throw new Error("驻留计划已改变，请取消后重新生成。");
  if (activePlan) {
    assertPlanSession(activePlan, sessions.filter((item) => item.id !== session.id),
      session.minutesPlanned, session.intensity, session.projectId);
  }
}

export function pauseWorkspaceSession(id: string, root?: string, reason = "主动暂停", at?: string): Promise<ResidencySession> {
  return withWorkspaceLock(root, () => pauseSessionUnlocked(id, root, reason, at));
}

async function pauseSessionUnlocked(id: string, root?: string, reason = "主动暂停", at?: string): Promise<ResidencySession> {
  const session = await readSession(id, root);
  if (session.status === "paused") return session;
  if (session.status !== "active") throw new Error("只有进行中的驻留可以暂停。");
  const now = new Date().toISOString();
  const updated: ResidencySession = {
    ...session, status: "paused", elapsedSeconds: sessionElapsedSeconds(session, Date.parse(at ?? now)),
    lastResumedAt: undefined, pauseReason: reason, updatedAt: now,
    updatedBy: "app", revision: session.revision + 1
  };
  const resolvedRoot = await ensureWorkspace(root);
  await writeJson(sessionPath(resolvedRoot, id), updated);
  await appendProjectEvent(resolvedRoot, {
    schemaVersion: "1", id: randomUUID(), projectId: session.projectId, sessionId: id,
    kind: "session.paused", actor: "app", at: now, summary: reason
  });
  return updated;
}

export function resumeWorkspaceSession(id: string, root?: string): Promise<ResidencySession> {
  return withWorkspaceLock(root, async () => {
    const resolvedRoot = await ensureWorkspace(root);
    const session = await readSession(id, root);
    if (session.status !== "paused") throw new Error("只有暂停的驻留可以继续。");
    if (session.planId && session.workDate !== localDate()) throw new Error("这是上一日的驻留，请先记录结果，再开始今天的一段。");
    await assertSessionCanStart(resolvedRoot, session);
    const now = new Date().toISOString();
    const updated: ResidencySession = {
      ...session, status: "active", lastResumedAt: now, heartbeatAt: now,
      pauseReason: undefined, updatedAt: now, updatedBy: "user", revision: session.revision + 1
    };
    await writeJson(sessionPath(resolvedRoot, id), updated);
    await appendProjectEvent(resolvedRoot, {
      schemaVersion: "1", id: randomUUID(), projectId: session.projectId, sessionId: id,
      kind: "session.resumed", actor: "user", at: now, summary: "继续驻留。"
    });
    return updated;
  });
}

export function heartbeatSession(id: string, root?: string): Promise<void> {
  return withWorkspaceLock(root, async () => {
    const session = await readSession(id, root);
    if (session.status !== "active") return;
    const now = new Date().toISOString();
    if (session.heartbeatAt && Date.parse(now) - Date.parse(session.heartbeatAt) > 90_000) {
      await pauseSessionUnlocked(id, root, "活动信号中断，计时已停在最后确认时间。", session.heartbeatAt);
      return;
    }
    if (session.planId && session.workDate !== localDate()) {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      await pauseSessionUnlocked(id, root, "今日窗口结束，请记录本段结果。", midnight.toISOString());
      return;
    }
    await writeJson(sessionPath(await ensureWorkspace(root), id), {
      ...session, heartbeatAt: now, updatedAt: now, updatedBy: "app", revision: session.revision + 1
    });
  });
}

export function recoverInterruptedSessions(root?: string): Promise<void> {
  return withWorkspaceLock(root, async () => {
    for (const session of await listSessions(root)) {
      if (session.status === "active" &&
        Date.now() - Date.parse(session.heartbeatAt ?? session.startedAt) > 90_000) {
        await pauseSessionUnlocked(session.id, root, "上次驻留意外中断，确认后可继续。",
          session.heartbeatAt ?? session.startedAt);
      }
    }
  });
}

export async function listPlans(workspaceRoot?: string): Promise<ResidencyPlan[]> {
  const paths = getWorkspacePaths(await ensureWorkspace(workspaceRoot));
  const files = await readdir(paths.plans);
  const plans = await Promise.all(files.filter((file) => file.endsWith(".json")).map((file) =>
    readJsonRecoverable<ResidencyPlan>(join(paths.plans, file))));
  return plans.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function savePlan(input: { id?: string; draft: PlanDraft; workspaceRoot?: string }): Promise<ResidencyPlan> {
  return withWorkspaceLock(input.workspaceRoot, async () => {
    const root = await ensureWorkspace(input.workspaceRoot);
    const plans = await listPlans(root);
    const existing = input.id ? plans.find((plan) => plan.id === input.id) : undefined;
    if (input.id && !existing) throw new Error("驻留计划不存在。");
    if (existing && !["draft", "committed"].includes(existing.status)) throw new Error("只有未开始的计划可以修改。");
    if (plans.some((plan) => plan.id !== input.id && plan.status !== "closed")) throw new Error("请先处理已有驻留计划。");
    const draft = input.draft;
    validateDate(draft.startDate, "开始日期");
    validateDate(draft.endDate, "结束日期");
    if (draft.endDate < draft.startDate) throw new Error("结束日期不能早于开始日期。");
    if (!draft.title?.trim() || !draft.exitCriteria?.trim() || !draft.notDoing?.trim()) throw new Error("请填写计划名称、结束标准和边界。");
    if (!Number.isFinite(draft.dailyMinutes) || draft.dailyMinutes < 5 || draft.dailyMinutes > 480 ||
      !INTENSITIES.includes(draft.intensity) || draft.intensity === "xhigh") throw new Error("每日容量为 5-480 分钟，计划强度不超过 high。");
    if (!Array.isArray(draft.projectIds) || !draft.projectIds.length) throw new Error("至少选择一个项目。");
    for (const id of draft.projectIds) {
      if (!projectIsAvailable(await readProject(id, root))) throw new Error("计划只能包含开放项目。");
    }
    const now = new Date().toISOString();
    const plan: ResidencyPlan = {
      schemaVersion: "1", title: draft.title.trim(), projectIds: [...new Set(draft.projectIds)],
      startDate: draft.startDate, endDate: draft.endDate, dailyMinutes: draft.dailyMinutes,
      intensity: draft.intensity, notDoing: draft.notDoing.trim(), exitCriteria: draft.exitCriteria.trim(),
      id: existing?.id ?? randomUUID(), status: "draft", createdAt: existing?.createdAt ?? now,
      updatedAt: now, updatedBy: "user", revision: (existing?.revision ?? 0) + 1
    };
    await persistPlan(root, plan, existing ? "修改计划" : "创建计划");
    return plan;
  });
}

export function transitionPlan(input: {
  id: string; status: "committed" | "active" | "closed"; note?: string; workspaceRoot?: string;
}): Promise<ResidencyPlan> {
  return withWorkspaceLock(input.workspaceRoot, async () => {
    const root = await ensureWorkspace(input.workspaceRoot);
    const plan = (await listPlans(root)).find((item) => item.id === input.id);
    if (!plan || plan.status === "closed") throw new Error("计划不存在或已经结束。");
    const sessions = await listSessions(root);
    if (sessions.some((session) => ["active", "paused", "proposed"].includes(session.status))) throw new Error("请先结束或取消当前驻留。");
    if (!["committed", "active", "closed"].includes(input.status)) throw new Error("计划状态无效。");
    if (input.status === "committed" && plan.status !== "draft") throw new Error("只有草案可以确认。");
    if (input.status === "active" && plan.status !== "committed") throw new Error("请先确认驻留计划。");
    if (input.status !== "closed") {
      if (localDate() > plan.endDate) throw new Error("计划已过期，请调整日期或结束。");
      for (const id of plan.projectIds) {
        if (!projectIsAvailable(await readProject(id, root))) throw new Error("计划包含已收起项目，请修改范围。");
      }
    }
    if (input.status === "active" && localDate() < plan.startDate) throw new Error("尚未到计划开始日期。");
    if (input.status === "closed" && !input.note?.trim()) throw new Error("请留下结束说明。");
    const updated: ResidencyPlan = {
      ...plan, status: input.status, closingNote: input.note?.trim(), updatedAt: new Date().toISOString(),
      updatedBy: "user", revision: plan.revision + 1
    };
    await persistPlan(root, updated, input.note ?? input.status);
    return updated;
  });
}

async function persistPlan(root: string, plan: ResidencyPlan, summary: string): Promise<void> {
  const path = getWorkspacePaths(root).plans;
  await writeJson(join(path, `${assertSafeId(plan.id)}.json`), plan);
  await appendFile(join(path, "events.jsonl"), `${JSON.stringify({
    schemaVersion: "1", id: randomUUID(), planId: plan.id, at: plan.updatedAt,
    actor: "user", status: plan.status, revision: plan.revision, summary
  })}\n`, "utf8");
}

function assertPlanSession(plan: ResidencyPlan, sessions: ResidencySession[], minutes: number, intensity: Intensity, projectId?: string): void {
  const date = localDate();
  if (date < plan.startDate || date > plan.endDate) throw new Error("当前不在驻留日期内，请结束或调整计划。");
  if (projectId && !plan.projectIds.includes(projectId)) throw new Error("该项目不在本次驻留范围内。");
  if (INTENSITIES.indexOf(intensity) > INTENSITIES.indexOf(plan.intensity)) throw new Error("本轮强度超过驻留计划上限。");
  const remaining = Math.floor(plan.dailyMinutes - planMinutesUsed(plan, sessions, date));
  if (minutes > remaining) throw new Error(`今日驻留容量剩余 ${Math.max(0, remaining)} 分钟，请缩短本轮或休息。`);
}

export async function listCaptures(root?: string): Promise<AttentionCapture[]> {
  const path = getWorkspacePaths(await ensureWorkspace(root)).inbox;
  const captures = await Promise.all((await readdir(path)).filter((file) => file.endsWith(".json"))
    .map((file) => readJsonRecoverable<AttentionCapture>(join(path, file))));
  return captures.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function captureThought(input: { text: string; sourceSessionId?: string; workspaceRoot?: string }): Promise<AttentionCapture> {
  return withWorkspaceLock(input.workspaceRoot, async () => {
    const root = await ensureWorkspace(input.workspaceRoot);
    const text = validateCaptureText(input.text);
    if (input.sourceSessionId) {
      const session = await readSession(input.sourceSessionId, root);
      if (!["active", "paused"].includes(session.status)) throw new Error("只能从当前驻留收纳分心事项。");
    }
    const now = new Date().toISOString();
    const capture: AttentionCapture = {
      schemaVersion: "1", id: randomUUID(), text, status: "inbox", sourceSessionId: input.sourceSessionId,
      createdAt: now, updatedAt: now, updatedBy: "user", revision: 1
    };
    await persistCapture(root, capture);
    return capture;
  });
}

async function persistCapture(root: string, capture: AttentionCapture): Promise<void> {
  const path = getWorkspacePaths(root).inbox;
  await writeJson(join(path, `${assertSafeId(capture.id)}.json`), capture);
  await appendFile(join(path, "events.jsonl"), `${JSON.stringify({
    schemaVersion: "1", id: randomUUID(), captureId: capture.id, status: capture.status,
    projectId: capture.projectId, at: capture.updatedAt, actor: "user", revision: capture.revision
  })}\n`, "utf8");
  await touchManifest(root);
}

export function setCaptureShelved(input: { id: string; shelved: boolean; workspaceRoot?: string }): Promise<AttentionCapture> {
  return withWorkspaceLock(input.workspaceRoot, async () => {
    const root = await ensureWorkspace(input.workspaceRoot);
    const path = join(getWorkspacePaths(root).inbox, `${assertSafeId(input.id)}.json`);
    const current = await readJsonRecoverable<AttentionCapture>(path);
    if (typeof input.shelved !== "boolean") throw new Error("收纳状态无效。");
    if (current.status === "converted") throw new Error("此事项已建立项目，请在项目中处理。");
    const capture: AttentionCapture = {
      ...current, status: input.shelved ? "shelved" : "inbox", updatedAt: new Date().toISOString(),
      updatedBy: "user", revision: current.revision + 1
    };
    await persistCapture(root, capture);
    return capture;
  });
}

export function convertCapture(input: CaptureConversion & { workspaceRoot?: string }): Promise<LongTailProject> {
  return withWorkspaceLock(input.workspaceRoot, async () => {
    const root = await ensureWorkspace(input.workspaceRoot);
    const capture = await readJsonRecoverable<AttentionCapture>(join(getWorkspacePaths(root).inbox, `${assertSafeId(input.id)}.json`));
    if (capture.status === "converted" && capture.projectId) return readProject(capture.projectId, root);
    if (capture.status !== "inbox") throw new Error("请先从搁置中恢复这条事项。");
    const remaining = validateCaptureText(input.remaining);
    const closeCriteria = validateCaptureText(input.closeCriteria);
    const title = validateCaptureText(input.title);
    if (title.length > 120) throw new Error("项目名称请控制在 120 字以内。");
    // A stable destination makes retry after a partial filesystem failure idempotent.
    const id = `capture-${capture.id}`;
    const project = await exists(projectModelPath(root, id)) ? await readProject(id, root) : await createProjectUnlocked({
      title, brief: capture.text, intake: { completed: "", remaining, closeCriteria }, workspaceRoot: root
    }, id);
    await persistCapture(root, {
      ...capture, status: "converted", projectId: project.id, updatedAt: new Date().toISOString(),
      updatedBy: "user", revision: capture.revision + 1
    });
    return project;
  });
}

async function focusPreviewUnlocked(input: FocusConstraints, root: string): Promise<FocusPreview> {
  const sessions = await listSessions(root);
  const currentSession = sessions.find((session) => ["active", "paused", "proposed"].includes(session.status));
  if (currentSession) return { currentSession };
  let projects = await listProjects(root);
  const plan = (await listPlans(root)).find((item) => item.status === "active");
  if (plan) {
    try { assertPlanSession(plan, sessions, input.minutes, input.intensity, input.projectId); }
    catch (error) { return { message: error instanceof Error ? error.message : String(error) }; }
    projects = projects.filter((project) => plan.projectIds.includes(project.id));
  }
  const proposal = proposeSessionTask({
    projects, ...input, now: "2000-01-01T00:00:00.000Z", makeId: () => "preview"
  });
  if (!proposal) return { message: projects.some((project) => project.modelNeedsReview)
    ? "有项目事实更新，先校准它的收尾范围。" : "当前窗口没有匹配的开放任务。" };
  const session = {
    ...proposal.session, planId: plan?.id, workDate: localDate(),
    notDoing: plan ? `${proposal.session.notDoing}\n${plan.notDoing}` : proposal.session.notDoing
  };
  const token = createHash("sha256").update(JSON.stringify({
    session, revision: proposal.project.revision, planRevision: plan?.revision
  })).digest("hex");
  return { session, token };
}

export function previewFocus(input: FocusConstraints, root?: string): Promise<FocusPreview> {
  return withWorkspaceLock(root, async () => focusPreviewUnlocked(input, await ensureWorkspace(root)));
}

export function startFocus(input: FocusConstraints & { token: string }, root?: string): Promise<ResidencySession> {
  return withWorkspaceLock(root, async () => {
    const workspaceRoot = await ensureWorkspace(root);
    const preview = await focusPreviewUnlocked(input, workspaceRoot);
    if (preview.currentSession) throw new Error("已有未结束的驻留，请返回当前驻留。");
    if (!preview.token || preview.token !== input.token || !preview.session) {
      throw new Error("工作入口已变化，请重新确认当前显示的内容。");
    }
    const proposal = await proposeSessionUnlocked(input.minutes, input.intensity, workspaceRoot, input.projectId);
    if (!proposal) throw new Error("没有可开始的任务。");
    return startWorkspaceSessionUnlocked(proposal.id, workspaceRoot);
  });
}
