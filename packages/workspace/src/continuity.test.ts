import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProject, updateProjectCapsule, proposeSession, startWorkspaceSession, pauseWorkspaceSession,
  resumeWorkspaceSession, closeWorkspaceSession, recoverInterruptedSessions, readSession,
  readProject, updateProjectTask, resolveProject, savePlan, transitionPlan, listPlans, listSessions,
  reanalyzeProject, reviseProposal, inspectWorkspace, updateProjectBrief
} from "./store";
import { sessionPath, projectEventsPath, projectModelPath, projectBriefPath } from "./paths";
import { localDate, sessionElapsedSeconds, type PlanDraft } from "../../core/src";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "los-continuity-"));
  roots.push(root);
  const project = await createProject({ title: "Paper", brief: "Draft exists.", workspaceRoot: root,
    intake: { completed: "Draft", remaining: "Review\nSubmit", closeCriteria: "Submission receipt", progressEstimate: 80 } });
  return { root, project };
}
function draft(projectId: string): PlanDraft {
  return { title: "A quiet window", projectIds: [projectId], startDate: localDate(), endDate: localDate(),
    dailyMinutes: 30, intensity: "medium", notDoing: "No new projects", exitCriteria: "Submission receipt" };
}

describe("persistent continuity", () => {
  it("carries an edited capsule into a proposal and leaves history immutable", async () => {
    const { root, project } = await setup();
    const previousEvents = await readFile(projectEventsPath(root, project.id), "utf8");
    await updateProjectCapsule({ projectId: project.id, workspaceRoot: root,
      capsule: { ...project.capsule!, summary: "Reviewed section one", nextAction: "Open section two", artifacts: ["/tmp/paper.md"] } });
    const proposal = await proposeSession(25, "medium", root, project.id);
    expect(proposal?.startAction).toBe("Open section two");
    expect(proposal?.capsule?.artifacts).toEqual(["/tmp/paper.md"]);
    expect((await readFile(projectEventsPath(root, project.id), "utf8")).startsWith(previousEvents)).toBe(true);
  });
  it("does not permit live task edits or graph replacement", async () => {
    const { root, project } = await setup();
    await proposeSession(25, "medium", root);
    await expect(reanalyzeProject({ projectId: project.id, workspaceRoot: root })).rejects.toThrow("当前驻留");
    await expect(updateProjectTask({ projectId: project.id, taskId: "t1", patch: { status: "done" }, workspaceRoot: root })).rejects.toThrow("当前驻留");
  });
  it("preserves partial evidence and reuses the exact next entrance", async () => {
    const { root, project } = await setup();
    const proposal = await proposeSession(25, "medium", root);
    await startWorkspaceSession(proposal!.id, root);
    const closed = await closeWorkspaceSession({ sessionId: proposal!.id, result: "partial", workspaceRoot: root,
      handoff: { ...project.capsule!, summary: "Section one verified", nextAction: "Verify section two" } });
    expect(closed.handoff?.summary).toBe("Section one verified");
    expect((await readProject(project.id, root)).completionPercent).toBe(0);
    expect((await proposeSession(25, "medium", root))?.startAction).toBe("Verify section two");
  });
  it("pauses and resumes without charging time spent away", async () => {
    const { root } = await setup();
    const proposal = await proposeSession(25, "medium", root);
    const active = await startWorkspaceSession(proposal!.id, root);
    const start = new Date(Date.now() - 120_000).toISOString();
    await writeFile(sessionPath(root, active.id), JSON.stringify({ ...active, startedAt: start, lastResumedAt: start }));
    const paused = await pauseWorkspaceSession(active.id, root);
    expect(paused.elapsedSeconds).toBeGreaterThanOrEqual(120);
    expect(sessionElapsedSeconds(paused, Date.now() + 86400_000)).toBe(paused.elapsedSeconds);
    const resumed = await resumeWorkspaceSession(active.id, root);
    expect(resumed.elapsedSeconds).toBe(paused.elapsedSeconds);
    expect(resumed.status).toBe("active");
    await pauseWorkspaceSession(active.id, root);
    expect((await closeWorkspaceSession({ sessionId: active.id, result: "partial", workspaceRoot: root })).status).toBe("closed");
  });
  it("recovers to the last heartbeat instead of counting overnight downtime", async () => {
    const { root } = await setup();
    const proposal = await proposeSession(25, "medium", root);
    const session = await startWorkspaceSession(proposal!.id, root);
    const start = new Date(Date.now() - 86400_000).toISOString();
    const heartbeat = new Date(Date.parse(start) + 60_000).toISOString();
    await writeFile(sessionPath(root, session.id), JSON.stringify({ ...session, startedAt: start, lastResumedAt: start, heartbeatAt: heartbeat }));
    await recoverInterruptedSessions(root);
    const recovered = await readSession(session.id, root);
    expect(recovered.status).toBe("paused");
    expect(recovered.elapsedSeconds).toBe(60);
    expect((await proposeSession(25, "medium", root))?.id).toBe(session.id);
  });
  it("serializes concurrent proposals and closes exactly once", async () => {
    const { root } = await setup();
    const proposals = await Promise.all([proposeSession(25, "medium", root), proposeSession(25, "medium", root)]);
    expect(proposals[0]?.id).toBe(proposals[1]?.id);
    const session = await startWorkspaceSession(proposals[0]!.id, root);
    const results = await Promise.allSettled([
      closeWorkspaceSession({ sessionId: session.id, result: "completed", workspaceRoot: root }),
      closeWorkspaceSession({ sessionId: session.id, result: "completed", workspaceRoot: root })
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await listSessions(root)).filter((item) => item.status === "closed")).toHaveLength(1);
  });
  it("keeps checkpoint scope after a user calibrates the boundary", async () => {
    const { root } = await setup();
    const proposal = await proposeSession(5, "medium", root);
    const revised = await reviseProposal({ id: proposal!.id, startAction: "Read one paragraph", completionCriteria: "One paragraph checked", notDoing: "No rewriting", workspaceRoot: root });
    expect(revised.scope).toBe("checkpoint");
    await startWorkspaceSession(revised.id, root);
    await expect(reviseProposal({ id: revised.id, startAction: "X", completionCriteria: "Y", notDoing: "Z", workspaceRoot: root })).rejects.toThrow();
  });
  it("does not transfer completion when a regenerated task reuses an id for different work", async () => {
    const { root, project } = await setup();
    await updateProjectTask({ projectId: project.id, taskId: "t1", patch: { status: "done" }, workspaceRoot: root });
    await updateProjectBrief({ projectId: project.id, brief: "New fact", intake: { completed: "Review done", remaining: "New experiment", closeCriteria: "Result" }, workspaceRoot: root });
    const rebuilt = await reanalyzeProject({ projectId: project.id, workspaceRoot: root });
    expect(rebuilt.taskGraph.tasks[0].status).toBe("todo");
    expect(rebuilt.completionPercent).toBe(0);
  });
  it("rejects invalid numbers before corrupting a model", async () => {
    const { root, project } = await setup();
    await expect(updateProjectTask({ projectId: project.id, taskId: "t1", patch: { effortMinutes: NaN }, workspaceRoot: root })).rejects.toThrow();
    expect((await inspectWorkspace(root)).ok).toBe(true);
  });
  it("reads old models without introducing fabricated context", async () => {
    const { root, project } = await setup();
    const legacy = { ...project };
    delete legacy.capsule; delete legacy.intake;
    await writeFile(projectModelPath(root, project.id), JSON.stringify(legacy));
    await writeFile(projectBriefPath(root, project.id), project.brief);
    const loaded = await readProject(project.id, root);
    expect(loaded.capsule).toBeUndefined();
    expect((await proposeSession(25, "medium", root))?.capsule?.summary).toBe(project.compact);
  });
  it("persists structured intake in authoritative facts and detects external edits", async () => {
    const { root, project } = await setup();
    expect(await readFile(projectBriefPath(root, project.id), "utf8")).toContain('"remaining": "Review\\nSubmit"');
    await writeFile(projectBriefPath(root, project.id), "New scope confirmed by user.");
    const changed = await readProject(project.id, root);
    expect(changed.modelNeedsReview).toBe(true);
    expect(changed.intake).toBeUndefined();
    expect(changed.capsule?.summary).toBe("New scope confirmed by user.");
    expect(await proposeSession(25, "medium", root)).toBeNull();
  });
});

describe("explicit project decisions", () => {
  it("requires evidence for closure and a revisit date for parking", async () => {
    const { root, project } = await setup();
    await expect(resolveProject({ projectId: project.id, outcome: "closed", note: "Done", workspaceRoot: root })).rejects.toThrow("证据");
    await expect(resolveProject({ projectId: project.id, outcome: "parked", note: "Later", workspaceRoot: root })).rejects.toThrow("回看日期");
  });
  it("removes a resolved project from scheduling without falsifying progress, and restores it", async () => {
    const { root, project } = await setup();
    const resolved = await resolveProject({ projectId: project.id, outcome: "closed", note: "Accepted current scope", evidence: "Receipt exists", workspaceRoot: root });
    expect(resolved.completionPercent).toBe(0);
    expect(await proposeSession(25, "medium", root)).toBeNull();
    await resolveProject({ projectId: project.id, outcome: "active", note: "New scope approved", workspaceRoot: root });
    expect((await proposeSession(25, "medium", root))?.projectId).toBe(project.id);
  });
});

describe("optional residency plans", () => {
  it("does not block a one-off session while the plan is still a draft", async () => {
    const { root, project } = await setup();
    await savePlan({ draft: draft(project.id), workspaceRoot: root });
    expect((await proposeSession(25, "medium", root))?.planId).toBeUndefined();
  });
  it("requires commitment before starting and enforces scope, intensity, and daily capacity", async () => {
    const { root, project } = await setup();
    const second = await createProject({ title: "Other", brief: "Open", workspaceRoot: root });
    const plan = await savePlan({ draft: draft(project.id), workspaceRoot: root });
    await expect(transitionPlan({ id: plan.id, status: "active", workspaceRoot: root })).rejects.toThrow("确认");
    await transitionPlan({ id: plan.id, status: "committed", workspaceRoot: root });
    await transitionPlan({ id: plan.id, status: "active", workspaceRoot: root });
    await expect(proposeSession(25, "high", root)).rejects.toThrow("强度");
    await expect(proposeSession(25, "medium", root, second.id)).rejects.toThrow("范围");
    await expect(proposeSession(35, "medium", root)).rejects.toThrow("容量");
    const session = await proposeSession(25, "medium", root);
    expect(session?.planId).toBe(plan.id);
    expect(session?.projectId).toBe(project.id);
    await startWorkspaceSession(session!.id, root);
    await expect(transitionPlan({ id: plan.id, status: "closed", note: "Done", workspaceRoot: root })).rejects.toThrow("当前驻留");
    await closeWorkspaceSession({ sessionId: session!.id, result: "partial", workspaceRoot: root });
    const closed = await transitionPlan({ id: plan.id, status: "closed", note: "Window finished", workspaceRoot: root });
    expect(closed.status).toBe("closed");
    expect((await listPlans(root))[0].closingNote).toBe("Window finished");
  });
  it("permits only one unfinished plan and validates dates and ids", async () => {
    const { root, project } = await setup();
    await expect(savePlan({ draft: { ...draft(project.id), startDate: "2026-02-30" }, workspaceRoot: root })).rejects.toThrow("有效日期");
    await expect(savePlan({ draft: { ...draft("../../bad") }, workspaceRoot: root })).rejects.toThrow("安全路径");
    await savePlan({ draft: draft(project.id), workspaceRoot: root });
    await expect(savePlan({ draft: draft(project.id), workspaceRoot: root })).rejects.toThrow("已有驻留计划");
  });
});
