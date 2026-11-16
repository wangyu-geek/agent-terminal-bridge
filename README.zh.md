# Agent Terminal Bridge

[English](README.md) | 中文

Agent Terminal Bridge 让 Agent 在你亲自登录的 SSH 会话中协助操作。运行连接命令，在终端中完成认证，再告诉 Agent 要做什么。

## 从源码构建

安装 **Bun 1.4.2 或更新版本**，然后运行：

```bash
git clone https://github.com/wangyu-geek/agent-terminal-bridge.git
cd agent-terminal-bridge
bun install --frozen-lockfile
bun run build:bin
```

当前平台的独立可执行文件会生成在 `dist/remote-terminal`。如需构建 package CLI，运行 `bun run build`，生成的 `dist/cli.js` 使用时仍需要 Bun。其他构建目标和开发检查见[开发指南](CONTRIBUTING.md)。

## 安装

Bridge 需要本机 **tmux >=3.2** 和 OpenSSH。目标 shell 需要 **Bash >=3.2**、`base64` 和 `tr`。

目前尚无已发布的二进制版本。构建独立可执行文件后，可这样安装：

```bash
mkdir -p "$HOME/.local/bin"
install -m 755 dist/remote-terminal "$HOME/.local/bin/remote-terminal"
```

将 `~/.local/bin` 加入 PATH。`dist/cli.js` 运行时需要 Bun。参阅[平台验证状态](docs/compatibility.md)。

支持 Agent Skill 的宿主可通过以下命令安装 Bridge skill：

```bash
npx skills add wangyu-geek/agent-terminal-bridge --skill agent-terminal-bridge
```

## 连接并交接

Bridge 使用 `~/.ssh/config` 中的 SSH 别名。例如：

```sshconfig
Host bastion
    HostName bastion.example.com
    User your-user
    Port 22
    # 可选：
    # IdentityFile ~/.ssh/id_ed25519
```

在本机终端中启动连接：

```bash
remote-terminal connect bastion
```

打开或返回会话时，Bridge 会自动将 `session_id=<ID>` 复制到本机剪贴板，按 **r** 重连后也会复制新 ID，可直接粘贴给 Agent。macOS 使用 `pbcopy`；Linux 的 Wayland 需要 `wl-copy`，X11 需要 `xclip` 或 `xsel`。剪贴板不可用时会提示手动复制，连接仍可继续。

密码、MFA 和服务器选择由你亲自完成。目标 shell 就绪后，告诉 Agent：

> 我已经登录，可以接管共享终端，帮我检查磁盘使用情况。

要指定某个会话，可同时附上横幅中的 `session_id`。`awaiting_human` 表示尚未为 Agent 准备 shell，不代表登录失败。收到你的交接后，Agent 会调用 `ready`，再继续执行任务。

你可以在同一个终端中查看 Agent 的命令和结果。Agent 控制输入时，你仍可滚动、选择和复制文本。

SSH 连接必须从 Bridge 中启动；不能接管其他终端中已运行的 SSH 进程。在每个终端运行 `remote-terminal connect bastion` 会各自新建 SSH 连接，并分配独立的会话 ID。要返回已有会话，运行 `remote-terminal connect`，或用 `remote-terminal connect --session-id ID` 直接打开指定会话。

## 管理会话

运行 `remote-terminal session` 列出会话及其状态。加上 `--history` 可查看已归档会话。

```bash
remote-terminal session --session-id ID
remote-terminal session stop --session-id ID
remote-terminal session unbind --session-id ID
```

第一条命令查看指定会话的详情。`stop` 停止受管理的终端，`unbind` 解除 Bridge 绑定并让终端继续运行。停止和解绑都需要确认。运行 `remote-terminal session --help` 查看可用选项。

## 接回控制权

Agent 工作时，按 **?** 再按 **t** 接管，或按 **Ctrl+]** 打开本地菜单。也可以让 Agent 交还会话。自行检查和处理终端，确认 shell 就绪后再告诉 Agent 继续。

SSH 连接结束后，按 **r** 可在同一窗口新建连接；重新登录后再将新会话交给 Agent。对于结果不确定的命令，Bridge 不会自动重试。

## 显示语言

Bridge 提供英文和简体中文，按以下顺序选择显示语言：`--lang`、配置中的 `defaults.language`，然后读取第一个非空的 `LC_ALL`、`LC_MESSAGES` 或 `LANG`。`zh_CN.UTF-8` 等中文环境使用简体中文；其他语言、`C`/`POSIX` 或未设置的环境回退到英文。检测依据是 CLI 当前环境，不读取操作系统的图形界面语言偏好。

```bash
remote-terminal connect bastion --lang zh-CN
remote-terminal session --lang en
remote-terminal --help --lang auto
```

配置文件是可选的；不创建时使用内置默认值，并自动检测语言。如需持久设置，创建 `~/.config/agent-terminal-bridge/config.json`，将 `defaults.language` 设置为 `auto`（默认）、`en` 或 `zh-CN`：

```json
{
  "schema_version": 1,
  "defaults": {
    "language": "zh-CN"
  }
}
```

保存后即可直接使用。支持普通用户创建文件时常见的 `0644` 权限，无需额外修改权限。文件须由你拥有、为普通文件而非符号链接，且不能允许组或其他用户写入；`0600` 也支持。配置保存偏好和策略，会话私有状态仍使用更严格的权限。

设置了 `XDG_CONFIG_HOME` 时，路径为 `$XDG_CONFIG_HOME/agent-terminal-bridge/config.json`；也可使用 `--config PATH` 指定其他文件。默认文件不存在时使用内置默认值，不会自动创建。已有配置请合并此设置，参阅[完整示例](examples/config.json)。显式使用 `--lang auto` 会覆盖已保存的语言，重新按当前环境检测。不支持的手动语言设置会被拒绝。配置损坏时仍可查看帮助；配置无法加载时，启动错误使用环境语言或有效的命令行语言。

语言切换仅影响 Bridge 面向人工的文案。JSON 字段、枚举、错误消息和退出码不随语言改变；远端文本、命令、`session_id=<ID>`、菜单按键及确认输入 `y/N` 保持原有含义。显示语言不会改变 SSH 环境。

## 更多信息

- [Agent 集成说明](docs/agent-integration.md)
- [兼容性与验证状态](docs/compatibility.md)
- [命令协议](docs/execution-protocol.md)
- [配置示例](examples/config.json)
- [开发指南](CONTRIBUTING.md)

使用 TypeScript 和 Bun 构建。[MIT 许可证](LICENSE)。
