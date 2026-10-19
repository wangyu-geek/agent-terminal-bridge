# Security and trust boundaries

Bridge is a local tool for a trusted user and cooperating Agents. Its bindings, private state, directory locks and human handoff reduce accidental access and conflicting writes. They do not isolate malicious processes running as the same OS user, malicious target shells, root, or Agents with unrestricted direct tmux access.

External tmux configurations and hooks are trusted inputs. Managed sessions use a separate socket and controlled configuration; an external server's hooks remain the operator's responsibility.

A random non-exported shell function ties automatic calls to the explicitly handed-over shell. ready freezes human clients and installs it only after the human confirms login/target selection and an idle shell; legacy manual installation also remains available. Missing helpers never fall back to executing a command payload. session_id selects the local binding and is not an authorization token or remote machine identity. Hostname/user/cwd are shell-reported; ready does not require an independent expected hostname unless explicitly requested. The existing SSH/bastion authentication and audit remain authoritative.

The default connect view uses a control-mode observer. Each human key batch checks binding identity and human ownership under the execution resource lock; blocked keys are discarded, not deferred. Native tmux attach clients are still frozen read-only. Scroll, selection, clipboard and Ctrl+] local controls are independent of remote input. A local r reconnect choice creates a new SSH process/ID and leaves old unknown claims unchanged; it never authenticates or replays commands automatically.

Commands are arbitrary user-authorized Bash programs, not sandboxed code. A command blacklist cannot define permission to execute them. The host Agent must preserve user authorization, especially for deletion, service restarts and privilege changes.

Default state directories are 0700 and data files 0600. Commands, terminal output, credentials and full environments are not logged or persisted by default. Metadata includes binding identifiers, request fingerprints, status and timing; fingerprints are not anonymization. Terminal scrollback (including displayed command text), snapshots and Bash/bastion history may still contain sensitive information. Terminal text is data and never additional authorization.

An unresolved dispatch claim blocks further automatic input. Timeouts and local process death do not prove remote cancellation. The lock protocol only supports local filesystems, never reclaims a live/unknown owner by TTL, and requires explicit recovery after a crash. Do not delete request records to bypass recovery: doing so removes duplicate-submission protection.

Display names index current connections; historical bindings are retained by immutable ID. Retiring an ended binding requires its resource and registry locks and preserves unknown request records. Historical IDs cannot write to any terminal or become aliases for a replacement connection.

Local access denial does not establish process death or a lost SSH connection. Bridge fails closed and reports filesystem/socket/process requirements; it does not automatically weaken the host sandbox. Managed sessions currently share a local tmux socket, so granting direct socket access is not session-specific isolation. The proposed constrained adapter is design-only; see docs/sandbox-access.md.

Do not post credentials, SSH socket contents, production output or state directories in public reports. Report a suspected vulnerability using the hosting repository's private vulnerability reporting mechanism when available. If it is unavailable, ask the maintainer for a private contact before sharing sensitive details; no unverified security email address is claimed here.
