import { requireValue } from "./errors.ts"
import template from "./shell.bash" with { type: "text" }

export function shellInitialization(nonce: string): string {
  requireValue(
    /^[a-f0-9]{32}$/.test(nonce),
    "INVALID_INPUT",
    "Invalid initialization nonce",
  )
  return template.replaceAll("__ATB_NONCE__", nonce)
}
