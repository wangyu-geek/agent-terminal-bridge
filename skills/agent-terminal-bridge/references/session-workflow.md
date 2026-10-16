# session_id 流程：整改后接口

当前源码已实现本流程。用户安装的二进制可能较旧，只有实际 CLI 同时提供对应 capability 和命令时才能使用；文档本身不构成该安装包的能力证据。

## 能力与编号

先检查 `capabilities --json`：

| 能力 | 允许使用的接口 |
|---|---|
| features.connect | 用户在真实终端运行 connect |
| features.session_id_selection | list/status 返回 session_id；按 --session-id 选择绑定 |
| features.ready | 在明确交接后自动准备 |
| features.takeover | 人工接管编排 |
| features.resume | 人工处理后的恢复编排 |
| features.exec | 已授权非交互命令执行 |

session_id 在 connect 创建本地绑定时由工具生成，持久化并显示在本地 tmux 状态栏；它与 list/status 返回值一致。单会话由 Agent 读取，无需用户复制。重建/重新绑定会话会产生新 ID；人工交接不改变 ID，但会撤销旧执行确认。

表中字段和下文选项均须以实际 CLI 为准。示例中的 `SESSION_ID`、`EXEC_ID` 必须替换为本地记录中的完整会话 ID、为该条命令生成的稳定请求 ID。

## 首次连接

如果还没有共享会话，让用户在自己的真实终端运行：

```bash
remote-terminal connect bastion
```

`bastion` 替换为用户已有 SSH 配置别名。不要在无 TTY 的工具调用里创建一个用户看不见的登录界面。让用户完成认证、菜单与目标选择，再告知可以接管；会话编号可见不代表已经登录。

## 明确交接后准备

单会话从 list 获取 session_id；多个候选要求用户选择。对这个完整 ID 操作，不再需要用户提供 hostname：

```bash
remote-terminal status --session-id SESSION_ID --json
remote-terminal ready --session-id SESSION_ID --confirm --json
```

检查 status 的有效绑定、exec 权限与未决请求。已有 unknown/准备失败时进入人工处理流程，不继续 ready。ready 的一次事务负责冻结人工输入、安装临时入口、验证新鲜握手与提交控制权；Agent 不自行拆分这些步骤。

只有 ready 明确成功且 `ready=true`、当前状态允许执行，才提交任务。目标信息来自 shell 自报，session_id 只确认共享会话对象，不证明远端机器身份。用户明确提出预期主机检查时，可对 ready/resume 添加 `--expected-host HOSTNAME`；正常路径不要求此参数。

## 执行与查询

下例适用于用户已请求检查磁盘；其他任务按授权选择命令：

```bash
remote-terminal exec --session-id SESSION_ID --request-id EXEC_ID --timeout 30 --json 'df -h'
remote-terminal request --session-id SESSION_ID --request-id EXEC_ID --json
```

同一命令的结果查询始终使用原 EXEC_ID。新命令生成新 ID；恢复或网络异常不能成为重新提交未知命令的理由。

## 交回人工与恢复

用户明确要求接管时：

```bash
remote-terminal takeover --session-id SESSION_ID --confirm --json
```

执行中要等待协调完成。失败或仍为 requested 时告知接管尚未完成，不说用户已可输入。成功后由用户检查原终端，决定是否中断/处理当前程序。

只有用户确认任务已处理、当前目标已选好且 shell 空闲时：

```bash
remote-terminal resume --session-id SESSION_ID --confirm --json
```

resume 恢复执行资格，不重试旧命令。会话已失效时保留旧请求记录，解释需要重建连接；不能把旧 session_id 自动解析到新连接。锁归属不明、仍有活动持有者或状态损坏时停止，按本地结构化诊断给出必要的人工处理。

连接已结束/绑定已失效时，takeover 返回 taken_over=false、connection_ended=true，不能告诉用户可输入。用户知悉旧命令仍未知并明确确认登记后，resume 可返回 recovery_recorded=true、ready=false；两者退出码均为 4。随后需要用户显式新建连接（同名占用时选择新名称），原 request 仍是 unknown、旧 session_id 不重定向。不要仅凭 CLI 退出非零就重发恢复或命令，先解释这些结构化结果。
