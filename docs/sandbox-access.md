# 本地权限接入与按会话接口设计

Bridge 的 CLI/JSON 接口不依赖 Agent 品牌。宿主的命令沙箱仍决定 CLI 能读取哪些文件、写入哪些状态、连接哪些 Unix socket、执行哪些进程检查。session_id 是选择器；skill 和 AGENTS.md 不授予操作系统权限。

## 当前可用的诊断

```bash
remote-terminal doctor --session-id SESSION_ID --json
```

doctor 不向远端发送输入。local_access 报告以下检查及 required_access；写入探针仅为工具自己创建、同步和删除的私有临时文件，不修改绑定、任务或锁。

| 检查 | 用途 |
|---|---|
| state_read | 读取当前绑定及任务记录 |
| state_write | 在状态根目录创建、写入并同步临时探针，核对基础写入权限 |
| tmux_socket | 读取所选本地 pane 的身份，无 shell 探测 |
| process_identity | 校验保存的本地 tmux 进程创建身份 |
| ready_for_session | 上述本地检查通过，不表示远端已登录或已交接 |

状态默认位于 XDG_STATE_HOME/agent-terminal-bridge，未设置时为 ~/.local/state/agent-terminal-bridge。受管 socket 在 /tmp/agent-terminal-bridge-UID 下；使用 doctor 输出的实际路径，不猜固定文件名。macOS 还需执行 /bin/ps 和 /usr/sbin/sysctl，Linux 使用 /proc 创建身份信息。已有 SSH 由 tmux 保管，观察/执行不需要 Agent 自己重新认证。

首次连接前尚无状态目录时，普通 doctor 报告 missing，不创建目录，也不将其当成本地 I/O 故障。此时指定一个尚未登记的 session_id 返回 INVALID_BINDING（退出码 4）。

LOCAL_ACCESS_DENIED 返回退出码 5。status 返回 binding=unverified、display_state=access_denied 和 inspect_local_access 动作；本地检查无法完成时可能为 inspection_failed。只有真正缺失/退出的对象才进入连接结束流程。权限错误不应导致删除状态、解除登记、重放任务或重新 SSH。

## 命令级授权接入

1. 保持宿主原有沙箱，对已经明确的 session_id 先运行 doctor。
2. 向宿主申请该次 Bridge 调用所需的状态目录、具体 socket 和进程检查权限；实际命令内容仍须属于用户授权任务。支持逐条命令审批的宿主可对这一调用审批，无需把整个 Agent 会话切成全局 Full Access。
3. 重新运行 doctor 和只读 status，检查失败项是否解除，再进行 ready/exec。没有获得所需权限时停止，保留绑定和请求历史。

宿主版本、管理策略和执行接口可能限制授权粒度。不能承诺所有沙箱都能通过同一配置开放这些能力，也不由 Bridge 自动修改用户的宿主设置。OpenAI 的[权限与审批说明](https://learn.chatgpt.com/docs/agent-approvals-security)区分命令沙箱、网络和审批边界；[配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)说明文件和 Unix socket 的权限选项。

本机 Codex CLI 0.152.1 的 helper 支持下列**诊断示例**；它只增加指定 socket 的许可，状态写入和 /bin/ps 可能仍被拒绝，不能将其当成完整授权配置：

```bash
codex sandbox -c 'sandbox_mode="workspace-write"' --allow-unix-socket /ABSOLUTE/BRIDGE.sock -- /ABSOLUTE/remote-terminal doctor --session-id SESSION_ID --json
```

本地集成测试使用临时会话验证：普通调用有效；限制沙箱中记录可读、写入/socket/进程检查分别拒绝；单独许可 socket 后只有该项恢复，其他拒绝仍如实报告。CI 上没有 Codex helper 的平台明确跳过这一专项，不将其声明为已通过。此 helper 不代表桌面版每个会话的实际策略，生产接入仍以该宿主实际诊断为准。

## 按 session 严格限制的受控接口：设计交付，尚未实现

当前多个受管会话共用一个 tmux socket。直接许可这个 socket 能接触该 server 的其他对象，CLI 的 session_id 校验不能将其提升为操作系统级的单会话隔离。因此当前能力只声明资源/命令级接入；没有实现严格的单 session 代理。

若产品需要这一边界，后续受控适配器采用以下契约：

- 用户在可信本地侧显式授权某个完整 session_id；适配器保存独立、可撤销的能力记录，绑定 ID、资源身份、授权操作与当前交接代次。公开 session_id 不兼任授权密钥。
- Agent 通过宿主受控工具调用结构化 status/exec/request/takeover/resume。可提供 stdio/MCP 适配，但核心协议保持通用，不新增默认 HTTP 监听或远端服务。
- 适配器在具备所需本地权限的进程中执行；Agent 命令沙箱不直接获得 tmux socket 或可修改授权记录的目录。若宿主同时开放了直接 socket 访问，则不再宣称由适配器实现独占边界。
- 每次操作复核能力、绑定和实际权限；拒绝其他 ID、全局 tmux 管理、任意原始输入或隐式登记。命令仍受宿主对具体任务的授权，终端文字不会扩大范围。
- 绑定重建/名称复用不重定向旧能力。人工接管撤销执行资格，重新交接时显式验证新代次；历史授权只允许查询原 ID 的请求元数据。
- 验证跨 ID 请求拒绝、能力撤销、代次变化、双请求竞争、故障 unknown 不重放，以及 Agent 无法从命令沙箱绕过适配器访问 socket。仍不对抗同一 OS 用户下的其他恶意进程或 root。

该设计需要独立实现与宿主验证；本轮没有通过文档或 capability 声称代理已经可用。
