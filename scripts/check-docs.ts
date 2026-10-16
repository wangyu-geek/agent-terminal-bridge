import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { readdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { object } from "../src/validate.ts"

const root = resolve(import.meta.dir, "..")
const ignored = new Set([
  "node_modules",
  "dist",
  "artifacts",
  ".git",
  "coverage",
])
const files: string[] = []
async function visit(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await visit(path)
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(path)
  }
}
await visit(root)
let links = 0
let json = 0
let shell = 0
for (const file of files) {
  const text = await Bun.file(file).text()
  const blocks = [
    ...text.matchAll(/^([ \t]*)```([^\n]*)\n([\s\S]*?)^\1```[ \t]*$/gm),
  ]
  assert.equal(
    (text.match(/^[ \t]*```/gm) ?? []).length,
    blocks.length * 2,
    file,
  )
  for (const block of blocks) {
    const language = block[2]?.trim()
    const body = block[3] ?? ""
    if (language === "json") {
      JSON.parse(body)
      json++
    }
    if (language === "bash") {
      const child = Bun.spawn(["/bin/bash", "-n"], {
        stdin: new TextEncoder().encode(body),
        stdout: "pipe",
        stderr: "pipe",
      })
      const [code, , error] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      assert.equal(code, 0, `${file}: ${error}`)
      shell++
    }
  }
  for (const link of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = link[1] ?? ""
    if (target.includes("://") || target.startsWith("#")) continue
    assert(
      existsSync(resolve(dirname(file), target.split("#")[0] ?? "")),
      `${file}: ${target}`,
    )
    links++
  }
  assert(!/[ \t]+$/m.test(text), `${file}: trailing whitespace`)
}
const workflow = object(
  Bun.YAML.parse(await Bun.file(join(root, ".github/workflows/ci.yml")).text()),
  "workflow",
)
const jobs = object(workflow.jobs, "workflow jobs")
const validate = object(jobs.validate, "validation job")
assert(Array.isArray(validate.steps) && validate.steps.length > 0)
const bunfig = object(
  Bun.TOML.parse(await Bun.file(join(root, "bunfig.toml")).text()),
  "bunfig",
)
assert.equal(object(bunfig.install, "install").exact, true)
JSON.parse(await Bun.file(join(root, "examples/config.json")).text())
console.log(
  `Documentation passed: ${files.length} Markdown files, ${links} local links, ${json} JSON examples, ${shell} shell syntax checks, YAML and TOML.`,
)
