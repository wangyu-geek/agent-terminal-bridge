# Agent Terminal Bridge

[English](README.md) | [中文](README.zh.md)

Agent Terminal Bridge lets an Agent work in an SSH session that you log into yourself. Connect once, authenticate in your terminal, then tell your Agent what to do.

## Build from source

Install Bun **1.4.2 or newer**, then run:

```bash
git clone https://github.com/wangyu-geek/agent-terminal-bridge.git
cd agent-terminal-bridge
bun install --frozen-lockfile
bun run build:bin
```

The standalone executable is written to `dist/remote-terminal` for the current platform. To build the package CLI instead, run `bun run build`; it writes `dist/cli.js` and requires Bun when used. Build targets and development checks are documented in the [development guide](CONTRIBUTING.md).

## Install

Bridge requires local **tmux >=3.2** and OpenSSH. The target shell needs **Bash >=3.2**, `base64` and `tr`.

There is no published binary release yet. After building the standalone executable, install it with:

```bash
mkdir -p "$HOME/.local/bin"
install -m 755 dist/remote-terminal "$HOME/.local/bin/remote-terminal"
```

Add `~/.local/bin` to your PATH. The package CLI at `dist/cli.js` requires Bun. See [platform validation](docs/compatibility.md).

To let a supported Agent use Bridge, install the skill:

```bash
npx skills add wangyu-geek/agent-terminal-bridge --skill agent-terminal-bridge
```

## Connect and hand over

Bridge uses the SSH aliases in `~/.ssh/config`. For example:

```sshconfig
Host bastion
    HostName bastion.example.com
    User your-user
    Port 22
    # Optional:
    # IdentityFile ~/.ssh/id_ed25519
```

Start the connection in your local terminal:

```bash
remote-terminal connect bastion
```

Bridge automatically copies `session_id=<ID>` to your local clipboard when you open or return to a session, including a new connection after pressing **r**. Paste it into your message to the Agent. macOS uses `pbcopy`; Linux requires `wl-copy` on Wayland or `xclip`/`xsel` on X11. If copying is unavailable, Bridge displays the ID for manual copying and continues connecting.

Complete your password, MFA and server selection yourself. When the target shell is ready, tell your Agent:

> I'm logged in. You can take over and check disk usage in the shared terminal.

Include the banner's `session_id` when choosing a particular session. `awaiting_human` means the shell has not been prepared for the Agent; it does not mean login failed. After your handoff, the Agent calls `ready` and continues with your task.

You can watch the Agent's commands and results in the same terminal. While the Agent controls input, you can still scroll, select and copy text.

The SSH connection must be started inside Bridge; an SSH process already running in another terminal cannot be adopted. To reopen a session later, run `remote-terminal connect`. Use `remote-terminal connect bastion --new` to start another connection.

## Take back control

While the Agent is working, press **?**, then **t** to take over, or press **Ctrl+]** to open the local menu. You can also ask the Agent to give the session back. Inspect and handle the terminal, then tell the Agent when the shell is ready to continue.

If the SSH connection ends, press **r** to start a new connection in the same window, then log in and hand over the new session. Bridge does not automatically repeat commands whose result is uncertain.

## Display language

Bridge provides English and Simplified Chinese. It selects the display language in this order: `--lang`, `defaults.language` in the configuration, then the first nonempty `LC_ALL`, `LC_MESSAGES` or `LANG`. Chinese locales such as `zh_CN.UTF-8` select Simplified Chinese; other languages, `C`/`POSIX` and an unset locale fall back to English. This reads the CLI's environment, not the operating system's graphical language preference.

```bash
remote-terminal connect bastion --lang zh-CN
remote-terminal status --lang en
remote-terminal --help --lang auto
```

Configuration is optional; without a file, Bridge uses its built-in defaults and detects the language automatically. For a persistent choice, create `~/.config/agent-terminal-bridge/config.json` and set `defaults.language` to `auto` (the default), `en` or `zh-CN`:

```json
{
  "schema_version": 1,
  "defaults": {
    "language": "zh-CN"
  }
}
```

Save the file and use Bridge directly. Standard user-created permissions such as 0644 are supported; no permission change is needed. The file must be owned by you, be a regular file rather than a symbolic link, and not be writable by the group or others. Private mode 0600 also works. These settings contain preferences and policies; private session state retains stricter permissions.

If `XDG_CONFIG_HOME` is set, the path is `$XDG_CONFIG_HOME/agent-terminal-bridge/config.json`; `--config PATH` selects another file. A missing default file uses built-in defaults and is not created automatically. Merge this setting into an existing file; see the [complete example](examples/config.json). An explicit `--lang auto` overrides the stored choice and detects the current environment again. Unsupported manual choices are rejected. Help remains available with invalid configuration; startup errors use the environment or a valid command-line language when the configuration cannot be loaded.

Only Bridge's human-facing text changes. JSON fields, enums, error messages and exit codes remain language-independent; remote text, commands, `session_id=<ID>`, menu keys and confirmation input `y/N` retain their existing meaning. Display language does not change the SSH environment.

## More information

- [Agent integration](docs/agent-integration.md)
- [Compatibility and validation](docs/compatibility.md)
- [Command protocol](docs/execution-protocol.md)
- [Configuration example](examples/config.json)
- [Development guide](CONTRIBUTING.md)

Built with TypeScript and Bun. [MIT licensed](LICENSE).
