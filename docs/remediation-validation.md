# 整改实施与验收记录

> 更新于 2026-10-19。对应 [整改方案](remediation-plan.md)。第二轮四项调整已有实现、本地回归与最终二进制普通 SSH 证据；整体用户验收仍未完成。以下自动化记录不代替真实堡垒机、首次使用者与原生终端手势验收。代码/测试证据链接适用于源码 checkout，运行包不包含源码和测试。

Skill 范围补充（2026-10-19）：仅维护当前 CLI 的 session_id 流程，删除旧版兼容参考与回退指引；所需能力缺失时停止并提示更新 CLI。skill 结构校验、文档/示例检查与打包内容检查通过，当前 tarball 共 20 个文件，仅含一份会话流程参考。本次未修改运行时代码，也未重跑终端矩阵或真实 SSH；下述执行与文件数量记录保留各次验证时的快照。

## 第二轮四项调整：实现与验证

| 调整 | 当前行为与证据 |
|---|---|
| 按 SSH 入口返回连接 | [Connections](../src/connections.ts) 只复用已登记的同入口连接；唯一直接返回，多条明确选择，--new 另建。无关的旧 remote 不阻塞；显式名称与其他/未知入口冲突仍拒绝。合法 SSH 别名中的点号转换为显示名连字符，名称碰撞不会合并入口。[连接生命周期测试](../tests/integration/connections.test.ts) 覆盖真实多进程同时连接及点号名称碰撞；[CLI 测试](../tests/integration/connect.test.ts) 覆盖实际选择界面。 |
| 关闭窗口与名称复用 | 关闭视图保留 SSH 与 ID；连接结束后先持锁保存历史，再释放名称。重新连接使用同名、新 ID，旧 ID 可查 status/request，拒绝终端与恢复写入。[State](../src/state.ts) 与生命周期测试覆盖历史持久化后的重复副本、创建前空档、私有目录/符号链接检查及 unknown 保留。 |
| sandbox 权限诊断 | [doctor](../src/diagnostics.ts) 分开检查状态读/基础写入、socket 和进程身份；[访问测试](../tests/integration/diagnostics.test.ts) 在真实 macOS Codex helper 中验证拒绝及单独许可 socket。status 保持 unverified/access_denied，不重连、不删除记录。[接入文档](sandbox-access.md) 交付命令/资源授权说明与严格按 session 接口设计；后者尚未实现。 |
| 接管后的输入位置 | 普通切换不再发送恢复旧光标的 1049l；从本地 tmux 获取输入行和单元格列位置，显示在操作记录下方，不自动向远端发送 Enter/Ctrl+U。[屏幕渲染测试](../tests/integration/terminal-rendering.test.ts) 使用开发依赖 @xterm/headless 6.0.0，验证中文提示符、长输出、立即输入、方向键/退格及三轮交接后的实际屏幕，运行时依然零第三方依赖。 |

2026-10-19 在 macOS arm64、Bun 1.4.2、tmux 3.8 上重新运行最终源码的完整矩阵：

- Bash 3.2.57：**98 通过，0 失败、0 跳过**。
- Bash 4.4.18：**99 通过，0 失败、0 跳过**；额外一项为该解释器的真实 PTY 准备。
- Bash 5.3.20：**98 通过，0 失败、0 跳过**。
- 日志为 artifacts/validation-final-{3.2,4.4,5.3}.log。固定依赖安装、TypeScript、Biome、文档与 skill YAML/自包含引用检查通过。矩阵使用隔离本地资源，与下述授权真实 SSH 验证分开。
- 并行回归发现旧 connect 测试只等待登记完成，可能与视图初始快照争锁；20 次复现中 3 次正确返回 BUSY。测试改为先完成明确的人工输入回路后再交接，20 次并行复测全部通过，并补跑全部 11 项 connect 用例与 Bash 5.3 完整回归；没有通过自动重试或放松产品锁契约消除失败。日志 artifacts/validation-connect-ready-{repro,confirmed}.log、artifacts/validation-connect-final.log。
- bundle、macOS arm64 独立二进制及实际安装 tarball 三组 smoke 通过，日志 artifacts/validation-four-fixes-smoke.log；包内共 21 个文件，包含新权限文档与完整 skill，不含测试或开发依赖目录。首次 smoke 发现新环境缺少状态目录被误报为本地错误，已修复并补上只读诊断回归，再重新运行矩阵和最终产物验证。

最终 macOS arm64 独立二进制另在维护者授权的普通 SSH 入口验证：无关 remote 共存、关闭视图后同名返回同 ID、--new 与多候选选择、接管后立即输入和 readline 编辑、restricted sandbox 中本地拒绝不误报断线、同窗口按 r 后同名新 ID、旧 unknown 元数据不改写且不可写、新连接明确交接后执行。实际目标 Bash **4.4.20**。只运行无副作用检查和短 sleep；模拟断线仅结束测试自建的本地 SSH 进程。测试连接已关闭，不保存真实地址、凭据或终端内容。

脱敏记录为 artifacts/validation-four-fixes-real-ssh.json，passed=true；最终二进制 SHA-256 为 `4b0777839c7494fee36b77e1532a53cdef4a9e3f9f4f91a707b445fb1c64b15f`。屏幕断言通过 headless 终端网格完成，**未访问真实 iTerm2 UI**。这些结果不关闭文末的外部验收门槛。

## 真实使用反馈：未通过

维护者在真实登录后交给 Agent 操作，报告五项问题：协议传输回显遮蔽命令原文、无法滚动、Agent 占用输入后没有就地接管入口、无法拖选复制、SSH 断线后无法就地重新登录。未记录真实地址、认证内容或终端记录。

修复方向：默认 connect 使用本地文本观察器，tmux 继续保管原 SSH PTY；人工输入经资源锁核对控制权，Agent 期间仅显示命令原文与帧内输出；终端原生滚动/选择/复制保留。Ctrl+] 本地菜单独立于远端输入，提供接管和脱离；确认连接结束后，用户按 r 在原窗口新建连接、手动认证，使用新 session_id，旧 unknown 不重放或改写。新交互的本地 PTY、普通真实 SSH 验证已通过；iTerm2 实际滚动/拖选与原堡垒机流程仍须复验。

## 接管快捷键补充整改

维护者在新版文本视图报告 Ctrl+] 没有反应。原代码只匹配 0x1d；通过隔离 PTY 复现了 CSI u/Kitty/modifyOtherKeys 编码不被识别的缺口。没有读取用户 iTerm2 设置，因此不将某种具体键盘配置认定为本次反馈的已确认原因。故障期间，对准确定位的业务会话通过 CLI 成功交回人工控制，没有向该会话发送远端命令或中断。

新增 [键盘输入解析](../src/terminal-input.ts)：兼容上述 Ctrl+] 编码与字节分片、菜单内编码按键、按键释放事件；Agent/恢复模式下普通 ? 打开同一菜单，人工模式保留 ? 为正常输入。不修改全局终端配置。未完成转义序列有界等待，单独 Escape 在 100ms 后按原控制权上下文透传，片段不能跨绑定代次或菜单阶段。

- 本轮系统 Bash 3.2.57 完整回归 **87 通过，0 失败/0 跳过**，日志 artifacts/validation-keyboard-regression.log；新增的单元与 connect 专项 **14 通过**，覆盖分片快捷键、备用菜单、接管与人工 Escape/问号透传。
- TypeScript/Biome/文档、skill 校验及 bundle/独立二进制/安装包三组 smoke 通过。
- 使用维护者授权的普通 SSH，最终独立二进制验证了分片 CSI u、编码菜单接管、modifyOtherKeys、? 接管、人工问号/Escape 和脱离后 SSH 保留。目标 Bash 4.4.20；脱敏结果与二进制 SHA-256 在 artifacts/validation-keyboard-real-ssh.json；本轮测试连接已关闭。
- 已打开的旧视图不会热更新，新入口须由新版 connect 打开。普通 SSH 的按键编码验证不能替代 iTerm2 实际按键生成/全局映射的 UI 验收，也不豁免堡垒机和首次使用者验收。

## 本轮修复验证

- 默认 connect 改为本地 control-mode 文本视图，显示命令原文、实时结果及 shell 退出报告；传输/探测回显不再进入默认视图。展示帧独立使用 ATBV1 前缀，不改变 ATB1 执行结果或旧解析器兼容性，不持久化命令正文。
- PTY 集成测试覆盖 Agent 执行中阻止输入、Ctrl+] 本地菜单、协作接管后人工输入、窗口缩放、实际 SSH 进程退出后的 r 重连，以及重新打开已失效绑定仍可进入本地恢复菜单。重连使用新 ID，旧 unknown 保留，不自动准备或重放。
- Agent 输出不会启用备用屏幕、鼠标捕获或修改剪贴板；保留终端原生滚动/选择/复制。测试验证控制序列和连续输出，**未代替真实 iTerm2 手势验收**。高级原生 attach 的旧行为保留，默认应使用 connect。
- 本轮完整本地矩阵：Bash 3.2.57 **81 通过**，Bash 4.4.18 **82 通过**，Bash 5.3 **81 通过**，均 0 失败/0 跳过。日志 artifacts/validation-terminal-view-bash-{3.2,4.4,5.3}.log。首次使用驱动等待自有测试 shell 的提示符，避免将本地“请完成登录”横幅误当远端已准备好；嵌套 PTY 的 CRCRLF 按显示行匹配。
- 完整矩阵后增加接管等待期间的输入队列保护：按接收时的控制权/代次与本地菜单阶段决定是否丢弃，避免后续接管后补发旧输入；全部 connect 与展示专项 **13 通过**，日志 artifacts/validation-terminal-view-input-queue.log。最终恢复提示/展示语义专项另有 **19 通过**，日志 artifacts/validation-terminal-view-final-targeted.log。
- TypeScript、Biome、文档/链接检查与 skill 校验通过。bundle、macOS arm64 独立二进制、实际安装 tarball 三组 smoke 通过。

### 维护者授权的真实 SSH E2E

使用维护者提供的 SSH 配置入口和隔离本地状态，从**独立二进制**启动真实连接；使用已有密钥认证。目标 Bash **4.4.20**。远端只运行 printf、df 等无副作用检查及短 sleep，模拟断线仅结束本次测试创建的本地 SSH 进程。未记录真实地址、登录内容、命令输出或凭据；测试连接已关闭。

通过：人工输入 → ready → 命令原文/实时输出/退出状态 → 执行中输入拦截及缩放 → 本地菜单接管与人工输入 → 同 ID resume → 超时 unknown → SSH 结束后明确按 r → 同窗口新连接/新 ID → 手工输入 → 新连接再次交接执行。旧 unknown 没有改写或重放，新连接没有自动准备。

脱敏结果在 artifacts/validation-real-ssh.json，含独立二进制 SHA-256。本次是**普通 SSH**，不能替代堡垒机菜单、MFA、审计策略或两名首次使用者验收；也未通过 UI 自动化验证 iTerm2 的实际滚动、拖选手感。

## 要求与证据

| 要求 | 实现与自动验证 | 状态 |
|---|---|---|
| 一条命令进入人工终端、零配置 | [CLI](../src/cli.ts)、[会话管理](../src/session.ts)、[connect 测试](../tests/integration/connect.test.ts)：真实 PTY、无配置文件、本地假 SSH，复用原 SSH 参数数组 | 本地通过 |
| session_id 生成、展示与精确选择 | 复用绑定随机 ID；默认本地横幅/原生 attach 状态栏与 list/status 一致；[state](../src/state.ts) 防止解析 ID 后同名重绑；多会话显式选择与冲突提示测试 | 本地通过 |
| 无 TTY 不残留连接 | connect 在创建连接前拒绝；测试确认没有 SSH 参数文件、没有登记会话 | 本地通过 |
| 无需 hostname、代码粘贴或第二终端 | [workflow](../src/workflow.ts) 持资源锁完成冻结、自动传输、握手与提交；[workflow 测试](../tests/integration/workflow.test.ts) 直接操作真实 shell，未 source 本地 helper 文件 | 本地通过 |
| 自动传输不灌满 PTY、不根据回显判完成 | [bootstrap](../src/bootstrap.bash) 有序接收最多 384 字符块；每段新 nonce 的 ACK；真实 Bash 3.2/4/5 PTY 用例 | 本地通过 |
| 协议控制字节被过滤 | [双 PTY 过滤夹具](../tests/fixtures/filtered-shell.ts) 删除实际输出的 RS/US，仅保留可见 ACK 文本；[端到端用例](../tests/integration/protocol-filter.test.ts) 验证超时、不误报 ready、拒绝后续命令并给出接管下一步。仅记录移除计数，不保存终端内容 | 三种 Bash 独立补测通过 |
| 并发、冻结失败与新增人工客户端 | 两个 CLI 争夺 ready；冻结后注入失败并恢复原先权限；准备期间新增原生可写客户端会停止传输 | 本地通过 |
| 准备中断与崩溃 | 真实子进程在 freezing、transferring、接收首块后、handshaking、最终提交前被 SIGKILL；后续状态要求人工接管/恢复 | 本地通过 |
| 接管、恢复与超时 | 新 takeover 等待实际协调完成；协调超时不声称接管成功；resume 保留原 unknown、不重发旧命令；原窗口输入权限恢复且不重连。连接失效时 taken_over/ready=false；默认 connect 的 r 显式同窗新建连接/ID，旧 unknown 不变 | 本地 PTY 与普通真实 SSH 通过；原堡垒机复验待办 |
| 本地遗留锁自动定位 | takeover/resume 定位执行/元数据/审计/注册锁，只恢复确认死亡者；connect 对已确认死亡的本地启动锁集中确认；活着/不明所有者拒绝 | 本地通过 |
| 状态、下一步与本地/目标诊断 | status 为只读；展示状态、准备阶段、锁与有限历史；doctor 分开返回 local_environment 与 target_environment，未确认时不探测目标 | 本地通过 |
| 自动 request_id 响应丢失 | 有限 recent 索引可定位已完成请求；丢弃响应后仅查询元数据、效应只发生一次 | 本地通过 |
| 旧 CLI/JSON 与执行协议 | 旧接口保留，schema_version=1，JSON 单对象，旧 major-only Bash >=4 握手继续兼容；原有错误/去重/锁/未知结果用例 | 本地通过 |
| Bash >=3.2，不要求升级到 4 | helper/bootstrap 检测完整版本；ATB_TEST_BASH 明确选择全套执行器；Bash 3.2.57、4.4.18、5.3 实际运行记录见下 | 三组完整矩阵通过 |
| skill、包内自包含与安装说明 | [SKILL.md](../skills/agent-terminal-bridge/SKILL.md)、当前会话流程参考、可选 UI 元数据；只面向当前 CLI，缺少所需能力时停止并提示更新，随 package files 分发 | 当前 skill 结构、引用与打包内容检查通过；历史 tarball 记录保留原始文件数 |
| 源码、bundle、独立二进制及 tarball | [smoke](../scripts/smoke.ts) 使用自动 ready；带空格的隔离 cwd 与 .env/bunfig 污染用例；最后边界修正后的产物重检 | 构建及 bundle/二进制/安装包三组 smoke 通过 |

## 此前运行记录（本轮补充见上）

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
