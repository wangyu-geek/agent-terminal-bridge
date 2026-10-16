export const OPERATIONS = ["read", "raw_send", "exec", "stop"] as const
export type Operation = (typeof OPERATIONS)[number]
export type Control = "human" | "agent" | "recovery_required"
export type ShellState = "uninitialized" | "pending" | "confirmed" | "unknown"

export interface ShellBinding {
  state: ShellState
  nonce: string | null
  endpoint: string | null
  user: string | null
  cwd: string | null
  version: string | null
}

export const PREPARATION_PHASES = [
  "freezing",
  "transferring",
  "handshaking",
  "completed",
  "failed",
] as const
export type PreparationPhase = (typeof PREPARATION_PHASES)[number]
export interface Preparation {
  id: string
  generation: string
  phase: PreparationPhase
  inputStarted: boolean
  ownerPid: number
  ownerProcess: string
  reason: string | null
  startedAt: string
}

export interface Binding {
  schemaVersion: 1
  alias: string
  id: string
  generation: string
  ownership: "managed" | "external"
  socketPath: string
  serverInstance: string
  serverPid: number
  serverProcess: string
  sessionId: string
  windowId: string
  paneId: string
  panePid: number
  paneProcess: string
  marker: string
  permissions: Operation[]
  control: Control
  shell: ShellBinding
  clientFlags: Record<string, boolean>
  createdAt: string
  preparation: Preparation | null
  sshAlias: string | null
}

export interface Pane {
  serverPid: number
  sessionId: string
  windowId: string
  paneId: string
  pid: number
  dead: boolean
  inMode: boolean
  alternate: boolean
  height: number
  synchronized: boolean
  serverInstance: string
  marker: string
}

export interface Config {
  session: string
  captureLines: number
  timeoutSeconds: number
  maxTimeoutSeconds: number
  maxOutputBytes: number
  maxCommandBytes: number
  maxInputLineBytes: number
  socketName: string
  minimumTmux: string
  allowRawSend: boolean
  policies: Record<string, Operation[]>
  stateDir: string
}

export function emptyShell(state: ShellState = "uninitialized"): ShellBinding {
  return {
    state,
    nonce: null,
    endpoint: null,
    user: null,
    cwd: null,
    version: null,
  }
}
