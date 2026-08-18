export type Intensity = "low" | "medium" | "high" | "xhigh";
export type TaskStatus = "todo" | "in_progress" | "done" | "parked" | "killed" | "unknown";
export type SessionResult = "completed" | "not_completed" | "partial";

export interface WorkUnit {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  dependsOn: string[];
  effortMinutes: number;
  intensity: Intensity;
  weight: number;
  progressPercent: number;
  completionCriteria: string;
  startAction: string;
  notDoing: string;
  notes?: string;
}

export interface LongTailProject {
  id: string;
  title: string;
  brief: string;
  goal: string;
  closeCriteria: string[];
  currentState: string;
  unknowns: string[];
  taskGraph: { tasks: WorkUnit[] };
  completionPercent: number;
  confidence: "low" | "medium" | "high";
  compact: string;
  updatedAt: string;
  revision: number;
  archivedAt?: string;
}

export interface ResidencySession {
  id: string;
  projectId: string;
  projectTitle: string;
  taskId: string;
  taskTitle: string;
  scope: "full_task" | "checkpoint";
  minutesPlanned: number;
  intensity: Intensity;
  status: "proposed" | "active" | "closed" | "cancelled";
  startedAt: string;
  endedAt?: string;
  prompt: string;
  startAction: string;
  completionCriteria: string;
  notDoing: string;
  selectionReason: string;
  userResult?: SessionResult;
  userNote?: string;
  judgement?: string;
  log?: string;
}

export interface WorkspaceHealth {
  ok: boolean;
  checkedAt: string;
  projectCount: number;
  sessionCount: number;
  backupCount: number;
  issues: Array<{
    severity: "warning" | "error";
    code: string;
    message: string;
    path: string;
  }>;
}
