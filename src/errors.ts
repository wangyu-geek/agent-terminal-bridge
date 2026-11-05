import type { Message } from "./i18n.ts"

export class BridgeError extends Error {
  readonly userMessage: string | Message
  constructor(
    readonly code: string,
    message: string | Message,
    readonly exitCode = 8,
    readonly retryable = false,
    readonly executionState: "not_started" | "unknown" = "not_started",
  ) {
    super(String(message))
    this.userMessage = message
    this.name = "BridgeError"
  }
}

export function ioError(
  error: unknown,
  message: string | Message,
): BridgeError {
  if (error instanceof BridgeError) return error
  if (accessDenied(error))
    return new BridgeError("LOCAL_ACCESS_DENIED", message, 5)
  return new BridgeError("STATE_ERROR", message)
}

export function accessDenied(error: unknown): boolean {
  return (
    hasCode(error, "EACCES") ||
    hasCode(error, "EPERM") ||
    (error instanceof Error && deniedDiagnostic(error.message))
  )
}

export function deniedDiagnostic(text: string): boolean {
  return /Operation not permitted|Permission denied|EACCES|EPERM/i.test(text)
}

export function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code
}

export function requireValue(
  condition: unknown,
  code: string,
  message: string | Message,
  exitCode = 2,
): asserts condition {
  if (!condition) throw new BridgeError(code, message, exitCode)
}
