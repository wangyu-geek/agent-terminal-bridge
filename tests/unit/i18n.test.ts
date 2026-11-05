import { expect, test } from "bun:test"
import { BridgeError } from "../../src/errors.ts"
import {
  createI18n,
  detectLanguage,
  msg,
  resolveLanguage,
} from "../../src/i18n.ts"
import { en } from "../../src/locales/en.ts"
import { zhCN } from "../../src/locales/zh-CN.ts"
import { humanResult } from "../../src/presentation.ts"

test("locale detection honors the first nonempty message locale and falls back to English", () => {
  for (const locale of [
    "zh",
    "zh_CN.UTF-8",
    "zh-SG",
    "zh-Hant-TW",
    "ZH_cn@variant",
  ])
    expect(detectLanguage({ LANG: locale })).toBe("zh-CN")
  for (const locale of [
    "C",
    "C.UTF-8",
    "POSIX",
    "en_US.UTF-8",
    "fr_FR",
    "invalid",
    "",
  ])
    expect(detectLanguage({ LANG: locale })).toBe("en")
  expect(
    detectLanguage({ LC_ALL: "C", LC_MESSAGES: "zh_CN", LANG: "zh_CN" }),
  ).toBe("en")
  expect(
    detectLanguage({ LC_ALL: "", LC_MESSAGES: "zh_CN", LANG: "en_US" }),
  ).toBe("zh-CN")
  expect(detectLanguage({ LC_MESSAGES: "fr_FR", LANG: "zh_CN" })).toBe("en")
  expect(detectLanguage({})).toBe("en")
})

test("manual settings override detection without changing the environment", () => {
  const env = { LC_ALL: "zh_CN.UTF-8", LANG: "C" }
  expect(resolveLanguage("en", env)).toBe("en")
  expect(resolveLanguage("zh-CN", { LC_ALL: "C" })).toBe("zh-CN")
  expect(resolveLanguage("auto", env)).toBe("zh-CN")
  expect(env).toEqual({ LC_ALL: "zh_CN.UTF-8", LANG: "C" })
})

test("both catalogs contain the same keys and named interpolation parameters", () => {
  const translated = new Map(Object.entries(zhCN))
  const placeholders = (value: string) =>
    [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
  expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort())
  for (const [key, value] of Object.entries(en)) {
    const target = translated.get(key)
    expect(target, key).toBeTruthy()
    expect(placeholders(target ?? ""), key).toEqual(placeholders(value))
  }
})

test("messages retain canonical English in errors and nested JSON", () => {
  const message = msg("error.option_is_not_accepted_for_this_command", {
    key: "pane",
  })
  const error = new BridgeError("INVALID_INPUT", message, 2)
  expect(error.message).toBe("Option --pane is not accepted for this command")
  expect(createI18n("zh-CN").text(error.userMessage)).toBe(
    "此命令不接受选项 --pane",
  )
  expect(JSON.parse(JSON.stringify({ next_action: { message } }))).toEqual({
    next_action: { message: "Option --pane is not accepted for this command" },
  })
  expect(createI18n("en").text(error.userMessage)).toBe(error.message)
})

test("human status translates local instructions while preserving IDs and target data", () => {
  const result = {
    session: "example",
    session_id: "0123456789abcdef0123456789abcdef",
    display_state: "awaiting_human",
    shell: { endpoint_label: "ready.example" },
    next_action: {
      message: msg("action.ready", { id: "0123456789abcdef0123456789abcdef" }),
    },
  }
  const chinese = humanResult(result, createI18n("zh-CN"))
  expect(chinese).toContain("等待 shell 交接与准备；未检查登录状态")
  expect(chinese).toContain("shell 准备尚未完成")
  expect(chinese).toContain("session_id=0123456789abcdef0123456789abcdef")
  expect(chinese).toContain("ready.example")
  expect(chinese).not.toContain("params:")
  expect(JSON.parse(JSON.stringify(result)).next_action.message).toContain(
    "Shell preparation has not completed",
  )
})

test("diagnostic messages translate recursively and remote output is preserved", () => {
  const view = humanResult(
    {
      local_environment: { platform: "darwin" },
      target_environment: { message: msg("doctor.no_probe") },
      local_access: { backend: { message: msg("doctor.backend") } },
    },
    createI18n("zh-CN"),
  )
  expect(view).toContain("未发送远端探针")
  expect(view).toContain("所需的本地 tmux 后端不可用")
  expect(view).not.toContain("doctor.backend")
  const remote = "State: ready\n[Local menu]\n中文 {command}\n"
  expect(humanResult({ terminal_output: remote }, createI18n("zh-CN"))).toBe(
    remote,
  )
})
