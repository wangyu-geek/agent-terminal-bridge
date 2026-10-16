import { loadConfig } from "../../src/config.ts"
import { Executor } from "../../src/executor.ts"
import { Sessions } from "../../src/session.ts"
import { State } from "../../src/state.ts"

const phase = process.argv[2]
const id = process.argv[3]
const command = process.argv[4]
if (!phase || !id || !command)
  throw new Error("Missing fault-injection fixture arguments")
const config = await loadConfig()
const state = new State(config.stateDir)
await state.init()
const executor = new Executor(new Sessions(config, state), {
  at: async (observed) => {
    if (observed !== phase) return
    console.log(`phase:${observed}`)
    await Bun.sleep(30000)
  },
})
console.log(JSON.stringify(await executor.execute("remote", id, command, 10)))
