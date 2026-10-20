/** Copy owned by the packaged phone connection surface. */
export const connectionCopy = {
  title: '连接', description: '在这里管理电脑；返回对话后，可从侧栏直接打开远程工作区',
  close: '返回对话', refresh: '刷新设备', login: '登录 Tailscale', account: '账号设置',
  advanced: '扫码与高级设置', auto: '打开应用自动连接', sync: '同步手机对话与批注',
  empty: '尚未发现电脑。登录 Tailscale 后会自动显示设备；首次连接需在电脑确认一次',
  connected: '已授权', offline: '离线', available: '可连接', unavailable: '电脑未开启 DSH 连接',
  open: '查看对话', pair: '连接', renew: '重新授权', waiting: '请在电脑确认连接',
  retry: '重试', refreshing: '正在刷新', notSignedIn: '尚未登录 Tailscale', online: '设备网络已连接',
  busy: '正在处理…', ready: '设备已保存，可从对话侧栏打开',
} as const
