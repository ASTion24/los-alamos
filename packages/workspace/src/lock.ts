import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { getWorkspacePaths } from "./paths";

export async function withWorkspaceLock<T>(root: string | undefined, action: () => Promise<T>): Promise<T> {
  const runtime = getWorkspacePaths(root).runtime;
  await mkdir(runtime, { recursive: true });
  const path = join(runtime, "mutation.lock");
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const file = await open(path, "wx");
      await file.writeFile(String(process.pid));
      await file.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const pid = Number(await readFile(path, "utf8").catch(() => ""));
      if (pid > 0) {
        try { process.kill(pid, 0); }
        catch (failure) {
          if ((failure as NodeJS.ErrnoException).code === "ESRCH") {
            await unlink(path).catch(() => undefined);
            continue;
          }
        }
      }
      if (Date.now() > deadline) throw new Error("工作区正在写入，请稍后重试。");
      await setTimeout(30);
    }
  }
  try { return await action(); }
  finally { await unlink(path); }
}
