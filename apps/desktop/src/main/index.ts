import { app, BrowserWindow, ipcMain, Notification, safeStorage, shell } from "electron";
import { dirname, join } from "node:path";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { watch } from "node:fs";
import { OpenAiCompatibleProvider } from "../../../../packages/llm/src";
import {
  closeWorkspaceSession,
  cancelSessionProposal,
  createProject,
  ensureWorkspace,
  getWorkspacePaths,
  inspectWorkspace,
  listProjects,
  listSessions,
  proposeSession,
  reanalyzeProject,
  setProjectArchived,
  startWorkspaceSession,
  updateProjectBrief,
  updateProjectTask
} from "../../../../packages/workspace/src";
import type {
  Intensity,
  ResidencySession,
  SessionResult,
  WorkUnit
} from "../../../../packages/core/src";

let mainWindow: BrowserWindow | null = null;
let workspaceChangeTimer: NodeJS.Timeout | null = null;
const sessionDeadlineTimers = new Map<string, NodeJS.Timeout>();

interface LlmStoreSettings {
  baseUrl: string;
  model: string;
  encryptedApiKey?: string;
}

interface AppStoreSettings {
  aboutSeenVersion?: string;
}

interface SettingsSchema {
  llm: LlmStoreSettings;
  app: AppStoreSettings;
}

const aboutVersion = "1";

const defaultSettings: SettingsSchema = {
  llm: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini"
  },
  app: {}
};

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    title: "Los Alamos",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 18, y: 26 } : undefined,
    backgroundColor: "#f4f0e8",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.webContents.once("did-finish-load", () => {
    void deliverPendingOpenRequest();
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function registerIpc(): void {
  ipcMain.handle("workspace:root", async () => ensureWorkspace());
  ipcMain.handle("projects:list", async () => listProjects());
  ipcMain.handle("projects:create", async (_event, input: { title: string; brief: string }) => {
    const provider = await getProviderWithFallback(
      "模型配置不可用，已使用本地建模继续创建。"
    );
    if (!provider) {
      return createProject(input);
    }
    try {
      return await createProject({
        ...input,
        analyzer: (analysisInput) => provider.analyzeProject(analysisInput)
      });
    } catch (error) {
      sendOperationWarning(
        `模型分析失败，已使用本地建模继续创建。${providerErrorSummary(error)}`
      );
      return createProject(input);
    }
  });
  ipcMain.handle("projects:reanalyze", async (_event, projectId: string) => {
    const provider = await getProviderWithFallback(
      "模型配置不可用，已使用本地建模继续重建。"
    );
    try {
      return await reanalyzeProject({
        projectId,
        analyzer: provider ? (analysisInput) => provider.analyzeProject(analysisInput) : undefined
      });
    } catch (error) {
      if (!provider) throw error;
      sendOperationWarning(
        `模型分析失败，已使用本地建模继续重建。${providerErrorSummary(error)}`
      );
      return reanalyzeProject({ projectId });
    }
  });
  ipcMain.handle(
    "projects:update-brief",
    async (_event, input: { projectId: string; brief: string }) => updateProjectBrief(input)
  );
  ipcMain.handle(
    "projects:set-archived",
    async (_event, input: { projectId: string; archived: boolean }) =>
      setProjectArchived(input)
  );
  ipcMain.handle(
    "projects:update-task",
    async (
      _event,
      input: {
        projectId: string;
        taskId: string;
        patch: Partial<WorkUnit>;
      }
    ) => updateProjectTask(input)
  );
  ipcMain.handle("sessions:list", async () => listSessions());
  ipcMain.handle(
    "sessions:propose",
    async (_event, input: { minutes: number; intensity: Intensity }) => {
      const session = await proposeSession(input.minutes, input.intensity);
      return session;
    }
  );
  ipcMain.handle("sessions:start", async (_event, sessionId: string) => {
    const session = await startWorkspaceSession(sessionId);
    scheduleSessionDeadline(session);
    return session;
  });
  ipcMain.handle("sessions:cancel-proposal", async (_event, sessionId: string) =>
    cancelSessionProposal(sessionId)
  );
  ipcMain.handle(
    "sessions:close",
    async (_event, input: { sessionId: string; result: SessionResult; note?: string }) => {
      const provider = await getProviderWithFallback(
        "模型配置不可用，已使用本地规则完成驻留记录。"
      );
      const session = await closeWorkspaceSession({
        ...input,
        assessor: provider
          ? async (assessmentInput) => {
              try {
                return await provider.assessSession(assessmentInput);
              } catch (error) {
                sendOperationWarning(
                  `模型评估失败，已使用本地规则完成驻留记录。${providerErrorSummary(error)}`
                );
                return undefined;
              }
            }
          : undefined
      });
      cancelSessionDeadline(session.id);
      return session;
    }
  );
  ipcMain.handle("workspace:health", async () => inspectWorkspace());
  ipcMain.handle("workspace:show", async () => {
    const root = await ensureWorkspace();
    return shell.openPath(root);
  });
  ipcMain.handle("about:get-state", async () => {
    const settings = await readSettings();
    return {
      version: aboutVersion,
      shouldShow: settings.app.aboutSeenVersion !== aboutVersion
    };
  });
  ipcMain.handle("about:dismiss", async () => {
    const settings = await readSettings();
    await writeSettings({
      ...settings,
      app: {
        ...settings.app,
        aboutSeenVersion: aboutVersion
      }
    });
    return {
      version: aboutVersion,
      shouldShow: false
    };
  });
  ipcMain.handle("settings:get", async () => {
    const settings = (await readSettings()).llm;
    return {
      baseUrl: settings.baseUrl,
      model: settings.model,
      hasApiKey: Boolean(settings.encryptedApiKey)
    };
  });
  ipcMain.handle(
    "settings:test",
    async (
      _event,
      input: { baseUrl: string; model: string; apiKey?: string }
    ) => {
      const current = (await readSettings()).llm;
      const apiKey = input.apiKey?.trim() || decryptApiKey(current.encryptedApiKey);
      if (!apiKey) {
        throw new Error("请先输入或保存访问密钥。");
      }
      assertProviderSettings(input.baseUrl, input.model);
      return new OpenAiCompatibleProvider({
        baseUrl: input.baseUrl.trim(),
        model: input.model.trim(),
        apiKey
      }).testConnection();
    }
  );
  ipcMain.handle(
    "settings:save",
    async (
      _event,
      input: {
        baseUrl: string;
        model: string;
        apiKey?: string;
        clearApiKey?: boolean;
      }
    ) => {
      assertProviderSettings(input.baseUrl, input.model);
      const current = await readSettings();
      let encryptedApiKey = current.llm.encryptedApiKey;
      if (input.clearApiKey) {
        encryptedApiKey = undefined;
      } else if (input.apiKey?.trim()) {
        if (!safeStorage.isEncryptionAvailable()) {
          throw new Error("当前系统无法使用安全密钥存储。");
        }
        encryptedApiKey = safeStorage.encryptString(input.apiKey.trim()).toString("base64");
      }
      const llm = {
        baseUrl: input.baseUrl.trim().replace(/\/+$/, ""),
        model: input.model.trim(),
        encryptedApiKey
      };
      await writeSettings({
        ...current,
        llm
      });
      return {
        baseUrl: llm.baseUrl,
        model: llm.model,
        hasApiKey: Boolean(encryptedApiKey)
      };
    }
  );
}

function decryptApiKey(encryptedApiKey?: string): string | null {
  if (!encryptedApiKey || !safeStorage.isEncryptionAvailable()) {
    return null;
  }
  return safeStorage.decryptString(Buffer.from(encryptedApiKey, "base64"));
}

async function getConfiguredProvider(): Promise<OpenAiCompatibleProvider | null> {
  const settings = (await readSettings()).llm;
  const apiKey = decryptApiKey(settings.encryptedApiKey);
  if (!apiKey) {
    return null;
  }
  assertProviderSettings(settings.baseUrl, settings.model);
  return new OpenAiCompatibleProvider({
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiKey
  });
}

async function getProviderWithFallback(message: string): Promise<OpenAiCompatibleProvider | null> {
  try {
    return await getConfiguredProvider();
  } catch (error) {
    sendOperationWarning(`${message}${providerErrorSummary(error)}`);
    return null;
  }
}

async function readSettings(): Promise<SettingsSchema> {
  try {
    const content = await readFile(settingsPath(), "utf8");
    const parsed = JSON.parse(content) as Partial<SettingsSchema>;
    return {
      llm: {
        ...defaultSettings.llm,
        ...(parsed.llm ?? {})
      },
      app: {
        ...defaultSettings.app,
        ...(parsed.app ?? {})
      }
    };
  } catch {
    return defaultSettings;
  }
}

async function writeSettings(settings: SettingsSchema): Promise<void> {
  const path = settingsPath();
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, {
      encoding: "utf8",
      flag: "w"
    });
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function settingsPath(): string {
  return join(app.getPath("userData"), "settings.json");
}

async function watchOpenRequests(): Promise<void> {
  const root = await ensureWorkspace();
  const paths = getWorkspacePaths(root);

  watch(paths.runtime, async (_eventType, fileName) => {
    if (fileName !== "open-request.json") {
      return;
    }

    try {
      const content = await readFile(paths.openRequest, "utf8");
      const request = JSON.parse(content) as unknown;
      mainWindow?.webContents.send("open-request", request);
      mainWindow?.focus();
    } catch {
      // Ignore partial writes; the next change event will retry.
    }
  });
}

async function watchWorkspaceChanges(): Promise<void> {
  const root = await ensureWorkspace();
  const paths = getWorkspacePaths(root);
  const notify = (): void => {
    if (workspaceChangeTimer) clearTimeout(workspaceChangeTimer);
    workspaceChangeTimer = setTimeout(() => {
      mainWindow?.webContents.send("workspace-changed");
    }, 140);
  };

  watchDirectory(paths.projects, notify);
  watchDirectory(paths.sessions, notify);
}

function watchDirectory(path: string, listener: () => void): void {
  try {
    watch(path, { recursive: true }, listener);
  } catch {
    watch(path, listener);
  }
}

async function deliverPendingOpenRequest(): Promise<void> {
  const root = await ensureWorkspace();
  const paths = getWorkspacePaths(root);
  try {
    const content = await readFile(paths.openRequest, "utf8");
    const request = JSON.parse(content) as unknown;
    mainWindow?.webContents.send("open-request", request);
  } catch {
    // No pending request is a normal startup state.
  }
}

function assertProviderSettings(baseUrl: string, model: string): void {
  if (!model.trim()) {
    throw new Error("模型名不能为空。");
  }
  try {
    const url = new URL(baseUrl.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error();
    }
  } catch {
    throw new Error("接口地址必须是有效的 HTTP(S) URL。");
  }
}

function providerErrorSummary(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message ? ` 原因：${message.slice(0, 180)}` : "";
}

function sendOperationWarning(message: string): void {
  setTimeout(() => {
    mainWindow?.webContents.send("operation-warning", message);
  }, 300);
}

function scheduleSessionDeadline(session: ResidencySession): void {
  cancelSessionDeadline(session.id);
  if (session.status !== "active") return;
  const deadline =
    new Date(session.startedAt).getTime() + Math.max(1, session.minutesPlanned) * 60_000;
  const delay = Math.max(1_000, deadline - Date.now());
  const timer = setTimeout(() => {
    sessionDeadlineTimers.delete(session.id);
    if (Notification.isSupported()) {
      new Notification({
        title: "驻留计划时间已到",
        body: `${session.taskTitle}：可以结束并记录，也可以继续推进。`
      }).show();
    }
    mainWindow?.webContents.send("session-deadline", session.id);
  }, delay);
  sessionDeadlineTimers.set(session.id, timer);
}

function cancelSessionDeadline(sessionId: string): void {
  const timer = sessionDeadlineTimers.get(sessionId);
  if (timer) clearTimeout(timer);
  sessionDeadlineTimers.delete(sessionId);
}

app.whenReady().then(async () => {
  if (app.isPackaged) {
    process.env.LOS_ALAMOS_WORKSPACE = join(app.getPath("documents"), "Los Alamos");
    process.env.LOS_ALAMOS_PROTOCOL_ROOT = process.resourcesPath;
  }
  registerIpc();
  createWindow();
  await watchOpenRequests();
  await watchWorkspaceChanges();
  const activeSession = (await listSessions()).find((session) => session.status === "active");
  if (activeSession) scheduleSessionDeadline(activeSession);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
