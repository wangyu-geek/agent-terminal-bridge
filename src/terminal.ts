import { ControlClient } from "./control.ts"
import { BridgeError, requireValue } from "./errors.ts"
import { withLock } from "./locking.ts"
import type { Binding } from "./models.ts"
import { sanitizeText } from "./output.ts"
import type { Sessions } from "./session.ts"
import { resourceKey } from "./state.ts"
import { TerminalInput } from "./terminal-input.ts"
import { HumanTerminalOutput, TerminalOutput } from "./terminal-output.ts"
import { Tmux } from "./tmux.ts"
import type { Workflow } from "./workflow.ts"

// No alternate screen or mouse capture: the host terminal owns scrollback,
// selection and clipboard. This process only relays input under the resource lock.
export class SharedTerminal {
  constructor(
    readonly sessions: Sessions,
    readonly workflow: Workflow,
  ) {}

  async attach(name: string): Promise<"detach" | "reconnect"> {
    const initial = await this.sessions.state.load(name)
    this.sessions.requirePermission(initial, "read")
    let binding = initial
    let control: ControlClient | undefined
    let done: "detach" | "reconnect" | null = null
    let menu = false
    let takingOver = false
    let inputDisplay = Promise.resolve()
    let inputEpoch = 0
    let ended = false
    let blockedNotice = false
    let lastMode = ""
    let nonce: string | null = null
    let output: TerminalOutput | undefined
    let queue = Buffer.alloc(0)
    let inputBytes = 0
    let inputWork = Promise.resolve()
    let keyTimer: ReturnType<typeof setTimeout> | undefined
    const keyboard = new TerminalInput()
    let failure: unknown
    let connectionWork = Promise.resolve()
    const connection = (action: () => Promise<void>) => {
      const work = connectionWork.then(action)
      connectionWork = work.catch(() => {})
      return work
    }
    const write = (text: string | Uint8Array) => {
      requireValue(
        process.stdout.writableLength + Buffer.byteLength(text) <= 1048576,
        "VIEW_OVERFLOW",
        "Terminal output is blocked; reconnect the viewer",
        8,
      )
      return process.stdout.write(text)
    }
    const resetLocalModes = () =>
      write("\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?2004l\x1b[0m")
    const banner = () =>
      write(
        `\n[Bridge ${binding.alias}] session_id=${binding.id}\nCtrl+] local menu | While Agent controls input: ? opens the menu | Scroll/select/copy normally\n`,
      )
    const humanOutput = new HumanTerminalOutput(write)
    const positionInput = () => {
      inputDisplay = inputDisplay.then(async () => {
        const deadline = performance.now() + 1000
        while (true) {
          try {
            await withLock(
              this.sessions.state.locks,
              resourceKey(initial),
              async () => {
                const current = await this.sessions.state.load(name)
                if (current.control !== "human") return
                this.sessions.requirePermission(current, "read")
                if ((await this.sessions.verify(current)).dead) return
                const line = await new Tmux(current.socketPath).inputLine(
                  current,
                )
                // CHA uses terminal cell columns, so Unicode prompts need no
                // guessed character widths. This never types into the shell.
                if (line)
                  write(
                    `\r\n${sanitizeText(line.text)}\r\x1b[${line.column + 1}G`,
                  )
              },
            )
            return
          } catch (error) {
            if (!(error instanceof BridgeError) || error.code !== "BUSY")
              throw error
            if (performance.now() >= deadline) {
              write(
                "\r\n[Input line awaiting local ownership] Ctrl+] opens recovery/exit.\r\n",
              )
              return
            }
            await Bun.sleep(10)
          }
        }
      })
      return inputDisplay
    }
    const showMenu = () => {
      menu = true
      inputEpoch++
      resetLocalModes()
      write(
        ended
          ? `\nConnection ended. Old results may be unknown.\n${binding.sshAlias ? "[r] Reconnect in this window (manual login; new session_id) | " : ""}[q] Exit\n`
          : "\n[Local menu] [t] Take over (does not stop a remote program) | [c] Continue viewing | [q] Detach\n",
      )
    }
    const update = async () => {
      binding = await this.sessions.state.load(name)
      requireValue(
        binding.id === initial.id,
        "BINDING_CHANGED",
        "Session identity changed",
        4,
      )
      if (binding.shell.nonce && binding.shell.nonce !== nonce) {
        nonce = binding.shell.nonce
        output = new TerminalOutput(nonce, write)
      }
      const mode =
        binding.control === "human"
          ? "human"
          : binding.preparation &&
              !["completed", "failed"].includes(binding.preparation.phase)
            ? "preparing"
            : binding.control === "agent"
              ? "agent"
              : "needs_human"
      const bytes = queue
      queue = Buffer.alloc(0)
      if (mode === "human" && (!lastMode || lastMode === "human"))
        humanOutput.feed(bytes)
      else output?.feed(bytes)
      if (mode !== lastMode && !ended) {
        if (mode !== "human") resetLocalModes()
        if (mode !== "human" || !takingOver)
          write(
            mode === "human"
              ? "\n[You control input] Finish login/inspection, then tell your Agent the shell is ready. Ctrl+] opens the local menu.\n"
              : mode === "preparing"
                ? "\n[Preparing shared shell…] Ctrl+] local menu\n"
                : mode === "agent"
                  ? "\n[Agent controls input] Press ? then t to take over; Ctrl+] also opens the local menu.\n"
                  : "\n[Needs inspection] Remote outcome may be unknown. Press ? then t to take over; Ctrl+] also opens the local menu.\n",
          )
        if (mode === "human" && !takingOver) await positionInput()
        blockedNotice = false
        lastMode = mode
      }
    }
    const forward = async (bytes: Uint8Array, received: Binding) => {
      if (!bytes.length || ended) return
      await inputDisplay
      try {
        await withLock(
          this.sessions.state.locks,
          resourceKey(initial),
          async () => {
            const current = await this.sessions.state.load(name)
            requireValue(
              current.id === initial.id,
              "BINDING_CHANGED",
              "Session identity changed",
              4,
            )
            requireValue(
              received.control === "human" &&
                current.control === "human" &&
                received.generation === current.generation &&
                received.shell.nonce === current.shell.nonce,
              "INPUT_OWNED",
              "Agent controls input",
              5,
            )
            await this.sessions.verify(current, true)
            await connection(async () => {
              await control?.sendBytes(bytes, false, performance.now() + 5000)
            })
          },
        )
      } catch (error) {
        if (
          !(error instanceof BridgeError) ||
          !["BUSY", "INPUT_OWNED"].includes(error.code)
        )
          throw error
        if (!blockedNotice) {
          write(
            "\n[Input blocked while Agent operates] Press ? then t to take over; Ctrl+] also opens the menu. Scroll/select/copy remain available.\n",
          )
          blockedNotice = true
        }
      }
    }
    const input = async (bytes: Buffer, epoch: number, received: Binding) => {
      if (done || epoch !== inputEpoch) return
      if (menu || ended) {
        // Each menu choice consumes the entire read, so pasted text cannot
        // accidentally reach the remote shell after a local action.
        const key = bytes.toString("ascii").trim().toLowerCase()
        if (key === "q") done = "detach"
        else if (key === "r" && ended && binding.sshAlias) done = "reconnect"
        else if (key === "c" && !ended) {
          menu = false
          inputEpoch++
          write("\n[Viewing resumed] Ctrl+] local menu\n")
          if (received.control === "human") await positionInput()
        } else if (key === "t" && !ended) {
          takingOver = true
          inputEpoch++
          write("\n[Returning input control…]\n")
          try {
            const result = await this.workflow.takeover(
              name,
              this.sessions.config.timeoutSeconds,
            )
            menu = false
            inputEpoch++
            write(
              result.taken_over
                ? "\n[Input returned to you] A previously running program may still run. Inspect before typing.\n"
                : "\n[Connection no longer usable]\n",
            )
            if (result.taken_over) await positionInput()
          } catch (error) {
            write(
              `\n[Takeover failed] ${error instanceof BridgeError ? error.message : "Inspect local state"}. Input remains blocked; Ctrl+] local menu.\n`,
            )
            menu = false
            inputEpoch++
          } finally {
            takingOver = false
          }
        }
        return
      }
      if (
        received.control !== "human" &&
        ["?", "？"].includes(bytes.toString("utf8"))
      ) {
        showMenu()
        return
      }
      const menuOffset = bytes.indexOf(0x1d)
      if (menuOffset < 0) await forward(bytes, received)
      else {
        await forward(bytes.subarray(0, menuOffset), received)
        showMenu()
        // Do not interpret bytes from the same paste as a management choice.
      }
    }
    const onInput = (bytes: Buffer) => {
      const epoch = inputEpoch
      // A key received during blocked ownership/menu work must never be
      // forwarded later merely because takeover has since completed.
      if (inputBytes + bytes.length > 65536) {
        write("\n[Input buffer full; input discarded] Use Ctrl+] local menu.\n")
        return
      }
      clearTimeout(keyTimer)
      const received = this.sessions.state.load(name).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      )
      inputBytes += bytes.length
      inputWork = inputWork
        .then(async () => {
          const receipt = await received
          if ("error" in receipt) throw receipt.error
          if (done || epoch !== inputEpoch) return
          const current = receipt.value
          const scope = `${current.id}|${current.generation}|${current.control}|${current.shell.nonce}|${epoch}`
          const decoded = keyboard.feed(
            bytes,
            scope,
            menu || ended || current.control !== "human",
          )
          if (decoded.length) await input(decoded, epoch, current)
          clearTimeout(keyTimer)
          if (keyboard.waiting) {
            const revision = keyboard.revision
            keyTimer = setTimeout(() => {
              inputWork = inputWork
                .then(async () => {
                  if (keyboard.revision !== revision) return
                  await input(keyboard.flush(), epoch, current)
                })
                .catch((error: unknown) => {
                  failure = error
                  done = "detach"
                })
            }, 100)
          }
        })
        .catch((error: unknown) => {
          failure = error
          done = "detach"
        })
        .finally(() => {
          inputBytes -= bytes.length
        })
    }
    const stop = () => {
      done = "detach"
    }
    let resizeWork = Promise.resolve()
    const resize = () => {
      resizeWork = resizeWork
        .then(async () => {
          const cols = process.stdout.columns || 80
          const rows = process.stdout.rows || 24
          await connection(async () => {
            await control?.command(
              `refresh-client -C ${cols}x${rows}`,
              performance.now() + 5000,
            )
          })
        })
        .catch((error: unknown) => {
          failure = error
          done = "detach"
        })
    }
    const wasRaw = process.stdin.isRaw
    try {
      let live = false
      try {
        live = !(await this.sessions.verify(initial)).dead
      } catch (error) {
        if (
          !(error instanceof BridgeError) ||
          !["BINDING_CHANGED", "PROCESS_MISSING"].includes(error.code)
        )
          throw error
      }
      ended = !live
      if (live) {
        control = await ControlClient.open(
          initial,
          (bytes) => {
            if (queue.length + bytes.length > 1048576) {
              failure = new BridgeError(
                "VIEW_OVERFLOW",
                "Terminal viewer fell behind; reconnect the viewer to inspect the session",
                8,
              )
              done = "detach"
            } else queue = Buffer.concat([queue, bytes])
          },
          () => {},
          performance.now() + 5000,
        )
        // Unlike execution subscriptions, the interactive view supplies dimensions.
        await control.command(
          "refresh-client -f !ignore-size",
          performance.now() + 5000,
        )
        resize()
        await resizeWork
      }
      banner()
      if (initial.control === "human" && live) {
        try {
          await withLock(
            this.sessions.state.locks,
            resourceKey(initial),
            async () => {
              const current = await this.sessions.state.load(name)
              if (current.control !== "human") return
              const snapshot = await this.sessions.capture(name, 50, "normal")
              write(`${snapshot.terminal_output}\n`)
            },
          )
        } catch (error) {
          if (!(error instanceof BridgeError) || error.code !== "BUSY")
            throw error
        }
      }
      process.stdin.setRawMode(true)
      process.stdin.on("data", onInput)
      process.stdin.resume()
      process.stdout.on("resize", resize)
      process.on("SIGTERM", stop)
      process.on("SIGHUP", stop)
      if (ended) showMenu()
      let inspection = 0
      while (!done) {
        await update()
        if (performance.now() >= inspection && !ended) {
          inspection = performance.now() + 500
          try {
            ended = (await this.sessions.verify(initial)).dead
            control?.check()
          } catch (error) {
            if (
              !(error instanceof BridgeError) ||
              ![
                "BINDING_CHANGED",
                "PROCESS_MISSING",
                "CONNECTION_LOST",
              ].includes(error.code)
            )
              throw error
            ended = true
          }
          if (ended) showMenu()
        }
        await Bun.sleep(20)
      }
      if (failure) throw failure
      return done
    } finally {
      clearTimeout(keyTimer)
      process.stdin.off("data", onInput)
      process.stdin.pause()
      process.stdout.off("resize", resize)
      process.off("SIGTERM", stop)
      process.off("SIGHUP", stop)
      process.stdin.setRawMode(wasRaw)
      await Promise.allSettled([inputWork, resizeWork, inputDisplay])
      await control?.close()
      resetLocalModes()
      write("\n[Left shared terminal; remote jobs were not interrupted]\n")
    }
  }
}
