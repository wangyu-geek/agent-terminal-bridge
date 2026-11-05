import bootstrap from "./bootstrap.bash" with { type: "text" }
import { requireValue } from "./errors.ts"
import { msg } from "./i18n.ts"
import template from "./shell.bash" with { type: "text" }

export function shellInitialization(nonce: string): string {
  requireValue(
    /^[a-f0-9]{32}$/.test(nonce),
    "INVALID_INPUT",
    msg("error.invalid_initialization_nonce"),
  )
  return template.replaceAll("__ATB_NONCE__", nonce)
}

export function shellBootstrap(nonce: string, request: string): string {
  requireValue(
    /^[a-f0-9]{32}$/.test(nonce) && /^[a-f0-9]{32}$/.test(request),
    "INVALID_INPUT",
    msg("error.invalid_transfer_nonce"),
  )
  return bootstrap
    .replaceAll("__ATB_NONCE__", nonce)
    .replaceAll("__ATB_REQUEST__", request)
    .split("\n")
    .map((line) => line.trim())
    .join(" ")
    .trim()
}
