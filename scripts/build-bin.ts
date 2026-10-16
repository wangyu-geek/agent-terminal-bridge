import { mkdir } from "node:fs/promises"

const target = process.argv
  .find((item) => item.startsWith("--target="))
  ?.slice(9)
const targets = [
  "bun-darwin-arm64",
  "bun-darwin-x64",
  "bun-linux-x64",
  "bun-linux-arm64",
] as const
if (target && !targets.some((item) => item === target))
  throw new Error("Unsupported binary target")
await mkdir("dist", { recursive: true })
const result = await Bun.build({
  entrypoints: ["src/cli.ts"],
  compile: {
    ...(target ? { target: target as (typeof targets)[number] } : {}),
    outfile: target ? `dist/remote-terminal-${target}` : "dist/remote-terminal",
    autoloadDotenv: false,
    autoloadBunfig: false,
  },
})
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exitCode = 1
} else console.log("Built standalone remote-terminal")
