import type {
  Intensity,
  LongTailProject,
  ResidencySession,
  SessionResult,
  WorkUnit,
  WorkspaceHealth,
  ContextCapsule, ProjectIntake, ProjectOutcome, ResidencyPlan, PlanDraft,
  AttentionCapture, CaptureConversion, FocusConstraints, FocusPreview
} from "./types";

declare global {
  interface Window {
    los: {
      platform: NodeJS.Platform;
      listCaptures: () => Promise<AttentionCapture[]>;
      captureThought: (input: { text: string; sourceSessionId?: string }) => Promise<AttentionCapture>;
      shelveCapture: (input: { id: string; shelved: boolean }) => Promise<AttentionCapture>;
      convertCapture: (input: CaptureConversion) => Promise<LongTailProject>;
      previewFocus: (input: FocusConstraints) => Promise<FocusPreview>;
      startFocus: (input: FocusConstraints & { token: string }) => Promise<ResidencySession>;
      openArtifact: (input: { projectId: string; artifact: string }) => Promise<void>;
      attachArtifacts: (projectId: string) => Promise<LongTailProject | null>;
      workspaceRoot: () => Promise<string>;
      showWorkspace: () => Promise<string>;
      getAboutState: () => Promise<{
        version: string;
        shouldShow: boolean;
      }>;
      dismissAbout: () => Promise<{
        version: string;
        shouldShow: boolean;
      }>;
      listProjects: () => Promise<LongTailProject[]>;
      createProject: (input: { title: string; brief: string; intake?: ProjectIntake }) => Promise<LongTailProject>;
      reanalyzeProject: (projectId: string) => Promise<LongTailProject>;
      updateProjectBrief: (input: {
        projectId: string;
        brief: string;
        intake?: ProjectIntake;
      }) => Promise<LongTailProject>;
      setProjectArchived: (input: {
        projectId: string;
        archived: boolean;
      }) => Promise<LongTailProject>;
      updateTask: (input: {
        projectId: string;
        taskId: string;
        patch: Partial<WorkUnit>;
      }) => Promise<LongTailProject>;
      listSessions: () => Promise<ResidencySession[]>;
      proposeSession: (input: { minutes: number; intensity: Intensity; projectId?: string }) => Promise<ResidencySession | null>;
      startSession: (sessionId: string) => Promise<ResidencySession>;
      cancelSessionProposal: (sessionId: string) => Promise<ResidencySession>;
      closeSession: (input: {
        sessionId: string;
        result: SessionResult;
        note?: string;
        handoff?: ContextCapsule;
      }) => Promise<ResidencySession>;
      pauseSession: (id: string) => Promise<ResidencySession>;
      resumeSession: (id: string) => Promise<ResidencySession>;
      reviseProposal: (input: { id: string; startAction: string; completionCriteria: string; notDoing: string }) => Promise<ResidencySession>;
      updateCapsule: (input: { projectId: string; capsule: ContextCapsule }) => Promise<LongTailProject>;
      resolveProject: (input: { projectId: string; outcome: ProjectOutcome | "active"; note: string; evidence?: string; revisitAt?: string }) => Promise<LongTailProject>;
      listPlans: () => Promise<ResidencyPlan[]>;
      savePlan: (input: { id?: string; draft: PlanDraft }) => Promise<ResidencyPlan>;
      transitionPlan: (input: { id: string; status: "committed" | "active" | "closed"; note?: string }) => Promise<ResidencyPlan>;
      getWorkspaceHealth: () => Promise<WorkspaceHealth>;
      getSettings: () => Promise<{
        baseUrl: string;
        model: string;
        hasApiKey: boolean;
      }>;
      saveSettings: (input: {
        baseUrl: string;
        model: string;
        apiKey?: string;
        clearApiKey?: boolean;
      }) => Promise<{
        baseUrl: string;
        model: string;
        hasApiKey: boolean;
      }>;
      testSettings: (input: {
        baseUrl: string;
        model: string;
        apiKey?: string;
      }) => Promise<{
        ok: true;
        model: string;
        latencyMs: number;
      }>;
      onOpenRequest: (callback: (request: unknown) => void) => () => void;
      onWorkspaceChanged: (callback: () => void) => () => void;
      onOperationWarning: (callback: (message: string) => void) => () => void;
      onSessionDeadline: (callback: (sessionId: string) => void) => () => void;
    };
  }
}

export {};
