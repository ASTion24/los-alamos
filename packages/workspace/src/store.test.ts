import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cancelSessionProposal,
  closeWorkspaceSession,
  createProject,
  inspectWorkspace,
  proposeSession,
  readProject,
  reanalyzeProject,
  setProjectArchived,
  startWorkspaceSession,
  updateProjectBrief,
  updateProjectTask
} from "./store";
import { projectBriefPath, projectModelPath } from "./paths";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "los-alamos-"));
  roots.push(root);
  return root;
}

describe("workspace store", () => {
  it("rejects empty project input", async () => {
    const root = await workspace();

    await expect(
      createProject({
        title: "   ",
        brief: "Facts.",
        workspaceRoot: root
      })
    ).rejects.toThrow("项目标题不能为空");
    await expect(
      createProject({
        title: "Pilot",
        brief: "   ",
        workspaceRoot: root
      })
    ).rejects.toThrow("项目事实不能为空");
  });

  it("rejects path traversal in project and session ids", async () => {
    const root = await workspace();

    await expect(readProject("../../outside", root)).rejects.toThrow("安全路径段");
    await expect(startWorkspaceSession("../outside", root)).rejects.toThrow("安全路径段");
  });

  it("recomputes weighted progress after a task update", async () => {
    const root = await workspace();
    const project = await createProject({
      title: "Pilot",
      brief: "Draft exists. A final review and closure decision remain.",
      workspaceRoot: root
    });

    const updated = await updateProjectTask({
      projectId: project.id,
      taskId: "t1",
      patch: { progressPercent: 50 },
      workspaceRoot: root
    });

    expect(updated.taskGraph.tasks.find((task) => task.id === "t1")?.status).toBe("in_progress");
    expect(updated.completionPercent).toBe(6);
    expect((await readProject(project.id, root)).completionPercent).toBe(6);
  });

  it("rejects cyclic dependency edits", async () => {
    const root = await workspace();
    const project = await createProject({
      title: "Pilot",
      brief: "Draft exists. A final review and closure decision remain.",
      workspaceRoot: root
    });

    await expect(
      updateProjectTask({
        projectId: project.id,
        taskId: "t1",
        patch: { dependsOn: ["t4"] },
        workspaceRoot: root
      })
    ).rejects.toThrow("不能形成循环");
  });

  it("rejects invalid task states at the workspace boundary", async () => {
    const root = await workspace();
    const project = await createProject({
      title: "Pilot",
      brief: "Draft exists. A final review remains.",
      workspaceRoot: root
    });

    await expect(
      updateProjectTask({
        projectId: project.id,
        taskId: "t1",
        patch: { status: "mistyped" as never },
        workspaceRoot: root
      })
    ).rejects.toThrow("任务状态无效");
  });

  it("returns the existing proposal instead of creating another", async () => {
    const root = await workspace();
    await createProject({
      title: "Pilot",
      brief: "Draft exists. A final review and closure decision remain.",
      workspaceRoot: root
    });

    const first = await proposeSession(25, "medium", root);
    const second = await proposeSession(60, "high", root);

    expect(first?.id).toBe(second?.id);
    expect(first?.status).toBe("proposed");
  });

  it("starts a proposal only after explicit confirmation", async () => {
    const root = await workspace();
    await createProject({
      title: "Pilot",
      brief: "Draft exists. A final review and closure decision remain.",
      workspaceRoot: root
    });
    const proposal = await proposeSession(25, "medium", root);
    const started = await startWorkspaceSession(proposal!.id, root);

    expect(started.status).toBe("active");
    expect(started.revision).toBe(2);
  });

  it("keeps a cancelled proposal in the audit trail and allows another proposal", async () => {
    const root = await workspace();
    await createProject({
      title: "Pilot",
      brief: "Draft exists. A final review and closure decision remain.",
      workspaceRoot: root
    });
    const first = await proposeSession(25, "medium", root);
    const cancelled = await cancelSessionProposal(first!.id, root);
    const second = await proposeSession(45, "high", root);

    expect(cancelled.status).toBe("cancelled");
    expect(second?.id).not.toBe(first?.id);
  });

  it("preserves task progress when rebuilding a graph with stable task ids", async () => {
    const root = await workspace();
    const project = await createProject({
      title: "Pilot",
      brief: "Draft exists. A final review and closure decision remain.",
      workspaceRoot: root
    });
    await updateProjectTask({
      projectId: project.id,
      taskId: "t1",
      patch: { status: "done", progressPercent: 100, notes: "Closing line approved." },
      workspaceRoot: root
    });

    const rebuilt = await reanalyzeProject({
      projectId: project.id,
      workspaceRoot: root
    });
    const preserved = rebuilt.taskGraph.tasks.find((task) => task.id === "t1");

    expect(preserved?.status).toBe("done");
    expect(preserved?.progressPercent).toBe(100);
    expect(preserved?.notes).toBe("Closing line approved.");
    expect(rebuilt.completionPercent).toBe(12);
  });

  it("rejects closing the same session twice", async () => {
    const root = await workspace();
    await createProject({
      title: "Pilot",
      brief: "Draft exists. A final review and closure decision remain.",
      workspaceRoot: root
    });
    const proposal = await proposeSession(25, "medium", root);
    const session = await startWorkspaceSession(proposal!.id, root);
    await closeWorkspaceSession({
      sessionId: session!.id,
      result: "partial",
      workspaceRoot: root
    });

    await expect(
      closeWorkspaceSession({
        sessionId: session!.id,
        result: "completed",
        workspaceRoot: root
      })
    ).rejects.toThrow("已经关闭");
  });

  it("rejects invalid session results at the workspace boundary", async () => {
    const root = await workspace();
    await createProject({
      title: "Pilot",
      brief: "Draft exists. A final review remains.",
      workspaceRoot: root
    });
    const proposal = await proposeSession(25, "medium", root);
    const session = await startWorkspaceSession(proposal!.id, root);

    await expect(
      closeWorkspaceSession({
        sessionId: session.id,
        result: "mistyped" as never,
        workspaceRoot: root
      })
    ).rejects.toThrow("驻留结果必须是");
  });

  it("treats brief.md as authoritative and persists brief updates", async () => {
    const root = await workspace();
    const project = await createProject({
      title: "Pilot",
      brief: "Initial facts.",
      workspaceRoot: root
    });

    await writeFile(
      projectBriefPath(root, project.id),
      "Facts changed by a coding agent.\n",
      "utf8"
    );
    expect((await readProject(project.id, root)).brief).toBe(
      "Facts changed by a coding agent."
    );

    const updated = await updateProjectBrief({
      projectId: project.id,
      brief: "Facts saved by the desktop app.",
      workspaceRoot: root
    });
    expect(updated.brief).toBe("Facts saved by the desktop app.");
    expect((await readProject(project.id, root)).brief).toBe(
      "Facts saved by the desktop app."
    );
  });

  it("reads the last valid backup when the primary model is damaged", async () => {
    const root = await workspace();
    const project = await createProject({
      title: "Pilot",
      brief: "Draft exists. A review remains.",
      workspaceRoot: root
    });
    await updateProjectTask({
      projectId: project.id,
      taskId: "t1",
      patch: { progressPercent: 50 },
      workspaceRoot: root
    });

    await writeFile(projectModelPath(root, project.id), "{broken", "utf8");
    const recovered = await readProject(project.id, root);
    const health = await inspectWorkspace(root);

    expect(recovered.id).toBe(project.id);
    expect(health.ok).toBe(true);
    expect(health.issues.some((issue) => issue.code === "recoverable_json")).toBe(true);
  });

  it("does not schedule archived projects", async () => {
    const root = await workspace();
    const project = await createProject({
      title: "Pilot",
      brief: "Draft exists. A review remains.",
      workspaceRoot: root
    });
    await setProjectArchived({
      projectId: project.id,
      archived: true,
      workspaceRoot: root
    });

    expect(await proposeSession(25, "medium", root)).toBeNull();
  });

  it("copies agent instructions and the built-in skill into each workspace", async () => {
    const root = await workspace();
    await createProject({
      title: "Pilot",
      brief: "Draft exists. A review remains.",
      workspaceRoot: root
    });

    const skill = await readFile(
      join(root, "skills", "los-alamos-residency", "SKILL.md"),
      "utf8"
    );
    const readme = await readFile(join(root, "README.md"), "utf8");
    const traeSkill = await readFile(
      join(root, ".trae", "skills", "los-alamos-residency", "SKILL.md"),
      "utf8"
    );
    const agentSchema = await readFile(
      join(root, "schemas", "agent-context.schema.json"),
      "utf8"
    );
    expect(skill).toContain("./.los/los agent context --json");
    expect(readme).toContain("# 关于 Los Alamos");
    expect(traeSkill).toBe(skill);
    expect(agentSchema).toContain('"title": "Los Alamos AgentContext"');
  });

  it("copies the standalone runtime and creates npm-free launchers", async () => {
    const sourceRoot = await workspace();
    const root = await workspace();
    await mkdir(join(sourceRoot, "agent"), { recursive: true });
    await writeFile(join(sourceRoot, "agent", "los.mjs"), "console.log('ok');\n", "utf8");
    await writeFile(join(sourceRoot, "agent", "package.json"), "{}\n", "utf8");
    const previousProtocolRoot = process.env.LOS_ALAMOS_PROTOCOL_ROOT;
    process.env.LOS_ALAMOS_PROTOCOL_ROOT = sourceRoot;
    try {
      await createProject({
        title: "Pilot",
        brief: "Draft exists. A review remains.",
        workspaceRoot: root
      });
    } finally {
      if (previousProtocolRoot === undefined) {
        delete process.env.LOS_ALAMOS_PROTOCOL_ROOT;
      } else {
        process.env.LOS_ALAMOS_PROTOCOL_ROOT = previousProtocolRoot;
      }
    }

    const launcher = await readFile(join(root, ".los", "los"), "utf8");
    const runtime = await readFile(join(root, ".los", "los.mjs"), "utf8");

    expect(launcher).toContain('exec node "$SCRIPT_DIR/los.mjs" "$@"');
    expect(launcher).toContain("LOS_ALAMOS_DESKTOP_EXECUTABLE");
    expect(runtime).toContain("console.log('ok')");
  });

  it("persists the stable Windows portable executable in workspace launchers", async () => {
    const sourceRoot = await workspace();
    const root = await workspace();
    await mkdir(join(sourceRoot, "agent"), { recursive: true });
    await writeFile(join(sourceRoot, "agent", "los.mjs"), "console.log('ok');\n", "utf8");
    await writeFile(join(sourceRoot, "agent", "package.json"), "{}\n", "utf8");
    const previousProtocolRoot = process.env.LOS_ALAMOS_PROTOCOL_ROOT;
    const previousPortableExecutable = process.env.PORTABLE_EXECUTABLE_FILE;
    process.env.LOS_ALAMOS_PROTOCOL_ROOT = sourceRoot;
    process.env.PORTABLE_EXECUTABLE_FILE = "C:\\Tools\\Los Alamos Portable.exe";
    try {
      await createProject({
        title: "Portable pilot",
        brief: "The portable runtime must remain discoverable after exit.",
        workspaceRoot: root
      });
    } finally {
      if (previousProtocolRoot === undefined) {
        delete process.env.LOS_ALAMOS_PROTOCOL_ROOT;
      } else {
        process.env.LOS_ALAMOS_PROTOCOL_ROOT = previousProtocolRoot;
      }
      if (previousPortableExecutable === undefined) {
        delete process.env.PORTABLE_EXECUTABLE_FILE;
      } else {
        process.env.PORTABLE_EXECUTABLE_FILE = previousPortableExecutable;
      }
    }

    const launcher = await readFile(join(root, ".los", "los.cmd"), "utf8");

    expect(launcher).toContain(
      'set "LOS_ALAMOS_DESKTOP_EXECUTABLE=C:\\Tools\\Los Alamos Portable.exe"'
    );
    expect(launcher).toContain('"C:\\Tools\\Los Alamos Portable.exe" "%~dp0los.mjs" %*');
  });

  it("creates a persistent runtime fallback for Linux AppImages", async () => {
    const sourceRoot = await workspace();
    const root = await workspace();
    await mkdir(join(sourceRoot, "agent"), { recursive: true });
    await writeFile(join(sourceRoot, "agent", "los.mjs"), "console.log('ok');\n", "utf8");
    await writeFile(join(sourceRoot, "agent", "package.json"), "{}\n", "utf8");
    const previousProtocolRoot = process.env.LOS_ALAMOS_PROTOCOL_ROOT;
    const previousAppImage = process.env.APPIMAGE;
    process.env.LOS_ALAMOS_PROTOCOL_ROOT = sourceRoot;
    process.env.APPIMAGE = "/opt/Los Alamos.AppImage";
    try {
      await createProject({
        title: "AppImage pilot",
        brief: "The AppImage runtime must remain discoverable after exit.",
        workspaceRoot: root
      });
    } finally {
      if (previousProtocolRoot === undefined) {
        delete process.env.LOS_ALAMOS_PROTOCOL_ROOT;
      } else {
        process.env.LOS_ALAMOS_PROTOCOL_ROOT = previousProtocolRoot;
      }
      if (previousAppImage === undefined) {
        delete process.env.APPIMAGE;
      } else {
        process.env.APPIMAGE = previousAppImage;
      }
    }

    const launcher = await readFile(join(root, ".los", "los"), "utf8");

    expect(launcher).toContain(
      "export LOS_ALAMOS_DESKTOP_EXECUTABLE='/opt/Los Alamos.AppImage'"
    );
    expect(launcher).toContain('"$LOS_ALAMOS_DESKTOP_EXECUTABLE" --appimage-extract');
    expect(launcher).toContain('exec "$runtime_binary" "$SCRIPT_DIR/los.mjs" "$@"');
  });
});
