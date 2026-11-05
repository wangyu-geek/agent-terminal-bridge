import type { en } from "./en.ts"

export const zhCN = {
  "config.unsafe_file":
    "无法使用配置文件：{path}。配置必须为当前用户拥有的普通文件，不能为符号链接，也不能允许组或其他用户写入。支持通常的 0644 和私有的 0600 权限；若为你拥有的普通文件，可使用 chmod go-w 去掉组和其他用户的写权限。",
  "config.missing_file": "配置文件不存在：{path}",
  "config.cannot_read": "无法读取配置文件：{path}",
  "next.config":
    "请检查配置文件路径、所有者、JSON 格式及组或其他用户的写权限。支持通常的 0644 权限；也可通过 --config PATH 选择其他文件。",
  "error.unknown_command": "未知命令",
  "error.unexpected_positional_arguments": "出现多余的位置参数",
  "error.option_is_not_accepted_for_this_command": "此命令不接受选项 --{key}",
  "error.only_macos_and_linux_are_supported": "仅支持 macOS 和 Linux",
  "error.use_either_session_id_or_session_not_both":
    "请使用 --session-id 或 --session，不能同时使用",
  "error.connect_is_interactive_use_list_status_json_for_inspection":
    "connect 为交互命令；请使用 list/status --json 检查状态",
  "error.connect_requires_a_real_terminal_run_remote_terminal_connect_ssh_alias_there":
    "connect 需要真实终端；请在本机终端运行 remote-terminal connect SSH_ALIAS",
  "error.new_requires_an_ssh_entry_alias": "--new 需要指定 SSH 入口别名",
  "error.connect_selector_conflict":
    "请使用 connect --session-id 返回指定会话，或使用 connect SSH_ALIAS 选择该入口的连接",
  "error.local_setup_lock_ownership_cannot_be_verified_controlled_maintenance_is_required":
    "无法核实本地初始化锁的所有者；需要受控维护",
  "error.no_connection_was_selected": "未选择连接",
  "error.choose_a_listed_session_number": "请选择列表中的会话编号",
  "error.pane_cannot_expand_a_registered_binding":
    "--pane 不能扩大已登记绑定的范围",
  "error.confirm_shell_requires_expected_host":
    "confirm-shell 需要 --expected-host",
  "error.provide_exactly_one_command_argument_or_command_stdin":
    "请仅提供一个命令参数或使用 --command-stdin",
  "error.requires_request_id": "{command} 需要 --request-id",
  "error.bind_requires_socket_and_pane": "bind 需要 --socket 和 --pane",
  "error.send_requires_raw_and_text": "send 需要 --raw 和 --text",
  "error.takeover_requires_to_human_and_request_id":
    "takeover 需要 --to human 和 --request-id",
  "error.attach_is_interactive_and_does_not_support_json":
    "attach 为交互命令，不支持 --json",
  "error.attach_requires_a_real_terminal": "attach 需要真实终端",
  "error.local_access_was_denied_run_doctor_for_the_selected_session":
    "本地访问被拒绝；请对所选会话运行 doctor",
  "error.timeout_must_be_a_finite_positive_number_within_the_configured_maximum":
    "timeout 必须为配置上限以内的有限正数",
  "error.command_stdin_requires_piped_input": "--command-stdin 需要管道输入",
  "error.command_input_exceeds_its_limit": "命令输入超过大小限制",
  "error.command_must_be_valid_utf_8": "命令必须为有效的 UTF-8",
  "error.explicit_management_confirmation_is_required_use_confirm_after_review":
    "管理操作需要明确确认；请在检查后使用 --confirm",
  "error.operation_was_not_confirmed": "操作未获确认",
  "error.configuration_exceeds_64_kib": "配置文件超过 64 KiB",
  "error.cannot_read_local_bridge_configuration": "无法读取本地 Bridge 配置",
  "error.cannot_read_configuration": "无法读取配置",
  "error.unsupported_configuration_schema": "不支持此配置 schema",
  "error.default_timeout_exceeds_maximum": "默认超时时间超过上限",
  "error.unsupported_backend": "不支持此后端",
  "error.invalid_minimum_tmux_version": "tmux 最低版本无效",
  "error.tmux_minimum_cannot_be_below_3_2": "tmux 最低版本不能低于 3.2",
  "error.cannot_be_disabled": "不能禁用 {key}",
  "error.automatic_interruption_is_unsupported": "不支持自动中断",
  "error.command_output_persistence_is_not_enabled_in_this_release":
    "此版本未启用命令或输出持久化",
  "error.too_many_session_policies": "会话策略数量过多",
  "error.must_be_absolute": "{name} 必须为绝对路径",
  "error.connection_entry_conflict":
    "此名称属于其他或未知 SSH 入口；请不带 SSH 参数返回该会话，或省略 --session 创建独立连接",
  "error.that_name_already_has_a_live_connection_omit_session_with_new_to_create_another":
    "此名称已有存活连接；请省略 --session 并使用 --new 新建连接",
  "error.the_old_connection_name_now_identifies_another_session_select_the_new_id_explicitly":
    "旧连接名称已指向另一个会话；请明确选择新 ID",
  "error.this_session_has_no_managed_ssh_entry_to_reconnect":
    "此会话没有可重连的受管理 SSH 入口",
  "error.the_old_connection_is_still_live_inspect_it_before_reconnecting":
    "旧连接仍然存活；请先检查再重连",
  "error.control_deadline_expired_before_connection":
    "连接建立前控制操作已超时",
  "error.control_stream_attached_to_an_unexpected_pane":
    "控制流连接到了非预期的 pane",
  "error.control_deadline_expired_before_input": "输入发送前控制操作已超时",
  "error.control_client_is_unavailable": "控制客户端不可用",
  "error.control_message_exceeds_its_buffer_limit": "控制消息超过缓冲区限制",
  "error.control_stream_closed_before_completion": "控制流在完成前关闭",
  "error.tmux_rejected_a_control_command": "tmux 拒绝了控制命令",
  "error.control_reply_exceeds_its_limit": "控制回复超过大小限制",
  "error.control_stream_failed": "控制流失败",
  "error.control_operation_exceeded_its_deadline": "控制操作超时",
  "error.invalid_tmux_output_escape": "tmux 输出转义无效",
  "error.state_root_is_not_a_private_owned_directory":
    "状态根目录不是当前用户拥有的私有目录",
  "error.the_saved_terminal_identity_changed": "已保存的终端身份发生变化",
  "error.the_saved_tmux_process_identity_changed":
    "已保存的 tmux 进程身份发生变化",
  "error.initialization_requires_human_control": "初始化需要人工控制权",
  "error.an_expected_hostname_is_required": "需要指定预期主机名",
  "error.generate_and_install_shell_initialization_first":
    "请先生成并安装 shell 初始化代码",
  "error.reported_hostname_does_not_match_the_user_confirmed_destination":
    "报告的主机名与用户确认的目标不匹配",
  "error.shell_handshake_did_not_complete_inspect_the_session_and_recover":
    "shell 握手未完成；请检查会话并恢复",
  "error.command_is_empty_contains_nul_or_exceeds_its_byte_limit":
    "命令为空、包含 NUL 或超过字节数限制",
  "error.request_id_is_already_associated_with_another_command":
    "此请求 ID 已关联其他命令",
  "error.a_confirmed_shell_and_agent_control_are_required":
    "需要已确认的 shell 和 Agent 控制权",
  "error.execution_coordination_failed_after_dispatch_inspect_durable_request_history":
    "发送后的执行协调失败；请检查持久化请求历史",
  "error.shell_handshake_failed_take_over_inspect_the_terminal_and_resume":
    "shell 握手失败；请接管、检查终端并使用 resume",
  "error.reported_hostname_does_not_match_the_explicitly_requested_destination":
    "报告的主机名与明确要求的目标不匹配",
  "error.request_does_not_exist": "请求不存在",
  "error.no_matching_unresolved_request_exists": "没有匹配的未决请求",
  "error.another_unresolved_request_is_active": "另一个未决请求正在进行",
  "error.no_matching_active_request_exists": "没有匹配的活动请求",
  "error.no_live_execution_coordinator_remains_use_explicit_manual_takeover":
    "执行协调进程已不再存活；请明确进行人工接管",
  "error.current_shell_initialization_is_missing": "当前 shell 初始化缺失",
  "error.alternate_screen_applications_cannot_receive_exec_requests":
    "不能向备用屏幕中的应用提交 exec 请求",
  "error.exec_requires_a_dedicated_single_pane_session":
    "exec 需要专用的单 pane 会话",
  "error.encoded_execution_line_exceeds_its_limit":
    "编码后的执行行超过大小限制",
  "error.terminal_topology_or_mode_changed_during_execution":
    "执行期间终端布局或模式发生变化",
  "error.deadline_exceeded_the_remote_command_may_still_be_running":
    "已超时；远端命令可能仍在运行",
  "error.user_requested_manual_takeover_command_outcome_is_uncertain":
    "用户请求人工接管；命令结果不确定",
  "error.terminal_changed_before_completion_was_committed":
    "提交完成状态前终端发生变化",
  "error.completion_arrived_after_the_execution_deadline":
    "完成帧在执行截止时间后到达",
  "error.local_execution_coordination_failed": "本地执行协调失败",
  "error.cannot_persist_execution_outcome_the_durable_dispatch_claim_remains_unresolved":
    "无法持久化执行结果；持久化的发送记录仍未解决",
  "error.cannot_inspect_local_process_identity": "无法检查本地进程身份",
  "error.process_has_exited": "进程已退出",
  "error.cannot_verify_process_creation_identity": "无法核实进程创建身份",
  "error.cannot_run_local_process_identity_inspection_grant_process_inspection_access":
    "无法执行本地进程身份检查；请授予进程检查权限",
  "error.cannot_verify_local_process_identity": "无法核实本地进程身份",
  "error.only_macos_and_linux_process_identity_is_supported":
    "仅支持 macOS 和 Linux 的进程身份检查",
  "error.resource_lock_maintenance_is_in_progress": "资源锁正在维护中",
  "error.resource_is_locked_stale_locks_require_explicit_recovery":
    "资源已锁定；遗留锁需要明确恢复",
  "error.lock_ownership_changed_refusing_cleanup": "锁的所有权已变化；拒绝清理",
  "error.lock_directory_is_unsafe": "锁目录不安全",
  "error.lock_owner_cannot_be_verified_stop_all_bridge_writers_before_manual_maintenance":
    "无法核实锁所有者；请停止所有 Bridge 写入进程后进行人工维护",
  "error.lock_belongs_to_another_boot_manual_maintenance_is_required":
    "锁属于另一次系统启动；需要人工维护",
  "error.lock_pid_is_alive_or_unverifiable_refusing_takeover":
    "锁的 PID 仍存活或无法核实；拒绝接管",
  "error.lock_changed_during_recovery": "恢复期间锁发生变化",
  "error.permission_denied_starting_a_required_local_program_inspect_doctor_local_access":
    "启动所需本地程序的权限被拒绝；请检查 doctor 的 local_access",
  "error.cannot_start_required_local_program": "无法启动所需的本地程序",
  "error.local_operation_exceeded_its_deadline": "本地操作超时",
  "error.local_operation_exceeded_its_output_limit": "本地操作超过输出限制",
  "error.execution_frame_exceeds_its_limit": "执行帧超过大小限制",
  "error.duplicate_execution_completion_frame": "收到重复的执行完成帧",
  "error.unsupported_shell_profile_response": "不支持此 shell profile 响应",
  "error.unsupported_or_inconsistent_bash_version":
    "Bash 版本不受支持或报告不一致",
  "error.bash_3_requires_a_verified_minor_version":
    "Bash 3 需要已验证的次版本号",
  "error.malformed_or_out_of_order_execution_frame": "执行帧格式错误或顺序无效",
  "error.invalid_encoded_shell_metadata": "shell 元数据的编码无效",
  "error.shell_metadata_is_not_utf_8": "shell 元数据不是 UTF-8",
  "error.bun_is_required_found": "需要 Bun {bun}（当前为 {version}）",
  "error.state_directory_must_be_owned_by_the_current_user_with_mode_0700":
    "状态目录必须由当前用户拥有，权限为 0700",
  "error.state_file_ownership_permissions_or_size_is_invalid":
    "状态文件的所有权、权限或大小无效",
  "error.state_file_is_too_large": "状态文件过大",
  "error.state_file_is_not_a_private_regular_file": "状态文件不是私有普通文件",
  "error.raw_input_contains_control_characters_or_exceeds_the_input_limit":
    "原始输入包含控制字符或超过输入限制",
  "error.cannot_access_private_bridge_state_grant_the_selected_state_directory_access":
    "无法访问 Bridge 私有状态；请授予所选状态目录的访问权限",
  "error.cannot_access_private_bridge_state": "无法访问 Bridge 私有状态",
  "error.ssh_destination_must_be_a_configuration_alias":
    "SSH 目标必须为配置别名",
  "error.session_name_is_already_registered_select_it_explicitly_or_choose_a_new_session_name":
    "会话名称已登记；请明确选择该会话或使用新的 --session 名称",
  "error.local_openssh_is_required_for_a_new_connection":
    "新建连接需要本地 OpenSSH",
  "error.this_display_name_is_occupied_return_to_it_explicitly_or_use_new_without_session":
    "此显示名称已被占用；请明确返回该会话，或省略 --session 并使用 --new",
  "error.session_changed_before_archival": "归档前会话发生变化",
  "error.a_live_connection_cannot_be_retired_to_reuse_its_name":
    "不能归档存活连接以复用名称",
  "error.tmux_did_not_create_the_expected_pane": "tmux 未创建预期的 pane",
  "error.an_exact_pane_id_such_as_3_is_required": "需要精确的 pane ID，例如 %3",
  "error.alias_is_already_registered": "别名已登记",
  "error.pane_is_exited_already_marked_or_linked_into_multiple_sessions":
    "pane 已退出、已被标记或链接到多个会话",
  "error.pane_is_already_registered": "pane 已登记",
  "error.a_writable_human_client_conflicts_with_agent_preparation_or_execution":
    "可写的人工客户端与 Agent 准备或执行冲突",
  "error.bound_socket_is_missing_or_changed": "绑定的 socket 缺失或发生变化",
  "error.bound_pane_no_longer_exists": "绑定的 pane 已不存在",
  "error.bound_pane_identity_changed": "绑定的 pane 身份发生变化",
  "error.pane_is_linked_into_another_session": "pane 被链接到其他会话",
  "error.tmux_server_process_changed": "tmux server 进程发生变化",
  "error.pane_process_changed": "pane 进程发生变化",
  "error.pane_exited_is_in_a_tmux_mode_or_has_synchronized_input":
    "pane 已退出、处于 tmux 模式或启用了同步输入",
  "error.operation_is_not_authorized_for_this_binding": "此绑定未授权该操作",
  "error.take_over_before_attaching_with_input_permission":
    "请先接管，再以输入权限 attach",
  "error.terminal_client_did_not_attach_before_its_deadline":
    "终端客户端未在截止时间前连接",
  "error.terminal_client_was_not_created": "未创建终端客户端",
  "error.no_alternate_screen_exists": "不存在备用屏幕",
  "error.this_tmux_build_cannot_capture_copy_mode_screens":
    "此 tmux 构建不支持采集复制模式屏幕",
  "error.pane_is_not_in_a_tmux_mode": "pane 当前不在 tmux 模式中",
  "error.terminal_screen_changed_during_capture_inspect_it_again":
    "采集期间终端屏幕发生变化；请重新检查",
  "error.raw_input_requires_human_control": "原始输入需要人工控制权",
  "error.input_may_be_partial_inspect_the_terminal_and_explicitly_hand_control_back_to_human":
    "输入可能只发送了一部分；请检查终端并明确交回人工控制权",
  "error.confirm_the_shell_before_handing_execution_control_to_an_agent":
    "请先确认 shell，再将执行控制权交给 Agent",
  "error.external_panes_can_only_be_unbound": "外部 pane 仅可解除绑定",
  "error.invalid_initialization_nonce": "初始化 nonce 无效",
  "error.invalid_transfer_nonce": "传输 nonce 无效",
  "error.historical_binding_is_missing_or_inconsistent": "历史绑定缺失或不一致",
  "error.binding_alias_does_not_match_its_record": "绑定别名与记录不匹配",
  "error.the_selected_session_id_was_replaced_select_a_session_again":
    "所选 session_id 已被替换；请重新选择会话",
  "error.session_is_not_registered": "会话未登记",
  "error.binding_record_is_invalid": "绑定记录无效",
  "error.archived_session_read_only":
    "此 session_id 已归档且只读；终端操作请选择当前连接",
  "error.history_directory_must_be_a_private_owned_directory_without_symbolic_links":
    "历史目录必须为当前用户拥有的私有目录，且不能包含符号链接",
  "error.invalid_historical_session_id": "历史 session_id 无效",
  "error.historical_session_identity_mismatch": "历史会话身份不匹配",
  "error.unexpected_history_filename": "历史文件名不符合预期",
  "error.historical_session_disappeared": "历史会话已消失",
  "error.display_name_changed_during_archival": "归档期间显示名称发生变化",
  "error.historical_id_is_associated_with_another_resource":
    "历史 ID 已关联其他资源",
  "error.unexpected_binding_filename": "绑定文件名不符合预期",
  "error.binding_filename_mismatch": "绑定文件名不匹配",
  "error.binding_registry_contains_invalid_state": "绑定注册表包含无效状态",
  "error.session_id_must_be_the_complete_32_character_bridge_id":
    "session_id 必须为完整的 32 字符 Bridge ID",
  "error.session_id_is_missing_or_no_longer_registered_inspect_list":
    "session_id 缺失或不再登记；请检查 list",
  "error.no_shared_session_exists_run_remote_terminal_connect_ssh_alias_in_a_real_terminal":
    "没有共享会话；请在真实终端运行 remote-terminal connect SSH_ALIAS",
  "error.multiple_sessions_exist_select_a_session_id_from_remote_terminal_list":
    "存在多个会话；请从 remote-terminal list 中选择 session_id",
  "error.no_shared_session_exists": "没有共享会话",
  "error.unsupported_binding_schema": "不支持此绑定 schema",
  "error.invalid_tmux_identity": "tmux 身份无效",
  "error.request_identity_does_not_match_its_file": "请求身份与文件不匹配",
  "error.request_record_is_invalid": "请求记录无效",
  "error.recent_request_index_is_invalid": "最近请求索引无效",
  "error.recent_request_record_is_missing": "最近请求记录缺失",
  "error.active_request_binding_mismatch": "活动请求的绑定不匹配",
  "error.active_request_record_is_missing": "活动请求记录缺失",
  "error.active_request_state_is_invalid": "活动请求状态无效",
  "error.an_unresolved_request_prevents_automatic_input":
    "未解决的请求阻止自动输入",
  "error.control_request_state_is_invalid": "控制请求状态无效",
  "error.cannot_read_durable_request_state": "无法读取持久化请求状态",
  "error.unsupported_request_schema": "不支持此请求 schema",
  "error.invalid_request_identifiers": "请求标识无效",
  "error.terminal_output_is_blocked_reconnect_the_viewer":
    "终端输出受阻；请重新连接查看器",
  "error.session_identity_changed": "会话身份发生变化",
  "error.agent_controls_input": "Agent 正在控制输入",
  "error.terminal_viewer_fell_behind_reconnect_the_viewer_to_inspect_the_session":
    "终端查看器处理落后；请重新连接查看器以检查会话",
  "error.cannot_access_the_local_tmux_socket_grant_its_unix_socket_access":
    "无法访问本地 tmux socket；请授予其 Unix socket 访问权限",
  "error.the_selected_tmux_object_is_missing": "所选 tmux 对象缺失",
  "error.tmux_operation_failed_inspect_session_state":
    "tmux 操作失败；请检查会话状态",
  "error.invalid_tmux_metadata": "tmux 元数据无效",
  "error.invalid_numeric_tmux_metadata": "tmux 数字元数据无效",
  "error.invalid_tmux_object_identity": "tmux 对象身份无效",
  "error.tmux_server_marker_is_invalid": "tmux server 标识无效",
  "error.invalid_tmux_client_metadata": "tmux 客户端元数据无效",
  "error.client_read_only_transition_was_not_applied":
    "客户端只读状态切换未生效",
  "error.invalid_terminal_cursor_metadata": "终端光标元数据无效",
  "error.terminal_cursor_exceeds_view_limits": "终端光标超过视图限制",
  "error.socket_is_not_owned_by_the_current_user": "socket 不属于当前用户",
  "error.tmux_socket_is_missing_or_unsafe": "tmux socket 缺失或不安全",
  "error.cannot_determine_tmux_version": "无法确定 tmux 版本",
  "error.tmux_is_required": "需要 tmux >={minimum}",
  "error.required_tmux_command_is_missing": "缺少所需的 tmux 命令",
  "error.tmux_hexadecimal_input_is_required": "需要 tmux 十六进制输入能力",
  "error.must_be_an_object": "{name} 必须为对象",
  "error.unknown_field": "未知的 {name} 字段：{key}",
  "error.must_be_a_bounded_string": "{name} 必须为大小受限的字符串",
  "error.is_outside_its_integer_range": "{name} 超出整数范围",
  "error.must_be_boolean": "{name} 必须为布尔值",
  "error.invalid": "{name} 无效",
  "error.must_be_an_array": "{name} 必须为数组",
  "error.session_alias_must_contain_1_64_ascii_letters_digits_underscores_or_hyphens":
    "会话别名必须包含 1–64 个 ASCII 字母、数字、下划线或连字符",
  "error.invalid_request_id": "请求 ID 无效",
  "error.is_not_valid_json": "{name} 不是有效的 JSON",
  "error.leave_the_alternate_screen_application_before_handing_over_the_shell":
    "交接 shell 前请退出备用屏幕中的应用",
  "error.the_previous_shell_report_does_not_match_the_requested_host":
    "先前 shell 报告与要求的主机不匹配",
  "error.take_over_inspect_the_terminal_and_use_resume_before_preparing_again":
    "请接管并检查终端，使用 resume 后再重新准备",
  "error.preparation_requires_a_dedicated_single_pane_session":
    "准备过程需要专用的单 pane 会话",
  "error.preparation_stopped_take_over_and_inspect_the_terminal":
    "准备已停止；请接管并检查终端",
  "error.initialization_transfer_line_exceeds_the_configured_limit":
    "初始化传输行超过配置的限制",
  "error.the_target_rejected_initialization_take_over_inspect_and_resume":
    "目标拒绝初始化（{rejected}）；请接管、检查并使用 resume",
  "error.initialization_acknowledgement_arrived_after_its_deadline":
    "初始化确认在截止时间后到达",
  "error.initialization_bootstrap_exceeds_the_configured_input_limit":
    "初始化引导代码超过配置的输入限制",
  "error.preparation_deadline_expired_before_handshake":
    "握手开始前准备操作已超时",
  "error.preparation_failed_inspect_the_session_before_resuming":
    "准备失败；请在恢复前检查会话",
  "error.lock_ownership_is_incomplete_or_unverifiable_stop_bridge_writers_for_maintenance":
    "锁的所有权不完整或无法核实；请停止 Bridge 写入进程进行维护",
  "error.takeover_is_not_yet_complete_inspect_status_before_typing":
    "接管尚未完成；请先检查状态再输入",
  "error.take_over_and_inspect_the_terminal_before_resuming":
    "请接管并检查终端后再使用 resume",
  "language.invalid": "language 必须为 auto、en 或 zh-CN",
  "help.title": "remote-terminal — 你与 Agent 的共享终端",
  "help.connect":
    "  connect SSH_ALIAS   返回该入口的连接，或新建连接并手工登录",
  "help.return": "  connect             返回已有共享终端",
  "help.status": "  status              查看当前状态及下一步",
  "help.takeover": "  takeover            接回输入控制权",
  "help.resume": "  resume              检查 shell 后继续",
  "help.handoff": "登录后告诉 Agent：登录已完成，请接管共享终端执行我的任务。",
  "help.controls":
    "在 connect 中可正常滚动、选择和复制。Agent 控制输入时，按 ? 打开接管/退出菜单；Ctrl+] 也可打开本地菜单。断线后按 r 新建连接，需手工登录，并生成新 session_id。",
  "help.advanced": "使用 --help --advanced 查看全部命令；--json 为机器接口。",
  "help.language": "使用 --lang auto|en|zh-CN 选择显示语言。",
  "help.all": "全部命令：{commands}",
  "session.empty":
    "没有共享会话。下一步：在真实终端运行 remote-terminal connect SSH_ALIAS。",
  "state.awaiting_human": "等待 shell 交接与准备；未检查登录状态",
  "state.preparing": "正在准备共享 shell",
  "state.ready": "已就绪，可执行获授权的 Agent 命令",
  "state.running": "命令正在运行",
  "state.needs_human": "需要人工检查；远端结果可能未知",
  "state.connection_ended": "连接已结束或绑定发生变化",
  "state.archived": "历史会话；请求元数据只读",
  "state.access_denied": "本地访问被拒绝；连接状态尚未核实",
  "state.inspection_failed": "本地检查失败；连接状态尚未核实",
  "session.heading": "会话 {session} | session_id={id}",
  "session.host": "最近一次 shell 报告的主机：{host}",
  "session.state": "状态：{state}",
  "session.next": "下一步：{next}",
  "session.ready": "会话 {id} 已就绪，可执行获授权的任务。",
  "session.taken_over":
    "输入控制权已交回。请检查终端，在 shell 就绪后确认 resume。",
  "result.completed": "\n已完成：{completed}；退出码：{exit}",
  "label.local": "本机：{fields}",
  "label.target": "目标：{fields}",
  "label.local_access": "本地访问权限：",
  "label.not_checked": "未检查",
  "label.unknown": "未知",
  "label.yes": "是",
  "label.no": "否",
  "next.inspect": "继续前请检查状态。",
  "next.local_access":
    "运行 remote-terminal doctor --session-id ID。为本次调用授予报告中所需的本地 Bridge 资源访问权限，再重新检查。",
  "next.archived":
    "使用此历史 session_id 查询旧请求；终端操作请通过 list 选择当前连接。",
  "next.tty": "打开真实的本机终端，运行 remote-terminal connect SSH_ALIAS。",
  "next.dependencies_mac":
    "检查本地 Bun/tmux/OpenSSH。必要时运行 brew install tmux；独立二进制已包含 Bun。",
  "next.dependencies_linux":
    "检查本地 Bun/tmux/OpenSSH。Debian/Ubuntu 请安装 tmux 和 openssh-client；独立二进制已包含 Bun。",
  "next.select":
    "运行 connect SSH_ALIAS 返回该入口的连接，使用 list 选择精确 session_id，或通过 connect SSH_ALIAS --new 新建连接。",
  "next.resume": "请让 Agent 将此会话交回人工接管；检查后确认 resume。",
  "next.busy": "继续输入前请检查状态；不要重复执行结果未知的命令。",
  "next.lock":
    "请停止 Bridge 写入进程，检查本地锁所有者后再维护；不要删除无法核实所有权的锁。",
  "next.state":
    "请停止 Bridge 写入进程并检查私有状态是否损坏。不要通过删除请求记录绕过恢复。",
  "next.error": "继续前请检查状态和报告的错误。",
  "clipboard.copied": "已复制到剪贴板：session_id={id}",
  "clipboard.unavailable": "剪贴板不可用；请手动复制：session_id={id}",
  "connect.new":
    "新连接：session_id={id}。旧 session_id={old} 及其结果保持不变。请手工完成登录，再交接新 session_id。",
  "connect.choose": "请选择会话编号：",
  "confirm.setup_locks":
    "先前的本地初始化进程已结束。是否恢复经核实的遗留初始化锁？远端任务不会改变。",
  "confirm.ended":
    "是否确认已检查旧的未知结果（不代表远端程序已停止）？此连接无法恢复，必须明确新建连接。",
  "confirm.takeover":
    "是否将所选终端交回人工控制？这不会自动中断其中运行的程序。",
  "confirm.ready":
    "是否已完成登录和目标选择、解决先前任务，并确认所选 shell 空闲且可交给 Agent？",
  "confirm.shell": "是否确认目标正确，且位于空白的兼容 Bash 提示符？",
  "confirm.recover": "是否确认已检查终端并解决未决命令？",
  "confirm.interrupt": "是否尝试中断指定的前台请求？",
  "confirm.bind": "是否登记此精确指定的外部 tmux pane？",
  "confirm.handoff": "是否将控制权交给 {to}？请确认 shell 输入行为空。",
  "confirm.manage": "是否确认对已登记会话执行 {command}？",
  "error.arguments": "命令行参数无效",
  "error.local_operation": "本地操作失败",
  "view.banner":
    "\n[Bridge {alias}] session_id={id}\nCtrl+] 本地菜单 | Agent 控制输入时：? 打开菜单 | 可正常滚动、选择和复制\n",
  "view.wait_input":
    "\r\n[输入行正在等待本地控制权] Ctrl+] 打开恢复/退出菜单。\r\n",
  "view.ended": "\n连接已结束。旧结果可能未知。\n{reconnect}[q] 退出\n",
  "view.reconnect": "[r] 在此窗口重连（手工登录；生成新 session_id） | ",
  "view.menu":
    "\n[本地菜单] [t] 接管（不会停止远端程序） | [c] 继续查看 | [q] 脱离\n",
  "view.human":
    "\n[你控制输入] 完成登录或检查后，请告诉 Agent shell 已就绪。Ctrl+] 打开本地菜单。\n",
  "view.preparing": "\n[正在准备共享 shell…] Ctrl+] 本地菜单\n",
  "view.agent":
    "\n[Agent 控制输入] 按 ? 再按 t 接管；Ctrl+] 也可打开本地菜单。\n",
  "view.inspect":
    "\n[需要检查] 远端结果可能未知。按 ? 再按 t 接管；Ctrl+] 也可打开本地菜单。\n",
  "view.blocked":
    "\n[Agent 操作期间输入受阻] 按 ? 再按 t 接管；Ctrl+] 也可打开菜单。仍可滚动、选择和复制。\n",
  "view.continue": "\n[已继续查看] Ctrl+] 本地菜单\n",
  "view.taking_over": "\n[正在交回输入控制权…]\n",
  "view.taken_over":
    "\n[输入已交回] 先前运行的程序可能仍在运行。输入前请先检查。\n",
  "view.unusable": "\n[连接已不可用]\n",
  "view.takeover_failed":
    "\n[接管失败] {reason}。输入仍受阻；Ctrl+] 本地菜单。\n",
  "view.inspect_local": "请检查本地状态",
  "view.input_full":
    "\n[输入缓冲区已满；输入已丢弃] 请使用 Ctrl+] 本地菜单。\n",
  "view.detached": "\n[已离开共享终端；远端任务未被中断]\n",
  "view.command": "\n[Agent 命令]\n$ {command}\n",
  "view.exit": "\n[Shell 报告退出码 {exit}]\n",
  "action.execute": "执行用户授权的任务。",
  "action.ready":
    "shell 准备尚未完成；status 不检查登录。若用户已确认完成登录、选择目标并交接此空闲 shell，请运行 remote-terminal ready --session-id {id} --confirm --json。否则只询问尚缺少的交接确认。",
  "action.resume": "请检查并解决终端状态，再确认 resume。",
  "action.takeover": "请接管、检查并解决终端状态，再使用 resume。",
  "action.wait": "等待此操作完成，或明确请求接管。",
  "action.history":
    "此 ID 已归档。可用其查询旧请求；终端操作需要当前连接的 ID。",
  "action.exited":
    "本地连接进程已退出。请在 connect 视图按 r 明确新建连接，生成新 session_id；旧的未知请求保持不变。",
  "action.local_access":
    "请对此会话运行 doctor，并授予所需的本地文件系统、Unix socket 和进程检查权限。",
  "action.reconnect":
    "请打开此会话的 connect 视图，再明确按 r 重连并生成新 session_id。旧的未知请求保持不变。",
  "result.nonzero": "远端命令以非零状态退出",
  "result.incomplete": "请求尚未确认完成；请检查其记录状态",
  "result.ended": "旧连接已不可用；未接管或准备任何终端",
  "action.reconnect_unknown":
    "旧结果仍然未知。请在 connect 视图按 r 明确新建连接；重复执行任何任务前请先检查旧结果。",
  "action.reconnect_new":
    "请在 connect 视图按 r 明确新建连接并生成新 session_id；旧结果保持不变。",
  "doctor.denied": "本地访问检查被拒绝；操作此会话前请先查看 local_access",
  "doctor.backend": "所需的本地 tmux 后端不可用",
  "doctor.selection": "所选会话未登记",
  "doctor.failed": "无法完成本地访问检查",
  "doctor.no_probe": "未发送远端探针；请选择已登记会话以检查本地 socket 和进程",
  "doctor.grant":
    "请为本次 Bridge 调用授予报告中的本地资源访问权限，再运行 doctor。session_id 不授予操作系统权限；本地权限拒绝不代表连接已断开。",
  "doctor.review": "使用所选会话前请检查缺失或变化的项目。",
} satisfies Record<keyof typeof en, string>
