import { loadConfig } from "../../src/config.ts"
import { Sessions } from "../../src/session.ts"
import { State } from "../../src/state.ts"
import { Workflow } from "../../src/workflow.ts"

const config = await loadConfig()
const state = new State(config.stateDir)
await state.init()
const workflow = new Workflow(new Sessions(config, state), {
  at: async (phase) => {
    if (phase !== process.argv[2]) return
    console.log(`phase:${phase}`)
    await Bun.sleep(30000)
  },
  afterChunk: async (sequence) => {
    if (process.argv[2] !== "chunk" || sequence !== 0) return
    console.log("phase:chunk")
    await Bun.sleep(30000)
  },
})
console.log(JSON.stringify(await workflow.ready("remote", 10)))
