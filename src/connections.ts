import { BridgeError, requireValue } from "./errors.ts"
import { msg } from "./i18n.ts"
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

  private async isEnded(name: string): Promise<boolean> {
    const status = await this.sessions.status(name)
    if ("error" in status)
      throw new BridgeError(
        status.error.code,
        status.error.message,
        status.error.code === "LOCAL_ACCESS_DENIED" ? 5 : 8,
      )
    return status.display_state === "connection_ended"
  }

  async open(options: ConnectionOptions): Promise<Binding> {
    const deadline = performance.now() + 5000
    while (true) {
      try {
        return await withLock(
          this.sessions.state.locks,
          `connection:${digest(options.ssh)}`,
          async () => {
            if (!options.name) return this.sessions.startConnection(options.ssh)
            const named = (await this.sessions.state.list()).find(
              (binding) => binding.alias === options.name,
            )
            if (!named)
              return this.sessions.startConnection(options.ssh, options.name)
            requireValue(
              named.ownership === "managed" && named.sshAlias === options.ssh,
              "SESSION_CONFLICT",
              msg("error.connection_entry_conflict"),
              4,
            )
            if (await this.isEnded(named.alias)) {
              await this.sessions.archiveEnded(named.alias, named.id)
              return this.sessions.startConnection(options.ssh, named.alias)
            }
            requireValue(
              !options.fresh,
              "SESSION_CONFLICT",
              msg("error.live_connection_name_conflict"),
              4,
            )
            return named
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
      msg(
        "error.the_old_connection_name_now_identifies_another_session_select_the_new_id_explicitly",
      ),
      4,
    )
    requireValue(
      binding.ownership === "managed" && binding.sshAlias,
      "INVALID_INPUT",
      msg("error.this_session_has_no_managed_ssh_entry_to_reconnect"),
      4,
    )
    const selected = await this.open({
      ssh: binding.sshAlias,
      name: binding.alias,
    })
    requireValue(
      selected.id !== binding.id,
      "SESSION_CONFLICT",
      msg(
        "error.the_old_connection_is_still_live_inspect_it_before_reconnecting",
      ),
      4,
    )
    return selected
  }
}
