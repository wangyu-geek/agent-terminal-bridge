import { en } from "./locales/en.ts"
import { zhCN } from "./locales/zh-CN.ts"

export const LANGUAGE_SETTINGS = ["auto", "en", "zh-CN"] as const
export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number]
export type Language = Exclude<LanguageSetting, "auto">
export type MessageKey = keyof typeof en
type Placeholders<Text extends string> =
  Text extends `${string}{${infer Name}}${infer Rest}`
    ? Name | Placeholders<Rest>
    : never
type Arguments<Key extends MessageKey> = [
  Placeholders<(typeof en)[Key]>,
] extends [never]
  ? []
  : [params: Record<Placeholders<(typeof en)[Key]>, string | number>]

// Internal message metadata never changes the machine-facing English string.
// JSON.stringify also uses this representation for messages nested in results.
export class Message {
  constructor(
    readonly key: MessageKey,
    readonly params: Readonly<Record<string, string | number>>,
  ) {}

  format(language: Language): string {
    const template = language === "zh-CN" ? zhCN[this.key] : en[this.key]
    return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
      String(this.params[name] ?? placeholder),
    )
  }

  toString(): string {
    return this.format("en")
  }

  toJSON(): string {
    return this.toString()
  }
}

export function msg<Key extends MessageKey>(
  key: Key,
  ...args: Arguments<Key>
): Message {
  return new Message(key, args[0] ?? {})
}

export function createI18n(language: Language) {
  return {
    language,
    text(value: unknown): string {
      return value instanceof Message ? value.format(language) : String(value)
    },
    t<Key extends MessageKey>(key: Key, ...args: Arguments<Key>): string {
      return msg(key, ...args).format(language)
    },
  }
}
export type I18n = ReturnType<typeof createI18n>

export function detectLanguage(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Language {
  const locale = (env.LC_ALL || env.LC_MESSAGES || env.LANG || "")
    .split(/[.@]/)[0]
    ?.replaceAll("_", "-")
    .toLowerCase()
  return locale === "zh" || locale?.startsWith("zh-") ? "zh-CN" : "en"
}

export function resolveLanguage(
  setting: LanguageSetting = "auto",
  env: Readonly<Record<string, string | undefined>> = process.env,
): Language {
  return setting === "auto" ? detectLanguage(env) : setting
}
