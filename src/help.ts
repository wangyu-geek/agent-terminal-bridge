import { type Message, msg } from "./i18n.ts"

export const MAIN_COMMANDS = [
  "connect",
  "session",
  "takeover",
  "resume",
] as const
export const SESSION_ACTIONS = ["list", "status", "stop", "unbind"] as const

export const BASE_COMMANDS = [
  "doctor",
  "capabilities",
  "connect",
  "session",
  "ready",
  "takeover",
  "resume",
  "start",
  "bind",
  "capture",
  "send",
  "attach",
  "recover-lock",
  "exec",
  "request",
  "recover",
  "interrupt",
] as const
type BaseCommand = (typeof BASE_COMMANDS)[number]
type SessionAction = (typeof SESSION_ACTIONS)[number]
type SessionKey = `session/${SessionAction}`

const FLAGS = {
  help: { flags: "--help, -h", description: msg("help.flag.help") },
  version: { flags: "--version, -v", description: msg("help.flag.version") },
  json: { flags: "--json", description: msg("help.flag.json") },
  lang: { flags: "--lang <auto|en|zh-CN>", description: msg("help.flag.lang") },
  config: { flags: "--config <path>", description: msg("help.flag.config") },
  session: { flags: "--session <name>", description: msg("help.flag.session") },
  "session-id": {
    flags: "--session-id <id>",
    description: msg("help.flag.session_id"),
  },
  advanced: { flags: "--advanced", description: msg("help.flag.advanced") },
  new: { flags: "--new", description: msg("help.flag.new") },
  confirm: { flags: "--confirm", description: msg("help.flag.confirm") },
  timeout: {
    flags: "--timeout <seconds>",
    description: msg("help.flag.timeout"),
  },
  "expected-host": {
    flags: "--expected-host <host>",
    description: msg("help.flag.expected_host"),
  },
  lines: { flags: "--lines <count>", description: msg("help.flag.lines") },
  screen: {
    flags: "--screen <normal|alternate|mode>",
    description: msg("help.flag.screen"),
  },
  pane: { flags: "--pane <target>", description: msg("help.flag.pane") },
  raw: { flags: "--raw", description: msg("help.flag.raw") },
  text: { flags: "--text <text>", description: msg("help.flag.text") },
  enter: { flags: "--enter", description: msg("help.flag.enter") },
  writable: { flags: "--writable", description: msg("help.flag.writable") },
  "request-id": {
    flags: "--request-id <id>",
    description: msg("help.flag.request_id"),
  },
  socket: { flags: "--socket <path>", description: msg("help.flag.socket") },
  permissions: {
    flags: "--permissions <list>",
    description: msg("help.flag.permissions"),
  },
  history: { flags: "--history", description: msg("help.flag.history") },
  scope: {
    flags: "--scope <execution|registry|metadata|audit>",
    description: msg("help.flag.scope"),
  },
  "command-stdin": {
    flags: "--command-stdin",
    description: msg("help.flag.command_stdin"),
  },
  ssh: { flags: "--ssh <alias>", description: msg("help.flag.ssh") },
} satisfies Record<string, { flags: string; description: Message }>

type FlagName = keyof typeof FLAGS

const GLOBAL_FLAGS: readonly FlagName[] = [
  "help",
  "version",
  "json",
  "lang",
  "config",
  "session",
  "session-id",
  "advanced",
]

interface CommandSpec {
  description: Message
  usage: string
  arguments?: readonly { name: string; description: Message }[]
  flags?: readonly FlagName[]
  notes?: readonly Message[]
}

const COMMANDS: Record<BaseCommand | SessionKey, CommandSpec> = {
  doctor: {
    description: msg("help.command.doctor"),
    usage: "remote-terminal doctor [flags]",
  },
  capabilities: {
    description: msg("help.command.capabilities"),
    usage: "remote-terminal capabilities",
  },
  connect: {
    description: msg("help.command.connect"),
    usage: "remote-terminal connect [SSH_ALIAS] [flags]",
    arguments: [
      { name: "SSH_ALIAS string", description: msg("help.argument.ssh_alias") },
    ],
    flags: ["new"],
    notes: [msg("help.handoff"), msg("help.controls")],
  },
  session: {
    description: msg("help.command.session"),
    usage: "remote-terminal session <subcommand> [flags]",
    notes: [msg("help.session_options")],
  },
  ready: {
    description: msg("help.command.ready"),
    usage: "remote-terminal ready [flags]",
    flags: ["confirm", "expected-host", "timeout"],
    notes: [msg("help.note.ready")],
  },
  takeover: {
    description: msg("help.command.takeover"),
    usage: "remote-terminal takeover [flags]",
    flags: ["confirm", "timeout"],
  },
  resume: {
    description: msg("help.command.resume"),
    usage: "remote-terminal resume [flags]",
    flags: ["confirm", "expected-host", "timeout"],
  },
  start: {
    description: msg("help.command.start"),
    usage: "remote-terminal start --ssh ALIAS [flags]",
    flags: ["ssh"],
    notes: [msg("help.note.pane")],
  },
  bind: {
    description: msg("help.command.bind"),
    usage: "remote-terminal bind --socket PATH --pane PANE [flags]",
    flags: ["socket", "pane", "permissions", "confirm"],
    notes: [msg("help.note.pane")],
  },
  capture: {
    description: msg("help.command.capture"),
    usage: "remote-terminal capture [flags]",
    flags: ["lines", "screen", "pane"],
  },
  send: {
    description: msg("help.command.send"),
    usage: "remote-terminal send --raw --text TEXT [flags]",
    flags: ["raw", "text", "enter", "pane"],
    notes: [msg("help.note.send")],
  },
  attach: {
    description: msg("help.command.attach"),
    usage: "remote-terminal attach [--writable]",
    flags: ["writable"],
  },
  "recover-lock": {
    description: msg("help.command.recover_lock"),
    usage: "remote-terminal recover-lock [--scope SCOPE] [flags]",
    flags: ["scope", "confirm"],
  },
  exec: {
    description: msg("help.command.exec"),
    usage: "remote-terminal exec <command> [flags]",
    arguments: [
      { name: "COMMAND string", description: msg("help.argument.command") },
    ],
    flags: ["request-id", "command-stdin", "timeout", "pane"],
  },
  request: {
    description: msg("help.command.request"),
    usage: "remote-terminal request --request-id ID",
    flags: ["request-id"],
  },
  recover: {
    description: msg("help.command.recover"),
    usage: "remote-terminal recover --request-id ID [flags]",
    flags: ["request-id", "confirm"],
  },
  interrupt: {
    description: msg("help.command.interrupt"),
    usage: "remote-terminal interrupt --request-id ID [flags]",
    flags: ["request-id", "confirm"],
  },
  "session/list": {
    description: msg("help.command.list"),
    usage: "remote-terminal session list [--history]",
    flags: ["history"],
  },
  "session/status": {
    description: msg("help.command.status"),
    usage: "remote-terminal session status [flags]",
    flags: ["pane"],
  },
  "session/stop": {
    description: msg("help.command.stop"),
    usage: "remote-terminal session stop [flags]",
    flags: ["confirm"],
  },
  "session/unbind": {
    description: msg("help.command.unbind"),
    usage: "remote-terminal session unbind [flags]",
    flags: ["confirm"],
  },
}

export interface HelpArgument {
  name: string
  description: Message
}

export interface HelpFlag {
  flags: string
  description: Message
}

export interface HelpSubcommand {
  name: string
  description: Message
}

export interface HelpPage {
  command: string
  description: Message
  usage: string
  arguments: HelpArgument[]
  flags: HelpFlag[]
  globalFlags: HelpFlag[]
  subcommands: HelpSubcommand[]
  notes: Message[]
}

function flag(name: FlagName): HelpFlag {
  const spec = FLAGS[name]
  return { flags: spec.flags, description: spec.description }
}

function baseCommand(name: string): BaseCommand | undefined {
  return BASE_COMMANDS.find((candidate) => candidate === name)
}

export function commandOptions(
  name: string,
  action?: SessionAction,
): readonly string[] | undefined {
  const key: BaseCommand | SessionKey | undefined =
    action === undefined ? baseCommand(name) : `session/${action}`
  return key === undefined ? undefined : (COMMANDS[key].flags ?? [])
}

function subcommand(
  name: string,
  key: BaseCommand | SessionKey,
): HelpSubcommand {
  return { name, description: COMMANDS[key].description }
}

function rootPage(advanced: boolean): HelpPage {
  const names = advanced ? BASE_COMMANDS : MAIN_COMMANDS
  return {
    command: "remote-terminal",
    description: msg("help.description.root"),
    usage: "remote-terminal <subcommand> [flags] [<arguments>]",
    arguments: [],
    flags: [],
    globalFlags: GLOBAL_FLAGS.map(flag),
    subcommands: names.map((name) => subcommand(name, name)),
    notes: [
      msg("help.handoff"),
      msg("help.controls"),
      msg("help.advanced"),
      msg("help.language"),
    ],
  }
}

export function helpPage(path: readonly string[], advanced: boolean): HelpPage {
  const name = path[0]
  if (name === undefined) return rootPage(advanced)
  const action =
    name === "session"
      ? SESSION_ACTIONS.find((candidate) => path[1] === candidate)
      : undefined
  const key: BaseCommand | SessionKey | undefined = action
    ? `session/${action}`
    : baseCommand(name)
  if (key === undefined) return rootPage(advanced)
  const spec = COMMANDS[key]
  return {
    command: `remote-terminal ${key}`,
    description: spec.description,
    usage: spec.usage,
    arguments: (spec.arguments ?? []).map((argument) => ({
      name: argument.name,
      description: argument.description,
    })),
    flags: (spec.flags ?? []).map(flag),
    globalFlags: GLOBAL_FLAGS.map(flag),
    subcommands:
      key === "session"
        ? SESSION_ACTIONS.map((actionName) =>
            subcommand(actionName, `session/${actionName}`),
          )
        : [],
    notes: [...(spec.notes ?? [])],
  }
}

export function helpResult(
  page: HelpPage,
  commands: readonly string[],
  advanced: boolean,
  version: string,
) {
  return {
    command: page.command,
    version,
    commands: [...commands],
    advanced,
    usage: page.usage,
    description: page.description,
    arguments: page.arguments,
    flags: page.flags,
    global_flags: page.globalFlags,
    notes: page.notes,
  }
}
