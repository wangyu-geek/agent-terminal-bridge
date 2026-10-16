import { writeFileSync } from "node:fs"

const bash = process.argv[2]
const report = process.argv[3]
if (!bash || !report || !process.stdin.isTTY)
  throw new Error(
    "The filtered shell fixture needs a Bash, report path and PTY",
  )

process.stdin.setRawMode(true)
let removed = 0
const shell = Bun.spawn([bash, "--noprofile", "--norc", "-i"], {
  terminal: {
    cols: 160,
    rows: 48,
    data(_terminal, bytes) {
      const visible = bytes.filter((byte) => byte !== 0x1e && byte !== 0x1f)
      const discarded = bytes.length - visible.length
      if (discarded) {
        removed += discarded
        // Record only the number of removed delimiters, never terminal data.
        writeFileSync(report, String(removed), { mode: 0o600 })
      }
      process.stdout.write(visible)
    },
  },
})

try {
  for await (const bytes of Bun.stdin.stream()) shell.terminal?.write(bytes)
} finally {
  if (shell.exitCode === null) shell.kill("SIGTERM")
  shell.terminal?.close()
  await shell.exited
}
