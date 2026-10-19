import { loadConfig } from "../../src/config.ts"
import { Connections } from "../../src/connections.ts"
import { Sessions } from "../../src/session.ts"
import { State } from "../../src/state.ts"

try {
  const config = await loadConfig()
  const state = new State(config.stateDir)
  await state.init()
  const sessions = new Sessions(config, state)
  const value = process.argv[3]
  if (!value) throw new Error("A fixture SSH entry/name is required")
  if (process.argv[2] === "archive") {
    const binding = await state.load(value)
    await sessions.archiveEnded(value, binding.id)
    console.log(JSON.stringify({ bindings: [] }))
  } else {
    const bindings = await new Connections(sessions).open({
      ssh: value,
      ...(process.argv[4] ? { name: process.argv[4] } : {}),
      fresh: process.argv[5] === "new",
    })
    console.log(JSON.stringify({ bindings }))
  }
} catch (error) {
  console.log(
    JSON.stringify({
      error:
        error instanceof Error ? error.message : "Fixture operation failed",
    }),
  )
  process.exitCode = 1
}
