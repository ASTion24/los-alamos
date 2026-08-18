import type {
  LongTailProject,
  ResidencySession,
  SessionAssessment,
  SessionResult,
  WorkUnit
} from "./types";
import { refreshProjectProgress } from "./progress";

export interface CloseSessionInput {
  project: LongTailProject;
  session: ResidencySession;
  result: SessionResult;
  note?: string;
  now: string;
  assessment?: SessionAssessment;
}

export interface CloseSessionOutput {
  project: LongTailProject;
  session: ResidencySession;
  summary: string;
}

export function closeSession(input: CloseSessionInput): CloseSessionOutput {
  const task = input.project.taskGraph.tasks.find((candidate) => candidate.id === input.session.taskId);
  const updatedTask = task
    ? updateTaskFromResult(task, input.result, input.session, input.note, input.assessment)
    : null;

  const projectWithTask = updatedTask
    ? {
        ...input.project,
        taskGraph: {
          tasks: input.project.taskGraph.tasks.map((candidate) =>
            candidate.id === updatedTask.id ? updatedTask : candidate
          )
        },
        compact:
          input.assessment?.compact ??
          makeProjectCompact(input.project.title, updatedTask, input.result, input.note),
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
  note?: string,
  assessment?: SessionAssessment
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
    const plannedShare = Math.min(1, session.minutesPlanned / Math.max(task.effortMinutes, 1));
    const creditedShare = result === "completed" ? plannedShare : plannedShare * 0.5;
    const assessedProgress = assessment?.taskProgressPercent;
    const progressPercent = Math.min(95, Math.max(
      task.progressPercent ?? 0,
      typeof assessedProgress === "number"
        ? assessedProgress
        : (task.progressPercent ?? 0) + creditedShare * 100
    ));
    return {
      ...task,
      status: "in_progress",
      progressPercent: Math.round(progressPercent),
      notes: appendNote(task.notes, note)
    };
  }

  if (assessment && assessment.taskProgressPercent > (task.progressPercent ?? 0)) {
    return {
      ...task,
      status: "in_progress",
      progressPercent: Math.min(95, Math.round(assessment.taskProgressPercent)),
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
