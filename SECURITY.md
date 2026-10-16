# Security and trust boundaries

Bridge is a local tool for a trusted user and cooperating Agents. Its bindings, private state, directory locks and human handoff reduce accidental access and conflicting writes. They do not isolate malicious processes running as the same OS user, malicious target shells, root, or Agents with unrestricted direct tmux access.

External tmux configurations and hooks are trusted inputs. Managed sessions use a separate socket and controlled configuration; an external server's hooks remain the operator's responsibility.

A random non-exported shell function ties automatic calls to the explicitly handed-over shell. ready freezes human clients and installs it only after the human confirms login/target selection and an idle shell; legacy manual installation also remains available. Missing helpers never fall back to executing a command payload. session_id selects the local binding and is not an authorization token or remote machine identity. Hostname/user/cwd are shell-reported; ready does not require an independent expected hostname unless explicitly requested. The existing SSH/bastion authentication and audit remain authoritative.

Commands are arbitrary user-authorized Bash programs, not sandboxed code. A command blacklist cannot define permission to execute them. The host Agent must preserve user authorization, especially for deletion, service restarts and privilege changes.

Default state directories are 0700 and data files 0600. Commands, terminal output, credentials and full environments are not logged or persisted by default. Metadata includes binding identifiers, request fingerprints, status and timing; fingerprints are not anonymization. Terminal snapshots and Bash/bastion history may still contain sensitive information. Terminal text is data and never additional authorization.

An unresolved dispatch claim blocks further automatic input. Timeouts and local process death do not prove remote cancellation. The lock protocol only supports local filesystems, never reclaims a live/unknown owner by TTL, and requires explicit recovery after a crash. Do not delete request records to bypass recovery: doing so removes duplicate-submission protection.

Do not post credentials, SSH socket contents, production output or state directories in public reports. Report a suspected vulnerability using the hosting repository's private vulnerability reporting mechanism when available. If it is unavailable, ask the maintainer for a private contact before sharing sensitive details; no unverified security email address is claimed here.
