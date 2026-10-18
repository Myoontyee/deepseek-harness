/** Device-neutral approval copy shared by phone and computer requests. */
const labels = {
  en: {
    title: 'Device connection request',
    message: (name: string) => `Allow “${name}” to access DSH on this computer?`,
    detail: 'This device can read conversations, send and stop tasks, and respond to tool confirmations. Approve once to retain its authorization. Revoke it from App → Phone control.',
    switching: '\nThis switches the gateway to Tailscale and disconnects existing LAN device connections.',
    allow: 'Allow', reject: 'Reject',
  },
  zh: {
    title: '设备连接授权',
    message: (name: string) => `允许“${name}”访问此电脑上的 DSH？`,
    detail: '此设备可以查看对话、发送或停止任务、处理工具确认。首次批准后会保存设备授权；可在“应用 → 手机控制”撤销。',
    switching: '\n允许后会切换到 Tailscale，现有局域网设备连接将断开。',
    allow: '允许', reject: '拒绝',
  },
} as const
/**
 * Select the native approval language without classifying every peer as a phone.
 * @param language - Desktop's application locale.
 * @returns Typed approval labels and formatter.
 */
export function deviceApprovalCopy(language: string): typeof labels.en | typeof labels.zh {
  return language.toLowerCase().startsWith('zh') ? labels.zh : labels.en
}
