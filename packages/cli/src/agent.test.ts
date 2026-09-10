import { describe, expect, it } from "vitest";
import type { LongTailProject, ResidencySession, ResidencyPlan } from "../../core/src";
import { analyzeProjectFast, localDate } from "../../core/src";
import { buildAgentContext } from "./agent";

const project = {
  id: "paper",
  title: "论文收尾",
  completionPercent: 20
} as LongTailProject;

const health = {
  ok: true,
  checkedAt: "2026-08-18T00:00:00.000Z",
  projectCount: 1,
  sessionCount: 0,
  backupCount: 0,
  issues: []
};

describe("agent context", () => {
  it("waits for explicit user confirmation before resuming paused work", () => {
    const context = buildAgentContext({ workspaceRoot: "/tmp/los", health, projects: [project],
      sessions: [{ id: "paused", taskTitle: "Review", status: "paused" } as ResidencySession] });
    expect(context.phase).toBe("residency_paused");
    expect(context.nextActions[1]).toMatchObject({ requiresUserConfirmation: true, command: "./.los/los session resume paused --json" });
  });
  it("prioritizes reviewing an existing proposal over its reserved daily capacity", () => {
    const plan = { id: "plan", status: "active", dailyMinutes: 25, startDate: localDate(), endDate: localDate(), intensity: "medium" } as ResidencyPlan;
    const session = { id: "session", status: "proposed", planId: "plan", workDate: localDate(), minutesPlanned: 25, elapsedSeconds: 0 } as ResidencySession;
    const context = buildAgentContext({ workspaceRoot: "/tmp/los", health, projects: [project], plans: [plan], sessions: [session] });
    expect(context.phase).toBe("review_proposal");
  });
  it("does not suggest work above plan capacity", () => {
    const plan = { id: "plan", status: "active", dailyMinutes: 15, startDate: localDate(), endDate: localDate(), intensity: "medium" } as ResidencyPlan;
    const context = buildAgentContext({ workspaceRoot: "/tmp/los", health, projects: [project], plans: [plan], sessions: [], minutes: 25, intensity: "medium" });
    expect(context.phase).toBe("plan_attention");
  });
  it("preserves the explicit project filter in the proposal command", () => {
    const context = buildAgentContext({ workspaceRoot: "/tmp/los", health, projects: [project], sessions: [], minutes: 25, intensity: "medium", projectId: "paper" });
    expect(context.nextActions[0].command).toContain("--project paper");
  });
  it("stops proposing when all tasks are done", () => {
    const model = analyzeProjectFast({ id: "paper", title: "Paper", brief: "Draft", now: new Date().toISOString(), intake: {
      completed: "Draft", remaining: "Submit", closeCriteria: "Receipt"
    } });
    model.taskGraph.tasks[0].status = "done";
    const context = buildAgentContext({ workspaceRoot: "/tmp/los", health, projects: [model], sessions: [], minutes: 25, intensity: "medium" });
    expect(context.phase).toBe("no_eligible_task");
  });
  it("asks for a project when no active project exists", () => {
    const context = buildAgentContext({
      workspaceRoot: "/tmp/los-alamos",
      health: { ...health, projectCount: 0 },
      projects: [],
      sessions: []
    });

    expect(context.phase).toBe("needs_project");
    expect(context.nextActions[0].type).toBe("ask_user");
  });

  it("asks for constraints before proposing work", () => {
    const context = buildAgentContext({
      workspaceRoot: "/tmp/los-alamos",
      health,
      projects: [project],
      sessions: []
    });

    expect(context.phase).toBe("needs_constraints");
    expect(context.nextActions[1].command).toContain("./.los/los agent context --minutes");
  });

  it("returns the exact proposal command when constraints are known", () => {
    const context = buildAgentContext({
      workspaceRoot: "/tmp/los-alamos",
      health,
      projects: [project],
      sessions: [],
      minutes: 25,
      intensity: "medium"
    });

    expect(context.phase).toBe("ready_to_propose");
    expect(context.nextActions[0].command).toBe(
      "./.los/los session propose --minutes 25 --intensity medium --json"
    );
  });

  it("requires confirmation for a proposed session", () => {
    const session = {
      id: "session-1",
      taskTitle: "确认关闭标准",
      status: "proposed"
    } as ResidencySession;
    const context = buildAgentContext({
      workspaceRoot: "/tmp/los-alamos",
      health,
      projects: [project],
      sessions: [session]
    });

    expect(context.phase).toBe("review_proposal");
    expect(context.nextActions[1].requiresUserConfirmation).toBe(true);
    expect(context.nextActions[1].command).toContain("./.los/los session start session-1");
  });

  it("never tells the agent to close an active session without feedback", () => {
    const session = {
      id: "session-1",
      taskTitle: "确认关闭标准",
      status: "active"
    } as ResidencySession;
    const context = buildAgentContext({
      workspaceRoot: "/tmp/los-alamos",
      health,
      projects: [project],
      sessions: [session]
    });

    expect(context.phase).toBe("residency_active");
    expect(context.nextActions.some((action) => action.type === "wait_for_user")).toBe(true);
    expect(context.nextActions.every((action) => !action.command?.includes("session close"))).toBe(true);
  });
});
