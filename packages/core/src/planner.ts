import type { Intensity, LongTailProject, ResidencySession, WorkUnit } from "./types";
import { SCHEMA_VERSION } from "./types";

const intensityScore: Record<Intensity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4
};

export interface SessionProposalInput {
  projects: LongTailProject[];
  minutes: number;
  intensity: Intensity;
  now: string;
  makeId: () => string;
}

export interface SessionProposal {
  session: ResidencySession;
  project: LongTailProject;
  task: WorkUnit;
}

export function canUseIntensity(task: WorkUnit, userIntensity: Intensity): boolean {
  return intensityScore[task.intensity] <= intensityScore[userIntensity];
}

export function isDependencyOpen(task: WorkUnit, allTasks: WorkUnit[]): boolean {
  return task.dependsOn.every((dependencyId) => {
    const dependency = allTasks.find((candidate) => candidate.id === dependencyId);
    return dependency?.status === "done";
  });
}

export function proposeSessionTask(input: SessionProposalInput): SessionProposal | null {
  const budget = Math.max(5, input.minutes);

  const candidates = input.projects.flatMap((project) =>
    project.archivedAt
      ? []
      : project.taskGraph.tasks
          .filter(
            (task) =>
              task.status === "todo" || task.status === "in_progress" || task.status === "unknown"
          )
          .filter((task) => isDependencyOpen(task, project.taskGraph.tasks))
          .filter((task) => canUseIntensity(task, input.intensity))
          .map((task) => ({ project, task }))
  );

  if (candidates.length === 0) {
    return null;
  }

  const scored = candidates
    .map(({ project, task }) => {
      const timeFit = Math.abs(task.effortMinutes - budget);
      const nearCloseBonus = project.completionPercent >= 70 ? 20 : 0;
      const statusBonus = task.status === "in_progress" ? 10 : 0;
      const weightBonus = task.weight;
      return {
        project,
        task,
        score: weightBonus + nearCloseBonus + statusBonus - timeFit
      };
    })
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  const isCheckpoint = best.task.effortMinutes > budget * 1.4;
  const task = isCheckpoint ? shrinkTask(best.task, budget) : best.task;

  const session: ResidencySession = {
    schemaVersion: SCHEMA_VERSION,
    id: input.makeId(),
    projectId: best.project.id,
    projectTitle: best.project.title,
    taskId: best.task.id,
    taskTitle: task.title,
    scope: isCheckpoint ? "checkpoint" : "full_task",
    minutesPlanned: budget,
    intensity: input.intensity,
    status: "proposed",
    startedAt: input.now,
    prompt: `本次驻留只处理：${task.title}。`,
    startAction: task.startAction,
    completionCriteria: task.completionCriteria,
    notDoing: task.notDoing,
    selectionReason: makeSelectionReason(
      best.project,
      best.task,
      budget,
      isCheckpoint
    ),
    updatedAt: input.now,
    updatedBy: "app",
    revision: 1
  };

  return {
    session,
    project: best.project,
    task
  };
}

function makeSelectionReason(
  project: LongTailProject,
  task: WorkUnit,
  budget: number,
  isCheckpoint: boolean
): string {
  const reasons: string[] = [];
  if (task.status === "in_progress") {
    reasons.push("延续已经启动的任务，避免重新加载另一组上下文。");
  }
  if (project.completionPercent >= 70) {
    reasons.push("项目已经接近关闭，优先收束剩余关键路径。");
  }
  if (isCheckpoint) {
    reasons.push(`完整任务超过 ${budget} 分钟，本轮已缩成一个可验证检查点。`);
  } else {
    reasons.push("任务规模与可用时间接近，可以在本轮形成明确结果。");
  }
  return reasons.slice(0, 2).join("");
}

function shrinkTask(task: WorkUnit, minutes: number): WorkUnit {
  return {
    ...task,
    title: `${task.title}：前 ${minutes} 分钟检查点`,
    description: `把“${task.title}”缩小为本次驻留结束时可以判断的一段可见进展。`,
    effortMinutes: minutes,
    completionCriteria: `“${task.title}”已经留下一个具体检查点，即使完整任务仍保持开放。`,
    notDoing: "不尝试完成整个大任务，到达第一个可验证检查点后停止。"
  };
}
