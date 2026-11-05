export async function copySessionId(
  sessionId: string,
  options: {
    platform?: NodeJS.Platform
    env?: Record<string, string | undefined>
  } = {},
): Promise<boolean> {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const commands: string[][] = []
  if (platform === "darwin") commands.push(["pbcopy"])
  else if (platform === "linux") {
    if (env.WAYLAND_DISPLAY) commands.push(["wl-copy", "--type", "text/plain"])
    if (env.DISPLAY)
      commands.push(
        ["xclip", "-selection", "clipboard"],
        ["xsel", "--clipboard", "--input"],
      )
  }
  for (const command of commands) {
    try {
      const child = Bun.spawn(command, {
        env,
        stdin: Buffer.from(`session_id=${sessionId}`),
        stdout: "ignore",
        stderr: "ignore",
        timeout: 1000,
        killSignal: "SIGKILL",
      })
      if ((await child.exited) === 0) return true
    } catch {
      // Missing tools or desktop access must not prevent opening the terminal.
    }
  }
  return false
}
