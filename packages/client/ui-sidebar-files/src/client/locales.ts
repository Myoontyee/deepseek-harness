/**
 * `sidebarFiles` namespace dictionaries, and the namespace's declaration.
 *
 * The failure lines name what the tree could not list, one code each, because a
 * directory that is gone, one outside the workspace, and a path that is not a
 * directory each suggest a different next step.
 *
 * The namespace merge lives with its key set so that any module naming
 * `TranslateNS<'sidebarFiles'>` or `PropsLocale<'sidebarFiles'>` needs only this
 * file, whichever entry a program loads first.
 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** File-tree type name, guide entry, row states, and failure lines. */
    sidebarFiles: SidebarFilesKey
  }
}

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  'files.copyFailed': '无法写入剪贴板，请聚焦窗口后再试。',
  'files.exists': '目标已存在，请换一个名称；原文件未被覆盖。',
  'files.localOnly': '此文件操作目前仅支持本地工作区。',
  'files.new-file': '新建文件…',
  'files.new-folder': '新建文件夹…',
  'files.open': '在预览中打开',
  'files.reveal': '在文件资源管理器中显示',
  'files.terminal': '在集成终端中打开',
  'files.search': '在文件夹中查找…',
  'files.add': '添加到对话',
  'files.cut': '剪切',
  'files.copy': '复制',
  'files.paste': '粘贴…',
  'files.copy-path': '复制绝对路径',
  'files.copy-relative': '复制相对路径',
  'files.copy-name': '复制文件名',
  'files.rename': '重命名…',
  'files.trash': '移到回收站',
  'files.locate': '在文件树中定位',
  'files.copyMenu': '复制路径选项',
  'files.cancel': '取消',
  'files.confirm': '确定',
  'files.name': '名称',
  'files.query': '查找内容',
  'files.searchContent': '搜索文件内容',
  'files.noResults': '没有匹配结果',
  'files.copied': '已复制',
  'files.done': '操作完成',
  'files.invalidName': '请输入有效名称，不要包含路径分隔符或末尾空格。',
  'files.noOverwrite': '可以修改粘贴后的名称；已有文件不会被覆盖。',
  'files.trashHint': '将此项移到系统回收站，可在回收站中恢复。',
  'shortcut.noSession': '请先选择会话',
  'type.label': '文件',
  'guide.title': '工作区文件',
  'guide.description': '浏览会话工作区的文件',
  loading: '正在读取…',
  empty: '空目录',
  truncated: '条目太多，只显示了一部分。',
  noWorkspace: '这个会话没有工作区目录。',
  reload: '重新读取',
  autoRefresh: '自动刷新',
  'autoRefresh.enable': '开启自动刷新',
  'autoRefresh.disable': '关闭自动刷新',
  'entry.other': '这不是文件或目录，没法打开。',
  'error.notFound': '这个目录不在了。可能已被移动或删除。',
  'error.outsideWorkspace': '这个目录在工作区之外，侧栏不会读取它。',
  'error.notDirectory': '这不是一个目录。',
  'error.unavailable': '读取失败：{message}',
} satisfies Record<string, string>

/** Files dictionary key union. */
export type SidebarFilesKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  'files.copyFailed': 'Cannot write to the clipboard. Focus this window and try again.',
  'files.exists': 'The destination exists. Choose another name; the existing file was not overwritten.',
  'files.localOnly': 'This file operation currently requires a local workspace.',
  'files.new-file': 'New file…',
  'files.new-folder': 'New folder…',
  'files.open': 'Open preview',
  'files.reveal': 'Reveal in file manager',
  'files.terminal': 'Open in integrated terminal',
  'files.search': 'Find in folder…',
  'files.add': 'Add to conversation',
  'files.cut': 'Cut',
  'files.copy': 'Copy',
  'files.paste': 'Paste…',
  'files.copy-path': 'Copy absolute path',
  'files.copy-relative': 'Copy relative path',
  'files.copy-name': 'Copy filename',
  'files.rename': 'Rename…',
  'files.trash': 'Move to trash',
  'files.locate': 'Locate in file tree',
  'files.copyMenu': 'Copy path options',
  'files.cancel': 'Cancel',
  'files.confirm': 'Confirm',
  'files.name': 'Name',
  'files.query': 'Search query',
  'files.searchContent': 'Search file contents',
  'files.noResults': 'No matching results',
  'files.copied': 'Copied',
  'files.done': 'Done',
  'files.invalidName': 'Enter a valid name without path separators or trailing spaces.',
  'files.noOverwrite': 'Choose a destination name. Existing files will not be overwritten.',
  'files.trashHint': 'Move this item to the system trash, where it can be restored.',
  'shortcut.noSession': 'Select a session first',
  'type.label': 'Files',
  'guide.title': 'Workspace files',
  'guide.description': 'Browse files in this session\'s workspace',
  loading: 'Reading…',
  empty: 'Empty directory',
  truncated: 'Too many entries, showing only some of them.',
  noWorkspace: 'This session has no workspace directory.',
  reload: 'Reload',
  autoRefresh: 'Auto refresh',
  'autoRefresh.enable': 'Enable auto refresh',
  'autoRefresh.disable': 'Disable auto refresh',
  'entry.other': 'Not a file or a directory, so it cannot be opened.',
  'error.notFound': 'That directory is gone. It may have been moved or deleted.',
  'error.outsideWorkspace': 'That directory is outside the workspace, so the sidebar will not read it.',
  'error.notDirectory': 'That is not a directory.',
  'error.unavailable': 'Read failed: {message}',
} satisfies Record<SidebarFilesKey, string>
