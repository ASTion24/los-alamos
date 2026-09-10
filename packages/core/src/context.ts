import type { ContextCapsule, LongTailProject, ResidencyPlan, ResidencySession } from "./types";

export function projectIsAvailable(project: LongTailProject): boolean {
  return !project.archivedAt && !project.resolution;
}

export function projectCapsule(project: LongTailProject): ContextCapsule {
  return project.capsule ?? {
    summary: project.compact || project.currentState,
    decisions: [],
    artifacts: [],
    blocker: project.unknowns.join("\n"),
    nextAction: "",
    notDoing: "",
    updatedAt: project.updatedAt
  };
}

export function sessionElapsedSeconds(session: ResidencySession, now = Date.now()): number {
  if (session.elapsedSeconds === undefined) {
    const end = session.endedAt ? Date.parse(session.endedAt) : now;
    return session.status === "proposed" || session.status === "cancelled"
      ? 0 : Math.max(0, Math.floor((end - Date.parse(session.startedAt)) / 1000));
  }
  const running = session.status === "active" && session.lastResumedAt
    ? Math.max(0, Math.floor((now - Date.parse(session.lastResumedAt)) / 1000)) : 0;
  return session.elapsedSeconds + running;
}

export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function planMinutesUsed(plan: ResidencyPlan, sessions: ResidencySession[], date = localDate()): number {
  return sessions.filter((session) =>
    session.planId === plan.id && session.workDate === date &&
    ["active", "paused", "closed", "proposed"].includes(session.status)
  ).reduce((sum, session) => sum + (
    session.status === "closed"
      ? sessionElapsedSeconds(session) / 60
      : Math.max(session.minutesPlanned, sessionElapsedSeconds(session) / 60)
  ), 0);
}

export function validateDate(value: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value) {
    throw new Error(`${label}必须是有效日期 (YYYY-MM-DD)。`);
  }
}

export function validateCapsule(capsule: ContextCapsule): ContextCapsule {
  const text = (value: unknown): string => {
    if (typeof value !== "string" || value.length > 20_000) throw new Error("交接文本无效或过长。");
    return value.trim();
  };
  const lines = (value: unknown): string[] => {
    if (!Array.isArray(value) || value.length > 100) throw new Error("交接条目无效。");
    return value.map(text).filter(Boolean);
  };
  return {
    summary: text(capsule.summary),
    decisions: lines(capsule.decisions),
    artifacts: lines(capsule.artifacts),
    blocker: text(capsule.blocker),
    nextAction: text(capsule.nextAction),
    notDoing: text(capsule.notDoing),
    taskId: capsule.taskId ? text(capsule.taskId) : undefined,
    updatedAt: new Date().toISOString()
  };
}
