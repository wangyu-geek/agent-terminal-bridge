import { BridgeError, requireValue } from "./errors.ts"
import { msg } from "./i18n.ts"

export function object(value: unknown, name: string): Record<string, unknown> {
  requireValue(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "INVALID_INPUT",
    msg("error.must_be_an_object", { name }),
  )
  return value as Record<string, unknown>
}

export function keys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  name: string,
): void {
  for (const key of Object.keys(value)) {
    requireValue(
      allowed.includes(key),
      "INVALID_INPUT",
      msg("error.unknown_field", { name, key }),
    )
  }
}

export function string(value: unknown, name: string, max = 4096): string {
  requireValue(
    typeof value === "string" &&
      Buffer.byteLength(value) <= max &&
      !value.includes("\0"),
    "INVALID_INPUT",
    msg("error.must_be_a_bounded_string", { name }),
  )
  return value
}

export function integer(
  value: unknown,
  name: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  requireValue(
    typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= min &&
      value <= max,
    "INVALID_INPUT",
    msg("error.is_outside_its_integer_range", { name }),
  )
  return value
}

export function boolean(value: unknown, name: string): boolean {
  requireValue(
    typeof value === "boolean",
    "INVALID_INPUT",
    msg("error.must_be_boolean", { name }),
  )
  return value
}

export function choice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  name: string,
): T[number] {
  const result = string(value, name)
  requireValue(
    choices.includes(result),
    "INVALID_INPUT",
    msg("error.invalid", { name }),
  )
  return result
}

export function strings(value: unknown, name: string): string[] {
  requireValue(
    Array.isArray(value) && value.length <= 32,
    "INVALID_INPUT",
    msg("error.must_be_an_array", { name }),
  )
  return value.map((item) => string(item, name, 128))
}

export function alias(value: string): string {
  requireValue(
    /^[A-Za-z0-9_-]{1,64}$/.test(value),
    "INVALID_INPUT",
    msg(
      "error.session_alias_must_contain_1_64_ascii_letters_digits_underscores_or_hyphens",
    ),
  )
  return value
}

export function requestId(value: string): string {
  requireValue(
    /^[A-Za-z0-9._-]{1,128}$/.test(value),
    "INVALID_INPUT",
    msg("error.invalid_request_id"),
  )
  return value
}

export function parseJson(text: string, name: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new BridgeError(
      "INVALID_INPUT",
      msg("error.is_not_valid_json", { name }),
      2,
    )
  }
}
