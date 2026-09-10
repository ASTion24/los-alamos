import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);
it("supports capture and consented focus start through the public CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "los-cli-launcher-"));
  const cli = async (...args: string[]) => {
    const output = await execute(process.execPath, ["--import", "tsx", resolve("packages/cli/src/index.ts"), ...args, "--json"], {
      env: { ...process.env, LOS_ALAMOS_WORKSPACE: root }, timeout: 15000
    });
    return JSON.parse(output.stdout);
  };
  try {
    const capture = await cli("inbox", "add", "--text", "Paper is ready. Review the final references.");
    expect((await cli("agent", "context")).workspace.inboxCount).toBe(1);
    expect(await cli("project", "list")).toHaveLength(0);
    await cli("inbox", "shelve", capture.id);
    await cli("inbox", "restore", capture.id);
    const project = await cli("inbox", "prepare", capture.id, "--title", "Paper", "--remaining", "Review references", "--closing", "References checked");
    const options = ["--minutes", "25", "--intensity", "medium", "--project", project.id];
    const preview = await cli("focus", "preview", ...options);
    expect(preview.session.startAction).toBe("Review references");
    const session = await cli("focus", "start", ...options, "--token", preview.token);
    expect(session.status).toBe("active");
    expect((await cli("agent", "context")).phase).toBe("residency_active");
    await cli("inbox", "add", "--text", "A distraction", "--session", session.id);
    expect((await cli("agent", "context")).phase).toBe("residency_active");
    await cli("session", "close", session.id, "--result", "partial", "--note", "Checked section one");
    expect((await cli("workspace", "health")).ok).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30000);
