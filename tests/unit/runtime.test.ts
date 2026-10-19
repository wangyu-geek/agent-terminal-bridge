import { expect, test } from "bun:test"
import pkg from "../../package.json"
import { requireBun } from "../../src/runtime.ts"

test("the CI baseline and compatible patch releases satisfy the runtime policy", () => {
  const baseline = pkg.packageManager.replace("bun@", "")
  for (const version of [baseline, "1.4.3"])
    expect(() => requireBun(version)).not.toThrow()
  expect(() => requireBun()).not.toThrow()
})

test("unsupported runtimes are refused as a missing dependency", () => {
  for (const version of ["1.4.1", "2.0.0"]) {
    try {
      requireBun(version)
      throw new Error("Expected runtime refusal")
    } catch (error) {
      expect(error).toMatchObject({
        code: "DEPENDENCY_MISSING",
        exitCode: 3,
      })
    }
  }
})
