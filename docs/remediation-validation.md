# 整改实施与验收记录

> 2026-10-16。对应 [整改方案](remediation-plan.md)。P0/P1 代码与本地自动化验证已完成；总体验收仍包含真实堡垒机和两名首次使用者，未完成前不标记整个整改已验收。代码/测试证据链接适用于源码 checkout，运行包不包含源码和测试。

## 要求与证据

| 要求 | 实现与自动验证 | 状态 |
|---|---|---|
| 一条命令进入人工终端、零配置 | [CLI](../src/cli.ts)、[会话管理](../src/session.ts)、[connect 测试](../tests/integration/connect.test.ts)：真实 PTY、无配置文件、本地假 SSH，复用原 SSH 参数数组 | 本地通过 |
| session_id 生成、展示与精确选择 | 复用绑定随机 ID；本地状态栏与 list/status 一致；[state](../src/state.ts) 防止解析 ID 后同名重绑；多会话显式选择与冲突提示测试 | 本地通过 |
| 无 TTY 不残留连接 | connect 在创建连接前拒绝；测试确认没有 SSH 参数文件、没有登记会话 | 本地通过 |
| 无需 hostname、代码粘贴或第二终端 | [workflow](../src/workflow.ts) 持资源锁完成冻结、自动传输、握手与提交；[workflow 测试](../tests/integration/workflow.test.ts) 直接操作真实 shell，未 source 本地 helper 文件 | 本地通过 |
| 自动传输不灌满 PTY、不根据回显判完成 | [bootstrap](../src/bootstrap.bash) 有序接收最多 384 字符块；每段新 nonce 的 ACK；真实 Bash 3.2/4/5 PTY 用例 | 本地通过 |
| 协议控制字节被过滤 | [双 PTY 过滤夹具](../tests/fixtures/filtered-shell.ts) 删除实际输出的 RS/US，仅保留可见 ACK 文本；[端到端用例](../tests/integration/protocol-filter.test.ts) 验证超时、不误报 ready、拒绝后续命令并给出接管下一步。仅记录移除计数，不保存终端内容 | 三种 Bash 独立补测通过 |
| 并发、冻结失败与新增人工客户端 | 两个 CLI 争夺 ready；冻结后注入失败并恢复原先权限；准备期间新增原生可写客户端会停止传输 | 本地通过 |
| 准备中断与崩溃 | 真实子进程在 freezing、transferring、接收首块后、handshaking、最终提交前被 SIGKILL；后续状态要求人工接管/恢复 | 本地通过 |
| 接管、恢复与超时 | 新 takeover 等待实际协调完成；协调超时不声称接管成功；resume 保留原 unknown、不重发旧命令；原窗口输入权限恢复且不重连。连接失效时 taken_over/ready=false，人工确认只登记旧 unknown，须显式新建连接 | 本地通过 |
| 本地遗留锁自动定位 | takeover/resume 定位执行/元数据/审计/注册锁，只恢复确认死亡者；connect 对已确认死亡的本地启动锁集中确认；活着/不明所有者拒绝 | 本地通过 |
| 状态、下一步与本地/目标诊断 | status 为只读；展示状态、准备阶段、锁与有限历史；doctor 分开返回 local_environment 与 target_environment，未确认时不探测目标 | 本地通过 |
| 自动 request_id 响应丢失 | 有限 recent 索引可定位已完成请求；丢弃响应后仅查询元数据、效应只发生一次 | 本地通过 |
| 旧 CLI/JSON 与执行协议 | 旧接口保留，schema_version=1，JSON 单对象，旧 major-only Bash >=4 握手继续兼容；原有错误/去重/锁/未知结果用例 | 本地通过 |
| Bash >=3.2，不要求升级到 4 | helper/bootstrap 检测完整版本；ATB_TEST_BASH 明确选择全套执行器；Bash 3.2.57、4.4.18、5.3 实际运行记录见下 | 三组完整矩阵通过 |
| skill、包内自包含与安装说明 | [SKILL.md](../skills/agent-terminal-bridge/SKILL.md)、两类参考、可选 UI 元数据；按实际能力区分新旧 CLI，随 package files 分发 | skill 校验与实际 tarball 内容检查通过 |
| 源码、bundle、独立二进制及 tarball | [smoke](../scripts/smoke.ts) 使用自动 ready；带空格的隔离 cwd 与 .env/bunfig 污染用例；最后边界修正后的产物重检 | 构建及 bundle/二进制/安装包三组 smoke 通过 |

## 运行记录

本地主机：macOS arm64、Bun 1.4.2、tmux 3.8。所有连接测试使用临时 socket 和本地假 SSH，不访问真实账号或服务器。

- 系统 Bash 3.2.57：上一轮完整回归 **20 单元 + 53 集成 = 73 通过，0 失败、0 跳过**。
- Bash 4.4.18：上一轮完整回归 **20 单元 + 54 集成 = 74 通过，0 失败、0 跳过**，多一项为该额外解释器的真实 PTY 准备。源码从 [GNU 发布目录](https://ftp.gnu.org/gnu/bash/) 的 bash-4.4.18.tar.gz 在临时目录编译；未安装或替换系统 Bash。归档 SHA-256：604d9eec5e4ed5fd2180ee44dd756ddca92e0b6aa4217bbab2b6227380317f23。
- Homebrew Bash 5.3：上一轮完整回归 **20 单元 + 53 集成 = 73 通过，0 失败、0 跳过**。
- 本轮新增协议字节过滤用例，在上述三种 Bash 中分别独立运行 **1 项通过，0 失败**，未将补测冒充为重新执行全部测试。运行时代码未变，完整回归日志为 artifacts/validation-bash-{3.2,4.4,5.3}.log，补测日志为 artifacts/validation-filter-bash-{3.2,4.4,5.3}.log。
- 固定依赖安装、TypeScript/Biome/文档检查与 skill 校验通过。
- `bun run build`、`bun run build:bin`、实际 tarball 安装以及 `ATB_TEST_BASH=/bin/bash bun run smoke --package=artifacts/agent-terminal-bridge-0.1.0.tgz` 通过。tarball 共 20 个文件，包含完整 skill 与 references，不包含源代码、测试、依赖目录或私有状态。CI 中所有 shell 步骤也通过 Bash 语法检查。
- CI 已配置 macOS 系统 Bash/Homebrew Bash、Ubuntu 系统 Bash/校验和固定的 Bash 4.4.18 构建。尚无本次远程 CI 成功记录。

## 尚待外部验收

以下不是自动测试或编译能代替的证据；保留方案原有门槛，不将它们改成已经通过或自行豁免。

1. **两名未参与开发的使用者**：在依赖已安装、skill 可用的环境中，只读一屏说明完成连接、人工登录和首次授权执行。分别记录操作者、是否需额外指导、扣除认证/菜单耗时后的实际操作时间、是否复制 helper/开启第二终端/提供 hostname，以及遇到的问题。
2. **真实堡垒机**：维护者明确授权具体 SSH 入口和诊断任务，人工完成密码/MFA/菜单；验证正常交接、命令输出与退出状态、人工接管/恢复、退出回菜单、断线、控制字节和组织审计策略。记录脱敏结论，不保存认证内容或真实终端记录。

无需为当前整改实现可选 P2 sh-v1；该项在方案中明确要求先确认实际目标环境需求，仍维持 bash-v1 语义。其他平台的发布支持也须遵循 compatibility.md 的独立证据要求。
