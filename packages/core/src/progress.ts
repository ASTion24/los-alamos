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
  const taskCount = project.taskGraph.tasks.length;
  const hasCloseCriteria = project.closeCriteria.some((item) => item.trim().length > 0);
  const unknownCount = project.unknowns.filter((item) => item.trim().length > 0).length;

  if (!hasCloseCriteria || taskCount < 3 || unknownCount >= 3) {
    return "low";
  }

  if (unknownCount > 0 || taskCount < 5) {
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
