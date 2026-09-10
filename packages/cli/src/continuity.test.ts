import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);
it("completes the public CLI continuity workflow in a separate workspace", async () => {
  const root = await mkdtemp(join(tmpdir(), "los-cli-acceptance-"));
  const cli = async (...args: string[]) => {
    const output = await execute(process.execPath, ["--import", "tsx", resolve("packages/cli/src/index.ts"), ...args, "--json"], {
      env: { ...process.env, LOS_ALAMOS_WORKSPACE: root },
      timeout: 15000
    });
    return JSON.parse(output.stdout);
  };
  try {
    expect((await cli("agent", "context")).phase).toBe("needs_project");
    const facts = join(root, "intake.json");
    await writeFile(facts, JSON.stringify({ completed: "Draft", remaining: "Review", closeCriteria: "Verified draft" }));
    const project = await cli("project", "add", "--title", "CLI acceptance", "--brief", "Draft exists", "--intake-file", facts);
    const context = await cli("agent", "context", "--minutes", "25", "--intensity", "medium", "--project", project.id);
    expect(context.phase).toBe("ready_to_propose");
    const proposal = await cli("session", "propose", "--minutes", "25", "--intensity", "medium", "--project", project.id);
    expect((await cli("agent", "context")).phase).toBe("review_proposal");
    await cli("session", "start", proposal.id);
    await cli("session", "pause", proposal.id);
    expect((await cli("agent", "context")).phase).toBe("residency_paused");
    await cli("session", "resume", proposal.id);
    const handoffFile = join(root, "handoff.json");
    await writeFile(handoffFile, JSON.stringify({ ...project.capsule, summary: "Review confirmed", nextAction: "" }));
    const closed = await cli("session", "close", proposal.id, "--result", "completed", "--handoff-file", handoffFile);
    expect(closed.handoff.summary).toBe("Review confirmed");
    await cli("project", "resolve", project.id, "--outcome", "closed", "--note", "Accepted", "--evidence", "Verified file");
    expect((await cli("workspace", "health")).ok).toBe(true);
    expect((await cli("project", "inspect", project.id)).resolution.outcome).toBe("closed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
