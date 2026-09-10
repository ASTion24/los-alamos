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

export interface ProjectIntake {
  completed: string;
  remaining: string;
  closeCriteria: string;
  progressEstimate?: number;
}

export interface AttentionCapture {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  text: string;
  status: "inbox" | "shelved" | "converted";
  sourceSessionId?: string;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: "user" | "app" | "agent";
  revision: number;
}

export interface CaptureConversion {
  id: string;
  title: string;
  remaining: string;
  closeCriteria: string;
}

export interface FocusConstraints {
  minutes: number;
  intensity: Intensity;
  projectId?: string;
}

export interface FocusPreview {
  session?: ResidencySession;
  token?: string;
  currentSession?: ResidencySession;
  message?: string;
}

export interface ContextCapsule {
  summary: string;
  decisions: string[];
  artifacts: string[];
  blocker: string;
  nextAction: string;
  notDoing: string;
  taskId?: string;
  updatedAt: string;
}

export type ProjectOutcome = "closed" | "parked" | "waiting" | "killed";
export interface ProjectResolution {
  outcome: ProjectOutcome;
  note: string;
  evidence: string;
  revisitAt?: string;
  decidedAt: string;
}

export interface ResidencyPlan {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  title: string;
  projectIds: string[];
  startDate: string;
  endDate: string;
  dailyMinutes: number;
  intensity: Intensity;
  notDoing: string;
  exitCriteria: string;
  status: "draft" | "committed" | "active" | "closed";
  closingNote?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: "user" | "app" | "agent";
  revision: number;
}

export type PlanDraft = Pick<ResidencyPlan,
  "title" | "projectIds" | "startDate" | "endDate" | "dailyMinutes" |
  "intensity" | "notDoing" | "exitCriteria">;

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
  intake?: ProjectIntake;
  capsule?: ContextCapsule;
  resolution?: ProjectResolution;
  modelNeedsReview?: boolean;
}

export type SessionStatus = "proposed" | "active" | "paused" | "closed" | "cancelled";
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
  capsule?: ContextCapsule;
  handoff?: ContextCapsule;
  planId?: string;
  workDate?: string;
  elapsedSeconds?: number;
  lastResumedAt?: string;
  heartbeatAt?: string;
  pauseReason?: string;
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
    | "session.paused"
    | "session.resumed"
    | "session.cancelled"
    | "session.closed"
    | "task.updated";
  at: string;
  actor: "user" | "app" | "agent" | "llm";
  summary: string;
}
