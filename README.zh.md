# Agent Terminal Bridge

[English](README.md) | 中文

本地共享终端 CLI，让 Agent 在你已登录的会话中协助操作。只处理文本和 JSON：不使用截图、多模态模型、Agent SDK、远端守护进程或远端 Bun。

**常规流程：运行一次连接命令 → 手动登录 → 向 Agent 交接一次。** 共享会话使用 `session_id` 标识，每条命令使用独立的 `request_id`。用户无需提供 hostname。

## 安装

使用已验证平台对应的独立可执行文件。它内置 Bun；本机仍需 **tmux >=3.2 和 OpenSSH**。目标 shell 需要 **Bash >=3.2、base64 和 tr**。这些是目标端要求，不代表需要升级本机 Bash。

当前 checkout 不代表已有发布的二进制版本。本地构建的 macOS arm64 可执行文件位于 `dist/remote-terminal`；请参阅[构建说明](CONTRIBUTING.md)和[验证状态](docs/compatibility.md)。安装已有的可执行文件：

```bash
mkdir -p "$HOME/.local/bin"
install -m 755 dist/remote-terminal "$HOME/.local/bin/remote-terminal"
```

按你平常的 shell 配置方式，将 `~/.local/bin` 加入 PATH。另一种方式是安装 package，它使用 `dist/cli.js` 并需要 Bun。

单会话默认流程无需 Bridge 配置文件。

### 安装 Agent Skill

```bash
npx skills add wangyu-geek/agent-terminal-bridge --skill agent-terminal-bridge
```

## 连接、登录并交接

Bridge 使用本机 `~/.ssh/config` 中的 OpenSSH 配置。可以复用已有主机别名；如文件尚不存在，可创建它：

```bash
mkdir -p "$HOME/.ssh"
touch "$HOME/.ssh/config"
chmod 700 "$HOME/.ssh"
chmod 600 "$HOME/.ssh/config"
```

在 `~/.ssh/config` 中添加一项，并将示例值换成你的连接信息：

```sshconfig
Host bastion
    HostName bastion.example.com
    User your-user
    Port 22
    # 可选：使用密钥认证时配置
    # IdentityFile ~/.ssh/id_ed25519
```

`Host` 是传给 Bridge 的本地别名。`HostName` 是该 SSH 项的主机名或 IP 地址；`User` 是登录账号，`Port` 是 SSH 端口。若使用密钥认证，取消 `IdentityFile` 的注释并填入私钥路径。交互式堡垒机场景应在此配置堡垒机入口，再于登录后选择最终服务器；直连 SSH 则配置目标服务器本身。

可以先查看解析后的配置，不会建立 SSH 连接：

```bash
ssh -G bastion
```

然后在本机的真实终端中使用 `Host` 别名连接：

```bash
remote-terminal connect bastion
```

密码、MFA 和服务器选择由你亲自完成。本地 Bridge 横幅会在登录前显示完整 `session_id`；`list`/`status` 返回相同 ID。这个 ID 不用于识别或认证远端机器。

选定服务器的 shell 空闲且就绪后，告诉 Agent：

> 我已经登录，可以接管共享终端，帮我检查磁盘使用情况。

Skill 会读取唯一且已授权的会话、调用 `ready`，再执行你请求的任务。你无需复制初始化代码、打开第二个终端或填写 hostname。若有多个会话，可提供横幅上的 `session_id`，或从 Agent 显示的列表中选择。

在同一个终端中查看实际命令文本、流式结果和退出状态。使用终端自身的滚动、拖选和复制功能。Agent 持有输入权时，你不能向远端 shell 输入，但仍可在本地查看和操作视图。默认视图使用终端回滚缓冲区，不占用 tmux 备用屏幕。初始化和探测流量会隐藏；命令帧之外的输出不作为执行日志。

之后返回已有会话：

```bash
remote-terminal connect
```

`connect SSH_ALIAS` 会自动返回该 SSH 入口唯一的活连接。同一 SSH 入口有多个活连接时会提示选择。不同 SSH 入口会使用不同默认名称；无关的旧 `remote` 记录不会造成冲突。要新建连接，运行 `remote-terminal connect bastion --new`；本地名称会自动选择。只有记录的 SSH 入口匹配时，显式 `--session NAME` 才会返回该会话。关闭观察窗口不会关闭 SSH。已有 Agent 控制的会话会以远端输入受阻的模式打开，并提供本地菜单。

SSH 连接必须从 Bridge/tmux pane 内启动。Bridge 不能接管普通终端中已经运行的 SSH 进程。tmux 能保留本地终端会话，但不能在网络故障后保证远端连接仍然存在。

## 接回控制权并继续

Agent 控制输入时，按 **?**，再按 **t**（无需按 Enter），即可在同一窗口接管。**Ctrl+]** 在两种控制模式下都可打开本地菜单。也可以告诉 Agent“把这个会话交还给我”。协调器会等待控制权实际交接，不会自动中断正在运行的远端程序。按 **? → q**（Agent 模式）或 **Ctrl+] → q** 可脱离视图并保留 SSH；按 **c** 继续查看。

本版本的新视图提供 **?** 快捷键；替换可执行文件不会更新已经打开的视图。人工模式下，**?** 仍作为普通输入发送到远端。如果快捷键无效，请让 Agent 通过 CLI 接管选定的会话。

接管后，视图会在 Agent 输出记录下方投影显示当前终端输入行的位置。它不会向远端程序发送换行符。你可以立即输入和编辑，无需手动把输入行移到下方。

自行检查并处理终端，然后告诉 Agent：

> 问题已经处理完，登录和目标选择也都完成了，可以继续。

Agent 会使用 `resume` 记录恢复状态并重新准备 shell。只要该绑定仍然存在，同一个 `session_id` 就有效；重建或重新绑定会生成新 ID。

超时、断线或初始化结果不确定时，远端任务可能仍在运行。恢复前先检查。未知结果的命令不会自动重试、重连或发送 Ctrl+C。恢复后，旧的未知结果仍保持未知。

SSH 进程退出时，本地视图会显示 **Connection ended**，并提供 **r** 在同一窗口重连或 **q** 退出。按 **r** 会明确为相同 SSH 入口创建新连接和新 `session_id`，并在只读历史中保留旧 ID 后复用其显示名称。你需要自行完成密码/MFA/目标选择，再交接新会话。旧 ID 和未知请求保持不变，不会重放旧命令。若 SSH 进程仍在但没有响应，不会被判定为断线；请按 Ctrl+] 脱离或接管后检查。

旧连接的 CLI `takeover`/`resume` 接口仍会返回 `connection_ended`、`taken_over/ready=false`（退出码 4）。`resume` 可以确认旧的未知历史，但不能恢复该连接。

没有 Agent 时，可在真实终端中使用 `takeover` 和 `resume`，或使用经过明确审查的 `--confirm`。本地菜单也能在无需第二个终端的情况下接管。高级原生 tmux attach 命令仍保留原有全屏/只读行为；常规使用请运行 `connect`。

## Agent 接口

Skill 支持当前 CLI 的 `session_id` 流程，并会在操作前检查实际能力。缺少所需能力时，请更新 CLI。直接集成时，将 `SESSION_ID` 换成本地 `list`/`status` 返回的完整 ID，并将 `EXEC_ID` 换成提交命令**之前**生成并保留的唯一 ID：

```bash
remote-terminal capabilities --json
remote-terminal list --json
remote-terminal status --session-id SESSION_ID --json
remote-terminal ready --session-id SESSION_ID --confirm --json
remote-terminal exec --session-id SESSION_ID --request-id EXEC_ID --timeout 30 --json 'df -h'
remote-terminal request --session-id SESSION_ID --request-id EXEC_ID --json
```

调用 `ready` 前，用户必须在当前会话中完成登录和目标选择，并交接一个空闲 shell。它会冻结人工客户端、以带确认的分块传输内部 helper，并在单个资源锁事务中验证握手、提交 Agent 控制权。hostname/user/cwd 会自动读取并标记为 shell 自报信息；可选的 `--expected-host` 会增加明确的主机名匹配。

`session_id` 不是授权令牌。宿主 Agent 仍负责判断实际任务是否获准；`--confirm` 只是确认管理操作。

每条命令都在独立的非交互 Bash 中运行，stdin 为 `/dev/null`。命令继承目录和已导出的环境，但 `cd`/`export` 不会跨请求保留。需要指定目录时，在同一个请求中使用 `cd /path && command`。编辑器、密码提示、分页器、`/dev/tty` 输入，以及后台/脱离终端作业都不属于可靠执行范围。

`terminal_output` 是合并后的共享 PTY 输出，不是隔离的 stdout/stderr。即使已检测到命令完成，输出也可能被截断。默认限制为每个脚本 2048 个 UTF-8 字节、每行输入 4096 字节、输出 1 MiB。后续查询保留元数据，不保留旧输出。重复使用同一 ID 不会重新提交命令；同一 ID 携带不同命令会被拒绝。

## 状态、诊断与高级操作

```bash
remote-terminal status
remote-terminal doctor
remote-terminal doctor --session-id SESSION_ID --json
remote-terminal --help --advanced
```

人类可读输出会给出状态和下一步。JSON 包含带版本的字段、本地锁/准备状态和有界的近期请求元数据。`doctor` 会区分本地运行时依赖和目标端**最近一次确认的** shell 信息，也不会探测登录提示。

只有需要更改默认值或权限时才使用[配置文件](examples/config.json)；私有配置文件的权限必须为 0600。默认配置和状态目录遵循 XDG 标准。状态和审计信息不会保存命令正文、终端输出或凭据。

连接结束后，重新打开时会释放显示名称。旧 `session_id` 仍可通过 `status --session-id OLD_ID`、`request --session-id OLD_ID --request-id EXEC_ID` 和 `list --history --json` 查询，但不能用于操作新终端。未知结果始终保持未知。

本地沙箱权限会单独诊断：`doctor --session-id SESSION_ID --json` 检查状态读写、Unix socket 和进程检查权限。`LOCAL_ACCESS_DENIED` 或绑定状态 `unverified` 表示本地进程权限不足，并不能证明连接已断开。请让 Agent 宿主授权诊断结果中列出的 Bridge 调用和资源。[沙箱权限及受限接口设计](docs/sandbox-access.md)。当前多个会话共用的 tmux socket 并未提供 session ID 之间的操作系统级隔离。

高级集成仍可使用 `start`/`bind`/`attach`/`shell-init`/`confirm-shell`/`handoff`/`recover`/`recover-lock` 接口。另请参阅[协议](docs/execution-protocol.md)、[故障排查](docs/troubleshooting.md)、[安全边界](SECURITY.md)、[开发指南](CONTRIBUTING.md)和[整改验证记录](docs/remediation-validation.md)。

非交互模式下，`--json` 的 stdout 仅包含一个 JSON 对象。退出码：0 成功；1 已确认远端命令非零退出；2 输入/配置无效；3 依赖/能力缺失；4 绑定缺失/变化；5 权限/确认/选择问题；6 忙；7 超时；8 本地 I/O/协议/状态错误；9 结果未知/需要恢复。

开发源码时，运行 `make` 查看 `make deps`、`make check`、`make test`、`make build` 和 `make build-bin` 等快捷命令。另见[开发命令与参数传递说明](CONTRIBUTING.md)。

使用 TypeScript 和 Bun 构建。[MIT 许可证](LICENSE)。
