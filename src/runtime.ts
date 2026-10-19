import pkg from "../package.json"
import { requireValue } from "./errors.ts"

export function requireBun(version = Bun.version): void {
  requireValue(
    Bun.semver.satisfies(version, pkg.engines.bun),
    "DEPENDENCY_MISSING",
    `Bun ${pkg.engines.bun} is required (found ${version})`,
    3,
  )
}
