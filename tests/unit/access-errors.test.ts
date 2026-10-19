import { expect, test } from "bun:test"
import { chmod } from "node:fs/promises"
import { join } from "node:path"
import { runProcess } from "../../src/process.ts"
import { privatePathError } from "../../src/security.ts"
import { Fixture } from "../helpers.ts"

test("local access errors preserve their cause without claiming process death", async () => {
  const f = await Fixture.create()
  try {
    const path = join(f.directory, "not-executable")
    await Bun.write(path, "#!/bin/sh\nexit 0\n")
    await chmod(path, 0o600)
    await expect(runProcess([path])).rejects.toMatchObject({
      code: "LOCAL_ACCESS_DENIED",
      exitCode: 5,
    })
    expect(
      privatePathError(Object.assign(new Error("denied"), { code: "EACCES" })),
    ).toMatchObject({ code: "LOCAL_ACCESS_DENIED", exitCode: 5 })
  } finally {
    await f.cleanup()
  }
})
