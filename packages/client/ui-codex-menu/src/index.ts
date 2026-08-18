/**
 * ui-codex-menu host 面：注册「斜杠指令补全快捷键」设置项。
 * 右键菜单与 Tab 补全的全部逻辑在 client bundle 中。
 */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

export const name = 'dsh-client-ui-codex-menu'
export const inject = ['settings']

/** 设置命名空间。 */
export const CODEX_MENU_SETTINGS_NS = settingsNamespace('codex-menu')

export interface CodexMenuSettings {
  /** 斜杠指令补全触发键：Tab / Ctrl+Space / None（关闭）。 */
  completeShortcut: 'Tab' | 'Ctrl+Space' | 'None'
}

/** 设置页 schema。 */
export const CodexMenuSettingsSchema: z<CodexMenuSettings> = z.object({
  completeShortcut: z
    .union([z.const('Tab'), z.const('Ctrl+Space'), z.const('None')])
    .default('Tab'),
})

/** 注册设置项；其余功能由 client 面提供。 */
export function apply(ctx: Context): void {
  ctx.settings.register(CODEX_MENU_SETTINGS_NS, CodexMenuSettingsSchema, {
    base: { completeShortcut: 'Tab' },
  })
}
