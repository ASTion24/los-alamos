import type {
  Intensity,
  LongTailProject,
  ResidencySession,
  SessionResult,
  WorkUnit,
  WorkspaceHealth
} from "./types";

declare global {
  interface Window {
    los: {
      platform: NodeJS.Platform;
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
      createProject: (input: { title: string; brief: string }) => Promise<LongTailProject>;
      reanalyzeProject: (projectId: string) => Promise<LongTailProject>;
      updateProjectBrief: (input: {
        projectId: string;
        brief: string;
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
      proposeSession: (input: { minutes: number; intensity: Intensity }) => Promise<ResidencySession | null>;
      startSession: (sessionId: string) => Promise<ResidencySession>;
      cancelSessionProposal: (sessionId: string) => Promise<ResidencySession>;
      closeSession: (input: {
        sessionId: string;
        result: SessionResult;
        note?: string;
      }) => Promise<ResidencySession>;
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
