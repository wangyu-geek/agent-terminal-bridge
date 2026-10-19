import { BridgeError, requireValue } from "./errors.ts"
import { digest, withLock } from "./locking.ts"
import type { Binding } from "./models.ts"
import type { Sessions } from "./session.ts"

export interface ConnectionOptions {
  ssh: string
  name?: string
  fresh?: boolean
}

export class Connections {
  constructor(readonly sessions: Sessions) {}

  private async inspect(binding: Binding) {
    const status = await this.sessions.status(binding.alias)
    if ("error" in status)
      throw new BridgeError(
        status.error.code,
        status.error.message,
        status.error.code === "LOCAL_ACCESS_DENIED" ? 5 : 8,
      )
    return { binding, ended: status.display_state === "connection_ended" }
  }

  async open(options: ConnectionOptions): Promise<Binding[]> {
    const deadline = performance.now() + 5000
    while (true) {
      try {
        return await withLock(
          this.sessions.state.locks,
          `connection:${digest(options.ssh)}`,
          async () => {
            const all = await this.sessions.state.list()
            const named = options.name
              ? all.find((binding) => binding.alias === options.name)
              : undefined
            if (named) {
              requireValue(
                named.ownership === "managed" && named.sshAlias === options.ssh,
                "SESSION_CONFLICT",
                "That name belongs to another or unknown SSH entry; return to it without an SSH argument, or omit --session to create a separate connection",
                4,
              )
              const current = await this.inspect(named)
              if (!current.ended) {
                requireValue(
                  !options.fresh,
                  "SESSION_CONFLICT",
                  "That name already has a live connection; omit --session with --new to create another",
                  4,
                )
                return [named]
              }
              await this.sessions.archiveEnded(named.alias, named.id)
              return [
                await this.sessions.startConnection(options.ssh, named.alias),
              ]
            }
            if (options.name || options.fresh)
              return [
                await this.sessions.startConnection(options.ssh, options.name),
              ]
            const candidates = await Promise.all(
              all
                .filter(
                  (binding) =>
                    binding.ownership === "managed" &&
                    binding.sshAlias === options.ssh,
                )
                .map((binding) => this.inspect(binding)),
            )
            const live = candidates.filter((candidate) => !candidate.ended)
            if (live.length) return live.map((candidate) => candidate.binding)
            // A new explicit connect starts a fresh SSH login after all matching
            // connections have ended; unknown request history is never acknowledged.
            for (const candidate of candidates)
              await this.sessions.archiveEnded(
                candidate.binding.alias,
                candidate.binding.id,
              )
            return [await this.sessions.startConnection(options.ssh)]
          },
        )
      } catch (error) {
        if (
          !(error instanceof BridgeError) ||
          error.code !== "BUSY" ||
          performance.now() >= deadline
        )
          throw error
        await Bun.sleep(20)
      }
    }
  }

  async reconnect(binding: Binding): Promise<Binding> {
    const current = await this.sessions.state.load(binding.alias)
    requireValue(
      current.id === binding.id,
      "BINDING_CHANGED",
      "The old connection name now identifies another session; select the new ID explicitly",
      4,
    )
    requireValue(
      binding.ownership === "managed" && binding.sshAlias,
      "INVALID_INPUT",
      "This session has no managed SSH entry to reconnect",
      4,
    )
    const result = await this.open({
      ssh: binding.sshAlias,
      name: binding.alias,
    })
    const selected = result[0]
    requireValue(
      selected && selected.id !== binding.id,
      "SESSION_CONFLICT",
      "The old connection is still live; inspect it before reconnecting",
      4,
    )
    return selected
  }
}
