import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  captureThought, convertCapture, listCaptures, listProjects, listSessions, previewFocus, startFocus,
  setCaptureShelved, updateProjectTask, updateProjectCapsule, readProject, inspectWorkspace,
  savePlan, transitionPlan, pauseWorkspaceSession, closeWorkspaceSession
} from "./store";
import { resolveArtifact } from "./artifacts";
import { localDate, suggestCapture } from "../../core/src";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "los-launcher-"));
  roots.push(root);
  const capture = await captureThought({ text: "论文：正文已有，只差引用核对；结束标准：取得提交回执。", workspaceRoot: root });
  return { root, capture };
}
async function prepared() {
  const { root, capture } = await setup();
  const project = await convertCapture({ id: capture.id, title: "论文", remaining: "核对引用", closeCriteria: "引用核验通过", workspaceRoot: root });
  return { root, project, capture };
}
const constraints = { minutes: 25, intensity: "medium" as const };

describe("attention capture", () => {
  it("keeps raw thoughts out of project progress and scheduling", async () => {
    const { root, capture } = await setup();
    expect(capture.text).toBe("论文：正文已有，只差引用核对；结束标准：取得提交回执。");
    expect(await listProjects(root)).toEqual([]);
    expect((await previewFocus(constraints, root)).session).toBeUndefined();
    expect((await inspectWorkspace(root)).ok).toBe(true);
  });
  it("makes suggestions only from explicit phrases", () => {
    expect(suggestCapture("论文：正文已完成，只差引用核对；结束标准：提交回执")).toEqual({
      title: "论文", remaining: "引用核对", closeCriteria: "提交回执"
    });
    expect(suggestCapture("大概完成80%，但不知道还差什么").remaining).toBe("");
  });
  it("can shelve and restore without deleting or pretending completion", async () => {
    const { root, capture } = await setup();
    const before = await readFile(join(root, "inbox", "events.jsonl"), "utf8");
    await setCaptureShelved({ id: capture.id, shelved: true, workspaceRoot: root });
    expect((await listCaptures(root))[0].status).toBe("shelved");
    await setCaptureShelved({ id: capture.id, shelved: false, workspaceRoot: root });
    expect((await listCaptures(root))[0].status).toBe("inbox");
    expect((await readFile(join(root, "inbox", "events.jsonl"), "utf8")).startsWith(before)).toBe(true);
  });
  it("requires confirmed actions and a stopping point, and conversion is idempotent", async () => {
    const { root, capture } = await setup();
    await expect(convertCapture({ id: capture.id, title: "Paper", remaining: "", closeCriteria: "Done", workspaceRoot: root })).rejects.toThrow();
    const input = { id: capture.id, title: "Paper", remaining: "Review", closeCriteria: "Reviewed", workspaceRoot: root };
    const [one, two] = await Promise.all([convertCapture(input), convertCapture(input)]);
    expect(one.id).toBe(two.id);
    expect(await listProjects(root)).toHaveLength(1);
    expect((await listCaptures(root))[0]).toMatchObject({ status: "converted", projectId: one.id, text: capture.text });
  });
  it("does not alter or pause the current session when capturing a distraction", async () => {
    const { root } = await prepared();
    const preview = await previewFocus(constraints, root);
    const session = await startFocus({ ...constraints, token: preview.token! }, root);
    await captureThought({ text: "记得续签域名", sourceSessionId: session.id, workspaceRoot: root });
    expect((await listSessions(root))[0].status).toBe("active");
    expect((await listCaptures(root)).find((item) => item.text === "记得续签域名")?.sourceSessionId).toBe(session.id);
  });
  it("rejects unsafe ids and invalid capture inputs", async () => {
    const { root } = await setup();
    await expect(captureThought({ text: " ", workspaceRoot: root })).rejects.toThrow();
    await expect(setCaptureShelved({ id: "../../outside", shelved: true, workspaceRoot: root })).rejects.toThrow("安全路径");
  });
});

describe("consented immediate start", () => {
  it("does not erase the saved entrance and boundary when calibrating progress", async () => {
    const { root, project } = await prepared();
    await updateProjectCapsule({ projectId: project.id, workspaceRoot: root,
      capsule: { ...project.capsule!, nextAction: "从第13条引用继续", notDoing: "不再增加实验" } });
    await updateProjectTask({ projectId: project.id, taskId: "t1", patch: { progressPercent: 50 }, workspaceRoot: root });
    const preview = await previewFocus(constraints, root);
    expect(preview.session?.startAction).toBe("从第13条引用继续");
    expect(preview.session?.notDoing).toContain("不再增加实验");
  });
  it("previews without writing a proposal or starting time", async () => {
    const { root } = await prepared();
    const one = await previewFocus(constraints, root);
    const two = await previewFocus(constraints, root);
    expect(one.token).toBe(two.token);
    expect(one.session?.startAction).toBe("核对引用");
    expect(await listSessions(root)).toHaveLength(0);
    const session = await startFocus({ ...constraints, token: one.token! }, root);
    expect(session.status).toBe("active");
    expect(session.startAction).toBe(one.session?.startAction);
    expect(session.completionCriteria).toBe(one.session?.completionCriteria);
  });
  it("rejects a stale preview after task mutation", async () => {
    const { root, project } = await prepared();
    const preview = await previewFocus(constraints, root);
    await updateProjectTask({ projectId: project.id, taskId: "t1", patch: { startAction: "Start elsewhere" }, workspaceRoot: root });
    await expect(startFocus({ ...constraints, token: preview.token! }, root)).rejects.toThrow("入口已变化");
    expect(await listSessions(root)).toHaveLength(0);
  });
  it("does not let the caller change constraints after consent", async () => {
    const { root } = await prepared();
    const preview = await previewFocus(constraints, root);
    await expect(startFocus({ ...constraints, minutes: 60, token: preview.token! }, root)).rejects.toThrow();
    await expect(startFocus({ ...constraints, token: "fabricated" }, root)).rejects.toThrow();
  });
  it("rejects duplicate start while retaining exactly one current session", async () => {
    const { root } = await prepared();
    const preview = await previewFocus(constraints, root);
    const results = await Promise.allSettled([
      startFocus({ ...constraints, token: preview.token! }, root),
      startFocus({ ...constraints, token: preview.token! }, root)
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(await listSessions(root)).toHaveLength(1);
    expect((await previewFocus(constraints, root)).currentSession?.status).toBe("active");
  });
  it("honors plan capacity, intensity, and date boundaries in preview", async () => {
    const { root, project } = await prepared();
    const plan = await savePlan({ draft: { title: "Window", projectIds: [project.id], startDate: localDate(), endDate: localDate(),
      dailyMinutes: 15, intensity: "low", exitCriteria: "A checkpoint", notDoing: "No expansion" }, workspaceRoot: root });
    await transitionPlan({ id: plan.id, status: "committed", workspaceRoot: root });
    await transitionPlan({ id: plan.id, status: "active", workspaceRoot: root });
    const preview = await previewFocus(constraints, root);
    expect(preview.token).toBeUndefined();
    expect(preview.message).toContain("强度");
  });
});

describe("material entrances", () => {
  it("opens only a material recorded by the user and never executes scripts", async () => {
    const { root, project } = await prepared();
    const note = join(root, "draft.md");
    const script = join(root, "script.sh");
    await writeFile(note, "# Test material");
    await writeFile(script, "exit 0");
    await updateProjectCapsule({ projectId: project.id, workspaceRoot: root,
      capsule: { ...project.capsule!, artifacts: [note, script, "https://example.com/document", "javascript:alert(1)"] } });
    expect((await resolveArtifact(project.id, note, root)).kind).toBe("document");
    expect((await resolveArtifact(project.id, script, root)).kind).toBe("reveal");
    expect((await resolveArtifact(project.id, "https://example.com/document", root)).kind).toBe("url");
    await expect(resolveArtifact(project.id, "javascript:alert(1)", root)).rejects.toThrow();
    await expect(resolveArtifact(project.id, "/etc/passwd", root)).rejects.toThrow("不在");
  });
  it("keeps existing decisions and materials in a minimal session handoff", async () => {
    const { root, project } = await prepared();
    const capsule = { ...project.capsule!, artifacts: ["/tmp/reference.md"], decisions: ["No new experiments"] };
    await updateProjectCapsule({ projectId: project.id, capsule, workspaceRoot: root });
    const preview = await previewFocus(constraints, root);
    const session = await startFocus({ ...constraints, token: preview.token! }, root);
    await pauseWorkspaceSession(session.id, root);
    await closeWorkspaceSession({ sessionId: session.id, result: "partial",
      handoff: { ...capsule, summary: "Section one checked", nextAction: "Continue at two" }, workspaceRoot: root });
    const updated = await readProject(project.id, root);
    expect(updated.capsule?.artifacts).toEqual(capsule.artifacts);
    expect(updated.capsule?.decisions).toEqual(capsule.decisions);
    expect((await previewFocus(constraints, root)).session?.startAction).toBe("Continue at two");
  });
});
