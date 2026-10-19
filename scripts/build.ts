import { chmod } from "node:fs/promises"
import { requireBun } from "../src/runtime.ts"

requireBun()

const result = await Bun.build({
  entrypoints: ["src/cli.ts"],
  target: "bun",
  outdir: "dist",
  naming: "cli.js",
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exitCode = 1
} else {
  await chmod("dist/cli.js", 0o755)
  console.log("Built dist/cli.js (requires Bun)")
}
