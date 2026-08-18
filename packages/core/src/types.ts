export const SCHEMA_VERSION = "1" as const;

export const INTENSITIES = ["low", "medium", "high", "xhigh"] as const;
export type Intensity = (typeof INTENSITIES)[number];

export const TASK_STATUSES = [
  "todo",
  "in_progress",
  "done",
  "parked",
  "killed",
  "unknown"
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export type Confidence = "low" | "medium" | "high";

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

export interface TaskGraph {
  tasks: WorkUnit[];
}

export interface LongTailProject {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  title: string;
  brief: string;
  goal: string;
  closeCriteria: string[];
  currentState: string;
  unknowns: string[];
  taskGraph: TaskGraph;
  completionPercent: number;
  confidence: Confidence;
  compact: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: "user" | "app" | "agent" | "llm";
  revision: number;
  archivedAt?: string;
}

export type SessionStatus = "proposed" | "active" | "closed" | "cancelled";
export type SessionResult = "completed" | "not_completed" | "partial";
export type SessionScope = "full_task" | "checkpoint";

export interface SessionAssessment {
  taskProgressPercent: number;
  judgement: string;
  compact: string;
}

export interface ResidencySession {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  projectId: string;
  projectTitle: string;
  taskId: string;
  taskTitle: string;
  scope: SessionScope;
  minutesPlanned: number;
  intensity: Intensity;
  status: SessionStatus;
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
  updatedAt: string;
  updatedBy: "user" | "app" | "agent" | "llm";
  revision: number;
}

export interface ProjectEvent {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  projectId: string;
  sessionId?: string;
  kind:
    | "project.created"
    | "project.updated"
    | "project.archived"
    | "project.restored"
    | "session.proposed"
    | "session.started"
    | "session.cancelled"
    | "session.closed"
    | "task.updated";
  at: string;
  actor: "user" | "app" | "agent" | "llm";
  summary: string;
}
