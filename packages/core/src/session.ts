import type {
  LongTailProject,
  ResidencySession,
  SessionAssessment,
  SessionResult,
  ContextCapsule,
  WorkUnit
} from "./types";
import { refreshProjectProgress } from "./progress";
import { projectCapsule, sessionElapsedSeconds } from "./context";

export interface CloseSessionInput {
  project: LongTailProject;
  session: ResidencySession;
  result: SessionResult;
  note?: string;
  now: string;
  assessment?: SessionAssessment;
  handoff?: ContextCapsule;
}

export interface CloseSessionOutput {
  project: LongTailProject;
  session: ResidencySession;
  summary: string;
}

export function closeSession(input: CloseSessionInput): CloseSessionOutput {
  const task = input.project.taskGraph.tasks.find((candidate) => candidate.id === input.session.taskId);
  if (!task) throw new Error("驻留任务已不存在，请先恢复对应任务再记录结果。");
  const updatedTask = task
    ? updateTaskFromResult(task, input.result, input.session, input.note)
    : null;
  const tasks = input.project.taskGraph.tasks.map((candidate) =>
    candidate.id === updatedTask?.id ? updatedTask : candidate
  );
  const next = updatedTask?.status !== "done" ? updatedTask : tasks.find((candidate) =>
    ["todo", "in_progress", "unknown"].includes(candidate.status) &&
    candidate.dependsOn.every((id) => tasks.find((dependency) => dependency.id === id)?.status === "done")
  );
  const previous = projectCapsule(input.project);
  const capsule: ContextCapsule = {
    ...previous,
    summary: input.note?.trim() || (updatedTask
      ? makeProjectCompact(input.project.title, updatedTask, input.result) : previous.summary),
    nextAction: next?.startAction ?? "",
    notDoing: next?.notDoing ?? previous.notDoing,
    taskId: next?.id,
    ...input.handoff,
    updatedAt: input.now
  };
  // A handoff for a finished task must never override the next task's entrance.
  if (updatedTask?.status === "done") {
    capsule.taskId = next?.id;
    if (!input.handoff?.nextAction) capsule.nextAction = next?.startAction ?? "";
  }

  const projectWithTask = updatedTask
    ? {
        ...input.project,
        taskGraph: {
          tasks: input.project.taskGraph.tasks.map((candidate) =>
            candidate.id === updatedTask.id ? updatedTask : candidate
          )
        },
        compact: capsule.summary,
        capsule,
        currentState: capsule.summary,
        updatedAt: input.now,
        updatedBy: "app" as const,
        revision: input.project.revision + 1
      }
    : input.project;

  const project = refreshProjectProgress(projectWithTask);
  const judgement =
    input.assessment?.judgement ??
    makeJudgement(input.result, input.session.scope ?? "full_task", input.note);
  const session: ResidencySession = {
    ...input.session,
    status: "closed",
    endedAt: input.now,
    userResult: input.result,
    userNote: input.note,
    handoff: capsule,
    elapsedSeconds: sessionElapsedSeconds(input.session, Date.parse(input.now)),
    lastResumedAt: undefined,
    judgement,
    log: makeSessionLog(input.session, input.result, input.note, judgement, project.completionPercent),
    updatedAt: input.now,
    updatedBy: "app",
    revision: input.session.revision + 1
  };

  return {
    project,
    session,
    summary: session.log ?? judgement
  };
}

function updateTaskFromResult(
  task: WorkUnit,
  result: SessionResult,
  session: ResidencySession,
  note?: string
): WorkUnit {
  if (result === "completed" && session.scope === "full_task") {
    return {
      ...task,
      status: "done",
      progressPercent: 100,
      notes: appendNote(task.notes, note)
    };
  }

  if (result === "partial" || (result === "completed" && session.scope === "checkpoint")) {
    return {
      ...task,
      status: "in_progress",
      progressPercent: task.progressPercent,
      notes: appendNote(task.notes, note)
    };
  }

  return {
    ...task,
    status: (task.progressPercent ?? 0) > 0 ? "in_progress" : "todo",
    notes: appendNote(task.notes, note)
  };
}

function appendNote(existing: string | undefined, note: string | undefined): string | undefined {
  if (!note || note.trim().length === 0) {
    return existing;
  }

  return existing ? `${existing}\n${note.trim()}` : note.trim();
}

function makeJudgement(
  result: SessionResult,
  scope: ResidencySession["scope"],
  note?: string
): string {
  if (result === "completed") {
    if (scope === "checkpoint") {
      return "本次检查点已经完成，父任务仍保持进行中。";
    }
    return "本次任务片段已经完成，进度已计入任务图。";
  }
  if (result === "partial") {
    return "本次任务已有推进但尚未关闭，可继续作为下一入口。";
  }
  const suffix = note ? ` 补充：${note.trim()}` : "";
  return `本次任务没有关闭。下次应缩小范围，或选择强度更低的任务。${suffix}`;
}

function makeProjectCompact(title: string, task: WorkUnit, result: SessionResult, note?: string): string {
  const noteText = note && note.trim().length > 0 ? ` 用户补充：${note.trim()}` : "";
  const resultLabel =
    result === "completed" ? "已完成" : result === "partial" ? "部分完成" : "未完成";
  const nextEntrance = task.status === "done" ? "选择下一个未阻塞任务" : task.startAction;
  return `${title}：上次驻留对“${task.title}”的结果为${resultLabel}。下一入口：${nextEntrance}。${noteText}`;
}

function makeSessionLog(
  session: ResidencySession,
  result: SessionResult,
  note: string | undefined,
  judgement: string,
  completionPercent: number
): string {
  const noteText = note && note.trim().length > 0 ? ` 用户补充：${note.trim()}` : "";
  const resultLabel =
    result === "completed" ? "已完成" : result === "partial" ? "部分完成" : "未完成";
  return `${session.taskTitle}：${resultLabel}。${judgement} 项目完成度现为 ${completionPercent}%。${noteText}`;
}
