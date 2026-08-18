import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

const outputDirectory = resolve("out/agent");

await mkdir(outputDirectory, { recursive: true });
await build({
  entryPoints: [resolve("packages/cli/src/index.ts")],
  outfile: resolve(outputDirectory, "los.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false
});

await writeFile(
  resolve(outputDirectory, "package.json"),
  `${JSON.stringify(
    {
      name: "los-alamos-workspace",
      private: true,
      scripts: {
        los: "node .los/los.mjs"
      }
    },
    null,
    2
  )}\n`,
  "utf8"
);
