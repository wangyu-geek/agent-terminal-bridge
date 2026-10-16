# 缺少新能力的旧版 CLI

仅当实际 capabilities/help 缺少新接口时读取本文件。此安装包不能使用 connect、ready、takeover、resume 或 --session-id 选择器。收到这些意图或编号时，先说明本地安装包尚不支持新流程；不能把编号作为旧 --session 别名或 --request-id 传入，也不能要求用户用 hostname 冒充 session_id。

已有、明确授权且已准备好的旧版会话可以继续使用。用户无需因此再提供 hostname；未准备会话无法通过本 skill 自动获得新流程，简短报告版本限制。只有用户明确选择旧版人工准备流程时，才按安装包 README 的 Enable non-interactive execution 操作说明引导；不要默认展开长教程。

## 读取并选择已有绑定

```bash
remote-terminal list --json
remote-terminal status --session SESSION_ALIAS --json
```

list 的 sessions 数组中，`session` 是旧会话别名。使用用户指定或本次上下文已明确的别名；仅在唯一有效且已授权候选时自动选取。SESSION_ALIAS 是占位符，不是固定 remote。多个候选先询问，不猜活跃 pane 或最近会话。

执行前要求：`binding=valid`、`shell.state=confirmed`、`control=agent`、`task.state=idle`，且 permissions 包含 exec。shell.profile 当前是 bash-v1；目标 Bash >=4 与 base64 要求仍有效。pane 存活和旧确认不证明当前远端连接持续在线，实际 exec 仍校验专用入口。

## 执行与查询

下面的 EXEC_ID 替换为本次命令在提交前生成并保留的稳定唯一编号：

```bash
remote-terminal exec --session SESSION_ALIAS --request-id EXEC_ID --timeout 30 --json 'df -h'
remote-terminal request --session SESSION_ALIAS --request-id EXEC_ID --json
```

仅在用户已要求检查磁盘时使用示例命令。未知结果不重新提交，request 查询只核对原命令状态。

## 用户要求接管时

空闲时，明确授权后交回人工：

```bash
remote-terminal handoff --session SESSION_ALIAS --to human --confirm --json
```

执行中或存在未决请求时，先从 status.task.request_id 定位原命令，再按实际授权请求协作接管：

```bash
remote-terminal handoff --session SESSION_ALIAS --to human --takeover --request-id EXEC_ID --confirm --json
```

接管成功后，原先连接且保存过权限的人工客户端按现有逻辑恢复；用户尚未附着时，需在真实终端运行 `attach --writable`。接管会撤销 shell 确认；执行中返回 requested 时还没有完成接管，必须继续查询状态。

用户确认检查并处理了当前程序后，旧版可登记恢复：

```bash
remote-terminal recover --session SESSION_ALIAS --request-id EXEC_ID --confirm --json
```

recover 保留 unknown，清除活动请求但不重新准备 shell。后续未完成旧版人工初始化/确认前不能执行。遇到锁错误先说明限制，不手动删除锁、不自动反复调用 recover-lock；新恢复向导尚未实现。
