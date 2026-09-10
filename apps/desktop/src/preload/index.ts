import { contextBridge, ipcRenderer } from "electron";
import type { ContextCapsule, ProjectIntake, ProjectOutcome, PlanDraft, CaptureConversion, FocusConstraints } from "../../../../packages/core/src";

const api = {
  platform: process.platform,
  listCaptures: () => ipcRenderer.invoke("inbox:list"),
  captureThought: (input: { text: string; sourceSessionId?: string }) => ipcRenderer.invoke("inbox:capture", input),
  shelveCapture: (input: { id: string; shelved: boolean }) => ipcRenderer.invoke("inbox:shelve", input),
  convertCapture: (input: CaptureConversion) => ipcRenderer.invoke("inbox:convert", input),
  previewFocus: (input: FocusConstraints) => ipcRenderer.invoke("focus:preview", input),
  startFocus: (input: FocusConstraints & { token: string }) => ipcRenderer.invoke("focus:start", input),
  openArtifact: (input: { projectId: string; artifact: string }) => ipcRenderer.invoke("artifacts:open", input),
  attachArtifacts: (id: string) => ipcRenderer.invoke("artifacts:attach", id),
  workspaceRoot: () => ipcRenderer.invoke("workspace:root") as Promise<string>,
  showWorkspace: () => ipcRenderer.invoke("workspace:show") as Promise<string>,
  getAboutState: () =>
    ipcRenderer.invoke("about:get-state") as Promise<{
      version: string;
      shouldShow: boolean;
    }>,
  dismissAbout: () =>
    ipcRenderer.invoke("about:dismiss") as Promise<{
      version: string;
      shouldShow: boolean;
    }>,
  listProjects: () => ipcRenderer.invoke("projects:list"),
  createProject: (input: { title: string; brief: string; intake?: ProjectIntake }) => ipcRenderer.invoke("projects:create", input),
  reanalyzeProject: (projectId: string) => ipcRenderer.invoke("projects:reanalyze", projectId),
  updateProjectBrief: (input: { projectId: string; brief: string; intake?: ProjectIntake }) =>
    ipcRenderer.invoke("projects:update-brief", input),
  setProjectArchived: (input: { projectId: string; archived: boolean }) =>
    ipcRenderer.invoke("projects:set-archived", input),
  updateTask: (input: { projectId: string; taskId: string; patch: Record<string, unknown> }) =>
    ipcRenderer.invoke("projects:update-task", input),
  listSessions: () => ipcRenderer.invoke("sessions:list"),
  proposeSession: (input: { minutes: number; intensity: string; projectId?: string }) => ipcRenderer.invoke("sessions:propose", input),
  startSession: (sessionId: string) => ipcRenderer.invoke("sessions:start", sessionId),
  cancelSessionProposal: (sessionId: string) =>
    ipcRenderer.invoke("sessions:cancel-proposal", sessionId),
  closeSession: (input: { sessionId: string; result: string; note?: string; handoff?: ContextCapsule }) =>
    ipcRenderer.invoke("sessions:close", input),
  pauseSession: (id: string) => ipcRenderer.invoke("sessions:pause", id),
  resumeSession: (id: string) => ipcRenderer.invoke("sessions:resume", id),
  reviseProposal: (input: { id: string; startAction: string; completionCriteria: string; notDoing: string }) =>
    ipcRenderer.invoke("sessions:revise", input),
  updateCapsule: (input: { projectId: string; capsule: ContextCapsule }) => ipcRenderer.invoke("projects:capsule", input),
  resolveProject: (input: { projectId: string; outcome: ProjectOutcome | "active"; note: string; evidence?: string; revisitAt?: string }) =>
    ipcRenderer.invoke("projects:resolve", input),
  listPlans: () => ipcRenderer.invoke("plans:list"),
  savePlan: (input: { id?: string; draft: PlanDraft }) => ipcRenderer.invoke("plans:save", input),
  transitionPlan: (input: { id: string; status: "committed" | "active" | "closed"; note?: string }) => ipcRenderer.invoke("plans:transition", input),
  getWorkspaceHealth: () => ipcRenderer.invoke("workspace:health"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  testSettings: (input: { baseUrl: string; model: string; apiKey?: string }) =>
    ipcRenderer.invoke("settings:test", input),
  saveSettings: (input: {
    baseUrl: string;
    model: string;
    apiKey?: string;
    clearApiKey?: boolean;
  }) => ipcRenderer.invoke("settings:save", input),
  onOpenRequest: (callback: (request: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: unknown): void => callback(request);
    ipcRenderer.on("open-request", listener);
    return () => ipcRenderer.removeListener("open-request", listener);
  },
  onWorkspaceChanged: (callback: () => void) => {
    const listener = (): void => callback();
    ipcRenderer.on("workspace-changed", listener);
    return () => ipcRenderer.removeListener("workspace-changed", listener);
  },
  onOperationWarning: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string): void => callback(message);
    ipcRenderer.on("operation-warning", listener);
    return () => ipcRenderer.removeListener("operation-warning", listener);
  },
  onSessionDeadline: (callback: (sessionId: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, sessionId: string): void =>
      callback(sessionId);
    ipcRenderer.on("session-deadline", listener);
    return () => ipcRenderer.removeListener("session-deadline", listener);
  }
};

contextBridge.exposeInMainWorld("los", api);

export type LosApi = typeof api;
