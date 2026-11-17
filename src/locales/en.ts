export const en = {
  "config.unsafe_file":
    "Cannot use configuration file: {path}. It must be a regular file owned by the current user, without symbolic links or group/other write permission. Standard 0644 and private 0600 permissions are supported; for an owned regular file, remove group/other write permission with chmod go-w.",
  "config.missing_file": "Configuration file does not exist: {path}",
  "config.cannot_read": "Cannot read configuration file: {path}",
  "next.config":
    "Check the configuration file path, ownership, JSON and group/other write permission. Standard 0644 is supported. Use --config PATH to select another file.",
  "error.unknown_command": "Unknown command",
  "error.unexpected_positional_arguments": "Unexpected positional arguments",
  "error.option_is_not_accepted_for_this_command":
    "Option --{key} is not accepted for this command",
  "error.only_macos_and_linux_are_supported":
    "Only macOS and Linux are supported",
  "error.use_either_session_id_or_session_not_both":
    "Use either --session-id or --session, not both",
  "error.connect_is_interactive_use_list_status_json_for_inspection":
    "connect is interactive. Use session --json to inspect sessions.",
  "error.session_list_selector":
    "Use session status with --session-id ID or --session NAME to inspect one session.",
  "error.session_management_selector":
    "Select the session to manage with --session-id ID or --session NAME.",
  "error.connect_requires_a_real_terminal_run_remote_terminal_connect_ssh_alias_there":
    "connect requires a real terminal; run remote-terminal connect SSH_ALIAS there",
  "error.new_requires_an_ssh_entry_alias": "--new requires an SSH entry alias",
  "error.connect_selector_conflict":
    "Use connect --session-id ID to return to that session, or connect SSH_ALIAS to open a new connection",
  "error.local_setup_lock_ownership_cannot_be_verified_controlled_maintenance_is_required":
    "Local setup lock ownership cannot be verified; controlled maintenance is required",
  "error.choose_a_listed_session_number": "Choose a listed session number",
  "error.pane_cannot_expand_a_registered_binding":
    "--pane cannot expand a registered binding",
  "error.provide_exactly_one_command_argument_or_command_stdin":
    "Provide exactly one command argument or --command-stdin",
  "error.requires_request_id": "{command} requires --request-id",
  "error.bind_requires_socket_and_pane": "bind requires --socket and --pane",
  "error.send_requires_raw_and_text": "send requires --raw and --text",
  "error.attach_is_interactive_and_does_not_support_json":
    "attach is interactive and does not support --json",
  "error.attach_requires_a_real_terminal": "attach requires a real terminal",
  "error.local_access_was_denied_run_doctor_for_the_selected_session":
    "Local access was denied; run doctor for the selected session",
  "error.timeout_must_be_a_finite_positive_number_within_the_configured_maximum":
    "timeout must be a finite positive number within the configured maximum",
  "error.command_stdin_requires_piped_input":
    "--command-stdin requires piped input",
  "error.command_input_exceeds_its_limit": "Command input exceeds its limit",
  "error.command_must_be_valid_utf_8": "Command must be valid UTF-8",
  "error.explicit_management_confirmation_is_required_use_confirm_after_review":
    "Explicit management confirmation is required; use --confirm after review",
  "error.operation_was_not_confirmed": "Operation was not confirmed",
  "error.configuration_exceeds_64_kib": "Configuration exceeds 64 KiB",
  "error.cannot_read_local_bridge_configuration":
    "Cannot read local Bridge configuration",
  "error.cannot_read_configuration": "Cannot read configuration",
  "error.unsupported_configuration_schema": "Unsupported configuration schema",
  "error.default_timeout_exceeds_maximum": "Default timeout exceeds maximum",
  "error.unsupported_backend": "Unsupported backend",
  "error.invalid_minimum_tmux_version": "Invalid minimum tmux version",
  "error.tmux_minimum_cannot_be_below_3_2": "tmux minimum cannot be below 3.2",
  "error.cannot_be_disabled": "{key} cannot be disabled",
  "error.automatic_interruption_is_unsupported":
    "Automatic interruption is unsupported",
  "error.command_output_persistence_is_not_enabled_in_this_release":
    "Command/output persistence is not enabled in this release",
  "error.too_many_session_policies": "Too many session policies",
  "error.must_be_absolute": "{name} must be absolute",
  "error.connection_entry_conflict":
    "That name belongs to another or unknown SSH entry; return to it without an SSH argument, or omit --session to create a separate connection",
  "error.live_connection_name_conflict":
    "That name already has a live connection. Omit --session to open a new connection with an automatic name.",
  "error.the_old_connection_name_now_identifies_another_session_select_the_new_id_explicitly":
    "The old connection name now identifies another session; select the new ID explicitly",
  "error.this_session_has_no_managed_ssh_entry_to_reconnect":
    "This session has no managed SSH entry to reconnect",
  "error.the_old_connection_is_still_live_inspect_it_before_reconnecting":
    "The old connection is still live; inspect it before reconnecting",
  "error.control_deadline_expired_before_connection":
    "Control deadline expired before connection",
  "error.control_stream_attached_to_an_unexpected_pane":
    "Control stream attached to an unexpected pane",
  "error.control_deadline_expired_before_input":
    "Control deadline expired before input",
  "error.control_client_is_unavailable": "Control client is unavailable",
  "error.control_message_exceeds_its_buffer_limit":
    "Control message exceeds its buffer limit",
  "error.control_stream_closed_before_completion":
    "Control stream closed before completion",
  "error.tmux_rejected_a_control_command": "tmux rejected a control command",
  "error.control_reply_exceeds_its_limit": "Control reply exceeds its limit",
  "error.control_stream_failed": "Control stream failed",
  "error.control_operation_exceeded_its_deadline":
    "Control operation exceeded its deadline",
  "error.invalid_tmux_output_escape": "Invalid tmux output escape",
  "error.state_root_is_not_a_private_owned_directory":
    "State root is not a private owned directory",
  "error.the_saved_terminal_identity_changed":
    "The saved terminal identity changed",
  "error.the_saved_tmux_process_identity_changed":
    "The saved tmux process identity changed",
  "error.command_is_empty_contains_nul_or_exceeds_its_byte_limit":
    "Command is empty, contains NUL or exceeds its byte limit",
  "error.request_id_is_already_associated_with_another_command":
    "Request ID is already associated with another command",
  "error.a_confirmed_shell_and_agent_control_are_required":
    "A confirmed shell and Agent control are required",
  "error.execution_coordination_failed_after_dispatch_inspect_durable_request_history":
    "Execution coordination failed after dispatch; inspect durable request history",
  "error.shell_handshake_failed_take_over_inspect_the_terminal_and_resume":
    "Shell handshake failed; take over, inspect the terminal and resume",
  "error.reported_hostname_does_not_match_the_explicitly_requested_destination":
    "Reported hostname does not match the explicitly requested destination",
  "error.request_does_not_exist": "Request does not exist",
  "error.no_matching_unresolved_request_exists":
    "No matching unresolved request exists",
  "error.another_unresolved_request_is_active":
    "Another unresolved request is active",
  "error.no_matching_active_request_exists":
    "No matching active request exists",
  "error.no_live_execution_coordinator_remains_use_explicit_manual_takeover":
    "No live execution coordinator remains; use explicit manual takeover",
  "error.current_shell_initialization_is_missing":
    "Current shell initialization is missing",
  "error.alternate_screen_applications_cannot_receive_exec_requests":
    "Alternate-screen applications cannot receive exec requests",
  "error.exec_requires_a_dedicated_single_pane_session":
    "exec requires a dedicated single-pane session",
  "error.encoded_execution_line_exceeds_its_limit":
    "Encoded execution line exceeds its limit",
  "error.terminal_topology_or_mode_changed_during_execution":
    "Terminal topology or mode changed during execution",
  "error.deadline_exceeded_the_remote_command_may_still_be_running":
    "Deadline exceeded; the remote command may still be running",
  "error.user_requested_manual_takeover_command_outcome_is_uncertain":
    "User requested manual takeover; command outcome is uncertain",
  "error.terminal_changed_before_completion_was_committed":
    "Terminal changed before completion was committed",
  "error.completion_arrived_after_the_execution_deadline":
    "Completion arrived after the execution deadline",
  "error.local_execution_coordination_failed":
    "Local execution coordination failed",
  "error.cannot_persist_execution_outcome_the_durable_dispatch_claim_remains_unresolved":
    "Cannot persist execution outcome; the durable dispatch claim remains unresolved",
  "error.cannot_inspect_local_process_identity":
    "Cannot inspect local process identity",
  "error.process_has_exited": "Process has exited",
  "error.cannot_verify_process_creation_identity":
    "Cannot verify process creation identity",
  "error.cannot_run_local_process_identity_inspection_grant_process_inspection_access":
    "Cannot run local process identity inspection; grant process inspection access",
  "error.cannot_verify_local_process_identity":
    "Cannot verify local process identity",
  "error.only_macos_and_linux_process_identity_is_supported":
    "Only macOS and Linux process identity is supported",
  "error.resource_lock_maintenance_is_in_progress":
    "Resource lock maintenance is in progress",
  "error.resource_is_locked_stale_locks_require_explicit_recovery":
    "Resource is locked; stale locks require explicit recovery",
  "error.lock_ownership_changed_refusing_cleanup":
    "Lock ownership changed; refusing cleanup",
  "error.lock_directory_is_unsafe": "Lock directory is unsafe",
  "error.lock_owner_cannot_be_verified_stop_all_bridge_writers_before_manual_maintenance":
    "Lock owner cannot be verified; stop all Bridge writers before manual maintenance",
  "error.lock_belongs_to_another_boot_manual_maintenance_is_required":
    "Lock belongs to another boot; manual maintenance is required",
  "error.lock_pid_is_alive_or_unverifiable_refusing_takeover":
    "Lock PID is alive or unverifiable; refusing takeover",
  "error.lock_changed_during_recovery": "Lock changed during recovery",
  "error.permission_denied_starting_a_required_local_program_inspect_doctor_local_access":
    "Permission denied starting a required local program; inspect doctor local_access",
  "error.cannot_start_required_local_program":
    "Cannot start required local program",
  "error.local_operation_exceeded_its_deadline":
    "Local operation exceeded its deadline",
  "error.local_operation_exceeded_its_output_limit":
    "Local operation exceeded its output limit",
  "error.execution_frame_exceeds_its_limit":
    "Execution frame exceeds its limit",
  "error.duplicate_execution_completion_frame":
    "Duplicate execution completion frame",
  "error.unsupported_shell_profile_response":
    "Unsupported shell profile response",
  "error.unsupported_or_inconsistent_bash_version":
    "Unsupported or inconsistent Bash version",
  "error.bash_3_requires_a_verified_minor_version":
    "Bash 3 requires a verified minor version",
  "error.malformed_or_out_of_order_execution_frame":
    "Malformed or out-of-order execution frame",
  "error.invalid_encoded_shell_metadata": "Invalid encoded shell metadata",
  "error.shell_metadata_is_not_utf_8": "Shell metadata is not UTF-8",
  "error.bun_is_required_found": "Bun {bun} is required (found {version})",
  "error.state_directory_must_be_owned_by_the_current_user_with_mode_0700":
    "State directory must be owned by the current user with mode 0700",
  "error.state_file_ownership_permissions_or_size_is_invalid":
    "State file ownership, permissions or size is invalid",
  "error.state_file_is_too_large": "State file is too large",
  "error.state_file_is_not_a_private_regular_file":
    "State file is not a private regular file",
  "error.raw_input_contains_control_characters_or_exceeds_the_input_limit":
    "Raw input contains control characters or exceeds the input limit",
  "error.cannot_access_private_bridge_state_grant_the_selected_state_directory_access":
    "Cannot access private Bridge state; grant the selected state directory access",
  "error.cannot_access_private_bridge_state":
    "Cannot access private Bridge state",
  "error.ssh_destination_must_be_a_configuration_alias":
    "SSH destination must be a configuration alias",
  "error.session_name_is_already_registered_select_it_explicitly_or_choose_a_new_session_name":
    "Session name is already registered; select it explicitly or choose a new --session name",
  "error.local_openssh_is_required_for_a_new_connection":
    "Local OpenSSH is required for a new connection",
  "error.connection_name_occupied":
    "This display name is occupied. Select it explicitly or omit --session to open a new connection.",
  "error.session_changed_before_archival": "Session changed before archival",
  "error.a_live_connection_cannot_be_retired_to_reuse_its_name":
    "A live connection cannot be retired to reuse its name",
  "error.tmux_did_not_create_the_expected_pane":
    "tmux did not create the expected pane",
  "error.an_exact_pane_id_such_as_3_is_required":
    "An exact pane ID such as %3 is required",
  "error.alias_is_already_registered": "Alias is already registered",
  "error.pane_is_exited_already_marked_or_linked_into_multiple_sessions":
    "Pane is exited, already marked or linked into multiple sessions",
  "error.pane_is_already_registered": "Pane is already registered",
  "error.a_writable_human_client_conflicts_with_agent_preparation_or_execution":
    "A writable human client conflicts with Agent preparation or execution",
  "error.bound_socket_is_missing_or_changed":
    "Bound socket is missing or changed",
  "error.bound_pane_no_longer_exists": "Bound pane no longer exists",
  "error.bound_pane_identity_changed": "Bound pane identity changed",
  "error.pane_is_linked_into_another_session":
    "Pane is linked into another session",
  "error.tmux_server_process_changed": "tmux server process changed",
  "error.pane_process_changed": "Pane process changed",
  "error.pane_exited_is_in_a_tmux_mode_or_has_synchronized_input":
    "Pane exited, is in a tmux mode, or has synchronized input",
  "error.operation_is_not_authorized_for_this_binding":
    "Operation is not authorized for this binding",
  "error.take_over_before_attaching_with_input_permission":
    "Take over before attaching with input permission",
  "error.terminal_client_did_not_attach_before_its_deadline":
    "Terminal client did not attach before its deadline",
  "error.terminal_client_was_not_created": "Terminal client was not created",
  "error.no_alternate_screen_exists": "No alternate screen exists",
  "error.this_tmux_build_cannot_capture_copy_mode_screens":
    "This tmux build cannot capture copy-mode screens",
  "error.pane_is_not_in_a_tmux_mode": "Pane is not in a tmux mode",
  "error.terminal_screen_changed_during_capture_inspect_it_again":
    "Terminal screen changed during capture; inspect it again",
  "error.raw_input_requires_human_control": "Raw input requires human control",
  "error.input_may_be_partial_inspect_the_terminal_and_explicitly_hand_control_back_to_human":
    "Input may be partial; inspect the terminal and explicitly hand control back to human",
  "error.external_panes_can_only_be_unbound":
    "External panes can only be unbound",
  "error.invalid_initialization_nonce": "Invalid initialization nonce",
  "error.invalid_transfer_nonce": "Invalid transfer nonce",
  "error.historical_binding_is_missing_or_inconsistent":
    "Historical binding is missing or inconsistent",
  "error.binding_alias_does_not_match_its_record":
    "Binding alias does not match its record",
  "error.the_selected_session_id_was_replaced_select_a_session_again":
    "The selected session_id was replaced; select a session again",
  "error.session_is_not_registered": "Session is not registered",
  "error.binding_record_is_invalid": "Binding record is invalid",
  "error.archived_session_read_only":
    "This session_id is historical and read-only; select a current connection for terminal operations",
  "error.history_directory_must_be_a_private_owned_directory_without_symbolic_links":
    "History directory must be a private owned directory, without symbolic links",
  "error.invalid_historical_session_id": "Invalid historical session_id",
  "error.historical_session_identity_mismatch":
    "Historical session identity mismatch",
  "error.unexpected_history_filename": "Unexpected history filename",
  "error.historical_session_disappeared": "Historical session disappeared",
  "error.display_name_changed_during_archival":
    "Display name changed during archival",
  "error.historical_id_is_associated_with_another_resource":
    "Historical ID is associated with another resource",
  "error.unexpected_binding_filename": "Unexpected binding filename",
  "error.binding_filename_mismatch": "Binding filename mismatch",
  "error.binding_registry_contains_invalid_state":
    "Binding registry contains invalid state",
  "error.session_id_must_be_the_complete_32_character_bridge_id":
    "session_id must be the complete 32-character Bridge ID",
  "error.session_id_is_missing_or_no_longer_registered_inspect_list":
    "session_id is missing or no longer registered; inspect session list",
  "error.no_shared_session_exists_run_remote_terminal_connect_ssh_alias_in_a_real_terminal":
    "No shared session exists; run remote-terminal connect SSH_ALIAS in a real terminal",
  "error.multiple_sessions_exist_select_a_session_id_from_remote_terminal_list":
    "Multiple sessions exist. Select a session_id from remote-terminal session.",
  "error.no_shared_session_exists": "No shared session exists",
  "error.unsupported_binding_schema": "Unsupported binding schema",
  "error.invalid_tmux_identity": "Invalid tmux identity",
  "error.request_identity_does_not_match_its_file":
    "Request identity does not match its file",
  "error.request_record_is_invalid": "Request record is invalid",
  "error.recent_request_index_is_invalid": "Recent request index is invalid",
  "error.recent_request_record_is_missing": "Recent request record is missing",
  "error.active_request_binding_mismatch": "Active request binding mismatch",
  "error.active_request_record_is_missing": "Active request record is missing",
  "error.active_request_state_is_invalid": "Active request state is invalid",
  "error.an_unresolved_request_prevents_automatic_input":
    "An unresolved request prevents automatic input",
  "error.control_request_state_is_invalid": "Control request state is invalid",
  "error.cannot_read_durable_request_state":
    "Cannot read durable request state",
  "error.unsupported_request_schema": "Unsupported request schema",
  "error.invalid_request_identifiers": "Invalid request identifiers",
  "error.terminal_output_is_blocked_reconnect_the_viewer":
    "Terminal output is blocked; reconnect the viewer",
  "error.session_identity_changed": "Session identity changed",
  "error.agent_controls_input": "Agent controls input",
  "error.terminal_viewer_fell_behind_reconnect_the_viewer_to_inspect_the_session":
    "Terminal viewer fell behind; reconnect the viewer to inspect the session",
  "error.cannot_access_the_local_tmux_socket_grant_its_unix_socket_access":
    "Cannot access the local tmux socket; grant its Unix socket access",
  "error.the_selected_tmux_object_is_missing":
    "The selected tmux object is missing",
  "error.tmux_operation_failed_inspect_session_state":
    "tmux operation failed; inspect session state",
  "error.invalid_tmux_metadata": "Invalid tmux metadata",
  "error.invalid_numeric_tmux_metadata": "Invalid numeric tmux metadata",
  "error.invalid_tmux_object_identity": "Invalid tmux object identity",
  "error.tmux_server_marker_is_invalid": "tmux server marker is invalid",
  "error.invalid_tmux_client_metadata": "Invalid tmux client metadata",
  "error.client_read_only_transition_was_not_applied":
    "Client read-only transition was not applied",
  "error.invalid_terminal_cursor_metadata": "Invalid terminal cursor metadata",
  "error.terminal_cursor_exceeds_view_limits":
    "Terminal cursor exceeds view limits",
  "error.socket_is_not_owned_by_the_current_user":
    "Socket is not owned by the current user",
  "error.tmux_socket_is_missing_or_unsafe": "tmux socket is missing or unsafe",
  "error.cannot_determine_tmux_version": "Cannot determine tmux version",
  "error.tmux_is_required": "tmux >={minimum} is required",
  "error.required_tmux_command_is_missing": "Required tmux command is missing",
  "error.tmux_hexadecimal_input_is_required":
    "tmux hexadecimal input is required",
  "error.must_be_an_object": "{name} must be an object",
  "error.unknown_field": "Unknown {name} field: {key}",
  "error.must_be_a_bounded_string": "{name} must be a bounded string",
  "error.is_outside_its_integer_range": "{name} is outside its integer range",
  "error.must_be_boolean": "{name} must be boolean",
  "error.invalid": "Invalid {name}",
  "error.must_be_an_array": "{name} must be an array",
  "error.session_alias_must_contain_1_64_ascii_letters_digits_underscores_or_hyphens":
    "Session alias must contain 1–64 ASCII letters, digits, underscores or hyphens",
  "error.invalid_request_id": "Invalid request ID",
  "error.is_not_valid_json": "{name} is not valid JSON",
  "error.leave_the_alternate_screen_application_before_handing_over_the_shell":
    "Leave the alternate-screen application before handing over the shell",
  "error.the_previous_shell_report_does_not_match_the_requested_host":
    "The previous shell report does not match the requested host",
  "error.take_over_inspect_the_terminal_and_use_resume_before_preparing_again":
    "Take over, inspect the terminal and use resume before preparing again",
  "error.preparation_requires_a_dedicated_single_pane_session":
    "Preparation requires a dedicated single-pane session",
  "error.preparation_stopped_take_over_and_inspect_the_terminal":
    "Preparation stopped; take over and inspect the terminal",
  "error.initialization_transfer_line_exceeds_the_configured_limit":
    "Initialization transfer line exceeds the configured limit",
  "error.the_target_rejected_initialization_take_over_inspect_and_resume":
    "The target rejected initialization ({rejected}); take over, inspect and resume",
  "error.initialization_acknowledgement_arrived_after_its_deadline":
    "Initialization acknowledgement arrived after its deadline",
  "error.initialization_bootstrap_exceeds_the_configured_input_limit":
    "Initialization bootstrap exceeds the configured input limit",
  "error.preparation_deadline_expired_before_handshake":
    "Preparation deadline expired before handshake",
  "error.preparation_failed_inspect_the_session_before_resuming":
    "Preparation failed; inspect the session before resuming",
  "error.lock_ownership_is_incomplete_or_unverifiable_stop_bridge_writers_for_maintenance":
    "Lock ownership is incomplete or unverifiable; stop Bridge writers for maintenance",
  "error.takeover_is_not_yet_complete_inspect_status_before_typing":
    "Takeover is not yet complete; inspect status before typing",
  "error.take_over_and_inspect_the_terminal_before_resuming":
    "Take over and inspect the terminal before resuming",
  "language.invalid": "language must be auto, en or zh-CN",
  "help.description.root": "Shared terminal for you and your Agent",
  "help.section.description": "DESCRIPTION",
  "help.section.usage": "USAGE",
  "help.section.arguments": "ARGUMENTS",
  "help.section.flags": "FLAGS",
  "help.section.global_flags": "GLOBAL FLAGS",
  "help.section.subcommands": "SUBCOMMANDS",
  "help.section.notes": "NOTES",
  "help.command.doctor":
    "Diagnose local access, dependencies and session state",
  "help.command.capabilities": "Print machine-readable capabilities",
  "help.command.connect":
    "Open a new SSH session, or return to an existing session",
  "help.command.session": "List and manage sessions",
  "help.command.ready": "Prepare the selected shell and hand it to the Agent",
  "help.command.takeover": "Return input control to you",
  "help.command.resume": "Continue after you have inspected the shell",
  "help.command.start": "Register a new local tmux pane",
  "help.command.bind": "Register an exactly specified external tmux pane",
  "help.command.unbind": "Remove a binding and leave the terminal running",
  "help.command.list": "List sessions and their status",
  "help.command.status": "Show the selected session status",
  "help.command.capture": "Read a terminal snapshot",
  "help.command.send": "Send raw input to the terminal",
  "help.command.attach": "Attach to the shared terminal view",
  "help.command.stop": "Stop a managed session",
  "help.command.recover_lock": "Recover a verified leftover lock",
  "help.command.exec": "Execute one command in the selected session",
  "help.command.request": "Query an existing request",
  "help.command.recover": "Recover a request that ended unexpectedly",
  "help.command.interrupt": "Try to interrupt the foreground request",
  "help.argument.ssh_alias":
    "SSH config alias; omit it to choose an existing session",
  "help.argument.command":
    "Command to run; use --command-stdin to read it from standard input",
  "help.flag.help": "Show help information",
  "help.flag.version": "Show version information",
  "help.flag.json": "Print machine-readable JSON",
  "help.flag.lang": "Select the display language",
  "help.flag.config": "Use a specific configuration file",
  "help.flag.session": "Select a session by name",
  "help.flag.session_id": "Select a session by session_id",
  "help.flag.advanced": "Show every command in help",
  "help.flag.new": "Open a new connection even when a session exists",
  "help.flag.confirm": "Acknowledge an explicit management action",
  "help.flag.timeout": "Deadline in seconds",
  "help.flag.expected_host": "Expected host reported by the shell",
  "help.flag.lines": "Number of snapshot lines",
  "help.flag.screen": "Screen buffer to read",
  "help.flag.pane": "Exact tmux pane target",
  "help.flag.raw": "Enable raw input; required by send",
  "help.flag.text": "Text to send",
  "help.flag.enter": "Append a newline after sending",
  "help.flag.writable": "Request a writable attachment",
  "help.flag.request_id": "Request identifier",
  "help.flag.socket": "tmux socket path",
  "help.flag.permissions": "Allowed operations, comma separated",
  "help.flag.history": "Include archived sessions",
  "help.flag.scope": "Lock scope",
  "help.flag.command_stdin": "Read the command from standard input",
  "help.flag.ssh": "SSH config alias",
  "help.note.ready":
    "After login and handoff, ready prepares the shell for the Agent.",
  "help.note.pane":
    "Registering a pane does not authenticate it; you still log in manually.",
  "help.note.send": "send is raw input, not exec.",
  "help.session_options":
    "Use --session NAME to select by name. Stop and unbind require confirmation. Add --json for machine output.",
  "help.takeover": "  takeover            Return input control to you",
  "help.resume":
    "  resume              Continue after you have inspected the shell",
  "help.handoff":
    "After login, tell your Agent: Login is complete; take over and use the shared terminal for my task.",
  "help.controls":
    "In connect: scroll/select/copy normally; While Agent controls input, ? opens takeover/exit; Ctrl+] also opens the local menu. After disconnect: r reconnects with manual login and a new session_id.",
  "help.advanced":
    "Use --help --advanced for all commands; --json for the machine interface.",
  "help.language": "Use --lang auto|en|zh-CN to choose the display language.",
  "session.empty":
    "No shared sessions. Next: remote-terminal connect SSH_ALIAS in a real terminal.",
  "state.awaiting_human":
    "Awaiting shell handoff and preparation; login is not checked",
  "state.preparing": "Preparing the shared shell",
  "state.ready": "Ready for authorized Agent commands",
  "state.running": "Command is running",
  "state.needs_human":
    "Needs human inspection; the remote outcome may be unknown",
  "state.connection_ended": "Connection ended or binding changed",
  "state.archived": "Historical session; request metadata is read-only",
  "state.access_denied": "Local access denied; connection health is unverified",
  "state.inspection_failed":
    "Local inspection failed; connection health is unverified",
  "session.heading": "Session {session} | session_id={id}",
  "session.host": "Last shell-reported host: {host}",
  "session.state": "State: {state}",
  "session.next": "Next: {next}",
  "session.ready": "Session {id} is ready for the authorized task.",
  "session.taken_over":
    "Input control has returned to you. Inspect the terminal, then confirm resume when the shell is ready.",
  "result.completed": "\nCompleted: {completed}; exit: {exit}",
  "label.local": "Local: {fields}",
  "label.target": "Target: {fields}",
  "label.local_access": "Local access:",
  "label.not_checked": "not checked",
  "label.unknown": "unknown",
  "label.yes": "true",
  "label.no": "false",
  "next.inspect": "Inspect status before continuing.",
  "next.local_access":
    "Run remote-terminal doctor --session-id ID. Grant the reported local Bridge resources for the invocation, then retry inspection.",
  "next.archived":
    "Query old requests with this historical session_id. Run remote-terminal session to find a current session.",
  "next.tty":
    "Open a real local terminal and run remote-terminal connect SSH_ALIAS.",
  "next.dependencies_mac":
    "Check local Bun/tmux/OpenSSH. Install tmux with brew install tmux if needed; the standalone binary includes Bun.",
  "next.dependencies_linux":
    "Check local Bun/tmux/OpenSSH. On Debian/Ubuntu install tmux and openssh-client; the standalone binary includes Bun.",
  "next.select":
    "Run connect to choose an existing session, connect --session-id ID to return directly, or connect SSH_ALIAS to open a new connection.",
  "next.resume":
    "Ask your Agent to take over this session; inspect it, then confirm resume.",
  "next.busy":
    "Inspect status before any further input; never repeat an unknown command.",
  "next.lock":
    "Stop Bridge writers and inspect the local lock owner before maintenance; do not delete an unverifiable lock.",
  "next.state":
    "Stop Bridge writers and inspect the private state for corruption. Do not delete request records to bypass recovery.",
  "next.error": "Inspect status and the reported error before continuing.",
  "clipboard.copied": "Copied to clipboard: session_id={id}",
  "clipboard.unavailable":
    "Clipboard unavailable; copy manually: session_id={id}",
  "connect.new":
    "New connection: session_id={id}. Old session_id={old} and its results remain unchanged. Complete login manually, then hand over this new session_id.",
  "connect.choose": "Choose a session number: ",
  "confirm.setup_locks":
    "A previous local setup process has ended. Recover its verified abandoned setup locks? Remote tasks will not be changed.",
  "confirm.ended":
    "Acknowledge the old unknown outcome without claiming the remote program stopped? This connection cannot be resumed; a new connection must be created explicitly.",
  "confirm.takeover":
    "Return this selected terminal to human control without automatically interrupting its program?",
  "confirm.ready":
    "Login and target selection are complete, prior work is resolved, and this selected shell is idle and ready for the Agent?",
  "confirm.recover":
    "Confirm that you inspected the terminal and resolved the outstanding command?",
  "confirm.interrupt": "Attempt to interrupt the named foreground request?",
  "confirm.bind": "Register this exact external tmux pane?",
  "confirm.manage": "Confirm {command} for this registered session?",
  "error.arguments": "Invalid command line arguments",
  "error.local_operation": "Local operation failed",
  "view.banner":
    "\n[Bridge {alias}] session_id={id}\nCtrl+] local menu | While Agent controls input: ? opens the menu | Scroll/select/copy normally\n",
  "view.wait_input":
    "\r\n[Input line awaiting local ownership] Ctrl+] opens recovery/exit.\r\n",
  "view.ended":
    "\nConnection ended. Old results may be unknown.\n{reconnect}[q] Exit\n",
  "view.reconnect":
    "[r] Reconnect in this window (manual login; new session_id) | ",
  "view.menu":
    "\n[Local menu] [t] Take over (does not stop a remote program) | [c] Continue viewing | [q] Detach\n",
  "view.human":
    "\n[You control input] Finish login/inspection, then tell your Agent the shell is ready. Ctrl+] opens the local menu.\n",
  "view.preparing": "\n[Preparing shared shell…] Ctrl+] local menu\n",
  "view.agent":
    "\n[Agent controls input] Press ? then t to take over; Ctrl+] also opens the local menu.\n",
  "view.inspect":
    "\n[Needs inspection] Remote outcome may be unknown. Press ? then t to take over; Ctrl+] also opens the local menu.\n",
  "view.blocked":
    "\n[Input blocked while Agent operates] Press ? then t to take over; Ctrl+] also opens the menu. Scroll/select/copy remain available.\n",
  "view.continue": "\n[Viewing resumed] Ctrl+] local menu\n",
  "view.taking_over": "\n[Returning input control…]\n",
  "view.taken_over":
    "\n[Input returned to you] A previously running program may still run. Inspect before typing.\n",
  "view.unusable": "\n[Connection no longer usable]\n",
  "view.takeover_failed":
    "\n[Takeover failed] {reason}. Input remains blocked; Ctrl+] local menu.\n",
  "view.inspect_local": "Inspect local state",
  "view.input_full":
    "\n[Input buffer full; input discarded] Use Ctrl+] local menu.\n",
  "view.detached":
    "\n[Left shared terminal; remote jobs were not interrupted]\n",
  "view.command": "\n[Agent command]\n$ {command}\n",
  "view.exit": "\n[Shell reported exit {exit}]\n",
  "action.execute": "Execute the user-authorized task.",
  "action.ready":
    "Shell preparation has not completed; status does not check login. If the user has already confirmed login and target selection and handed over this idle shell, run remote-terminal ready --session-id {id} --confirm --json. Otherwise ask only for the missing handoff confirmation.",
  "action.resume":
    "Inspect and resolve the terminal state, then confirm resume.",
  "action.takeover":
    "Take over, inspect and resolve the terminal state, then resume.",
  "action.wait": "Wait for this operation or explicitly request takeover.",
  "action.history":
    "This ID is historical. Query old request IDs here; terminal operations require the current connection's ID.",
  "action.exited":
    "The local connection process exited. Use r in the connect view to explicitly reconnect with a new session_id; old unknown requests remain unchanged.",
  "action.local_access":
    "Run doctor for this session and grant the required local filesystem, Unix socket and process inspection access.",
  "action.reconnect":
    "Open connect for this session, then explicitly choose r to reconnect with a new session_id. Old unknown requests remain unchanged.",
  "result.nonzero": "Remote command exited with a nonzero status",
  "result.incomplete":
    "Request did not reach a confirmed completion; inspect its recorded state",
  "result.ended":
    "The old connection is no longer usable; no terminal was taken over or prepared",
  "action.reconnect_unknown":
    "The old result remains unknown. Use r in the connect view to explicitly create a new connection; inspect the old outcome before repeating any work.",
  "action.reconnect_new":
    "Use r in the connect view to explicitly create a new connection with a new session_id; the old result remains unchanged.",
  "doctor.denied":
    "Local access checks were denied; review local_access before operating this session",
  "doctor.backend": "A required local tmux backend is unavailable",
  "doctor.selection": "The selected session is not registered",
  "doctor.failed": "A local access check could not be established",
  "doctor.no_probe":
    "No remote probe was sent; select a registered session for local socket and process checks",
  "doctor.grant":
    "Grant this Bridge invocation the reported local resources, then rerun doctor. A session_id does not grant OS access; a local permission denial does not establish disconnection.",
  "doctor.review":
    "Review missing/changed checks before using the selected session.",
} as const
