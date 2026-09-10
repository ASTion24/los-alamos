import type { Confidence, LongTailProject, WorkUnit } from "./types";

export function computeCompletionPercent(tasks: WorkUnit[]): number {
  const activeTasks = tasks.filter((task) => task.status !== "killed");
  const total = activeTasks.reduce((sum, task) => sum + Math.max(task.weight, 0), 0);
  if (total <= 0) {
    return 0;
  }

  const done = activeTasks.reduce((sum, task) => {
    const progress =
      typeof task.progressPercent === "number"
        ? Math.min(100, Math.max(0, task.progressPercent))
        : task.status === "done"
          ? 100
          : 0;
    return sum + Math.max(task.weight, 0) * (progress / 100);
  }, 0);

  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}

export function computeConfidence(project: Pick<LongTailProject, "closeCriteria" | "unknowns" | "taskGraph">): Confidence {
  const tasks = project.taskGraph.tasks;
  const hasCloseCriteria = project.closeCriteria.some((item) => item.trim().length > 0);
  const unknownCount = project.unknowns.filter((item) => item.trim().length > 0).length;

  if (!hasCloseCriteria || tasks.length === 0 || unknownCount >= 3 ||
    tasks.some((task) => !task.startAction.trim() || !task.completionCriteria.trim() || !task.notDoing.trim())) {
    return "low";
  }

  if (unknownCount > 0 || tasks.some((task) => task.status === "unknown")) {
    return "medium";
  }

  return "high";
}

export function refreshProjectProgress(project: LongTailProject): LongTailProject {
  return {
    ...project,
    completionPercent: computeCompletionPercent(project.taskGraph.tasks),
    confidence: computeConfidence(project)
  };
}
