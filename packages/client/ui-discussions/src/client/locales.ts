/** User-facing copy for persistent discussions and assistant templates. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Chinese dictionary and key owner. */
export const zh = {
  modelsFailed: '模型加载失败，请重试', modelsEmpty: '暂无可用模型，请先在设置中接入模型',
  model: '回答模型', chooseModel: '请选择模型', unavailable: '暂不可用', avatar: '助手头像', uploadAvatar: '上传头像（PNG / JPEG / WebP，最大 2 MB）',
  showModel: '回复时显示模型名称', mentionHint: '在对话中输入 @ 并选择助手，它会读取当前对话上下文并使用此模型回答。每条消息选择一个助手。',
  copy: '复制', copied: '已复制', footnotes: '脚注',
  board: '讨论区', assistants: '常驻助手', create: '新建讨论', title: '讨论标题', quote: '引用原文',
  choose: '选择助手', empty: '暂无讨论。新建一个话题，记录会保留，关闭侧栏不会删除。',
  noAssistant: '请先在设置 → 常驻助手中新建一个助手。', refresh: '刷新', back: '返回话题列表',
  open: '讨论中', resolved: '已解决', archived: '已归档', reopen: '重新打开', archive: '归档', resolve: '标记解决',
  return: '带回主对话草稿', conclusion: '填写要带回主对话的结论', returned: '已加入主对话草稿，尚未发送。',
  source: '返回主对话', name: '助手名称', duties: '职责与偏好', template: '标准模板',
  temporary: '临时助手', project: '项目助手', resident: '常驻助手',
  off: '不跨任务记忆', projectMemory: '只读取当前项目记忆', assistantMemory: '读取助手记忆及当前项目记忆',
  memoryPolicy: '记忆范围', save: '保存', addAssistant: '添加助手', newAssistant: '新建助手',
  memory: '已确认的记忆', memoryText: '写入明确、可核实的偏好或事实', remember: '保存记忆', forget: '删除记忆',
  scope: '记忆适用范围', global: '此助手的全部任务', projectOnly: '指定项目', projectPath: '项目绝对路径',
  hint: '身份和讨论记录长期保存；常驻不等于后台运行。只有发送消息才调用模型。记忆仅由你明确保存，可关闭或删除。',
  editMemory: '编辑记忆', cancelEdit: '取消编辑',
  loading: '正在加载…', saving: '正在保存…', failed: '操作失败：{message}',
}
/** English dictionary. */
export const en: Record<keyof typeof zh, string> = {
  modelsFailed: 'Model loading failed. Retry.', modelsEmpty: 'No models available. Configure a model in Settings.',
  model: 'Reply model', chooseModel: 'Choose a model', unavailable: 'Unavailable', avatar: 'Assistant avatar', uploadAvatar: 'Upload avatar (PNG / JPEG / WebP, up to 2 MB)',
  showModel: 'Show model name on replies', mentionHint: 'Type @ in a conversation and select this assistant to reply using this model and the current conversation context. Select one assistant per message.',
  copy: 'Copy', copied: 'Copied', footnotes: 'Footnotes',
  board: 'Discussions', assistants: 'Saved assistants', create: 'New discussion', title: 'Topic title', quote: 'Source quotation',
  choose: 'Choose assistant', empty: 'No discussions yet. Closing the sidebar does not delete saved topics.',
  noAssistant: 'Create an assistant in Settings → Saved assistants first.', refresh: 'Refresh', back: 'Back to topics',
  open: 'Open', resolved: 'Resolved', archived: 'Archived', reopen: 'Reopen', archive: 'Archive', resolve: 'Mark resolved',
  return: 'Add to parent draft', conclusion: 'Write the conclusion to return to the parent', returned: 'Added to the parent draft, not sent.',
  source: 'Open parent conversation', name: 'Assistant name', duties: 'Responsibilities and preferences', template: 'Template',
  temporary: 'Temporary assistant', project: 'Project assistant', resident: 'Resident assistant',
  off: 'No cross-task memory', projectMemory: 'Current project memory only', assistantMemory: 'Assistant and current project memory',
  memoryPolicy: 'Memory scope', save: 'Save', addAssistant: 'Add assistant', newAssistant: 'New assistant',
  memory: 'Confirmed memories', memoryText: 'Write explicit, verifiable preferences or facts', remember: 'Save memory', forget: 'Delete memory',
  scope: 'Applies to', global: 'All tasks for this assistant', projectOnly: 'Specific project', projectPath: 'Absolute project path',
  hint: 'Identities and discussions persist; resident assistants do not run in the background. Models run only when you send. Memories are explicitly saved and can be disabled or deleted.',
  editMemory: 'Edit memory', cancelEdit: 'Cancel editing',
  loading: 'Loading…', saving: 'Saving…', failed: 'Operation failed: {message}',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'discussions': keyof typeof zh }
}
