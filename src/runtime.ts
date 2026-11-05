import pkg from "../package.json"
import { requireValue } from "./errors.ts"
import { msg } from "./i18n.ts"

export function requireBun(version = Bun.version): void {
  requireValue(
    Bun.semver.satisfies(version, pkg.engines.bun),
    "DEPENDENCY_MISSING",
    msg("error.bun_is_required_found", { bun: pkg.engines.bun, version }),
    3,
  )
}
