import { BridgeError, requireValue } from "./errors.ts"

export function object(value: unknown, name: string): Record<string, unknown> {
  requireValue(
    value !== null && typeof value === "object" && !Array.isArray(value),
    "INVALID_INPUT",
    `${name} must be an object`,
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
      `Unknown ${name} field: ${key}`,
    )
  }
}

export function string(value: unknown, name: string, max = 4096): string {
  requireValue(
    typeof value === "string" &&
      Buffer.byteLength(value) <= max &&
      !value.includes("\0"),
    "INVALID_INPUT",
    `${name} must be a bounded string`,
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
    `${name} is outside its integer range`,
  )
  return value
}

export function boolean(value: unknown, name: string): boolean {
  requireValue(
    typeof value === "boolean",
    "INVALID_INPUT",
    `${name} must be boolean`,
  )
  return value
}

export function choice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  name: string,
): T[number] {
  const result = string(value, name)
  requireValue(choices.includes(result), "INVALID_INPUT", `Invalid ${name}`)
  return result
}

export function strings(value: unknown, name: string): string[] {
  requireValue(
    Array.isArray(value) && value.length <= 32,
    "INVALID_INPUT",
    `${name} must be an array`,
  )
  return value.map((item) => string(item, name, 128))
}

export function alias(value: string): string {
  requireValue(
    /^[A-Za-z0-9_-]{1,64}$/.test(value),
    "INVALID_INPUT",
    "Session alias must contain 1–64 ASCII letters, digits, underscores or hyphens",
  )
  return value
}

export function requestId(value: string): string {
  requireValue(
    /^[A-Za-z0-9._-]{1,128}$/.test(value),
    "INVALID_INPUT",
    "Invalid request ID",
  )
  return value
}

export function parseJson(text: string, name: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new BridgeError("INVALID_INPUT", `${name} is not valid JSON`, 2)
  }
}
