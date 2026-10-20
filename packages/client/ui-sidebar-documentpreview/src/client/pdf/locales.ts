import { zoomEn, zoomZh } from '../zoom/locales.ts'

/** Copy owned by the PDF renderer. */
export const zh = {
  ...zoomZh,
  title: 'PDF',
  pageImage: 'PDF 第 {page} 页',
  loading: '文档渲染中...',
  rendering: '正在绘制页面…',
  failed: '无法显示 PDF：{message}',
  password: '此 PDF 需要密码，暂不支持预览',
  workerFailed: 'PDF 渲染进程无法继续，请重试',
  unsupported: 'PDF 预览需要完整文件内容',
  retry: '重试',
  outline: '目录 / 大纲',
  outlineLoading: '正在读取目录…',
  outlineEmpty: '此 PDF 未内嵌目录 / 书签',
  outlineFailed: '无法读取目录，请重试',
  outlineNavigationFailed: '无法跳转到此章节，请选择其他章节或用默认应用打开',
  outlineUntitled: '未命名章节',
} satisfies Record<string, string>

/** PDF translation keys shared by both dictionaries. */
export type PdfLocaleKey = keyof typeof zh

/** English PDF-renderer dictionary. */
export const en = {
  ...zoomEn,
  title: 'PDF',
  pageImage: 'PDF page {page}',
  loading: 'Rendering document...',
  rendering: 'Rendering page…',
  failed: 'Cannot display PDF: {message}',
  password: 'This PDF requires a password; password-protected previews are not supported.',
  workerFailed: 'The PDF rendering process could not continue. Please retry.',
  unsupported: 'PDF preview requires the complete file contents.',
  retry: 'Retry',
  outline: 'Contents / Outline',
  outlineLoading: 'Reading outline…',
  outlineEmpty: 'This PDF has no embedded outline or bookmarks.',
  outlineFailed: 'Could not read the outline. Try again.',
  outlineNavigationFailed: 'Could not navigate to this chapter. Choose another chapter or open in the default application.',
  outlineUntitled: 'Untitled chapter',
} satisfies Record<PdfLocaleKey, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** PDF page, loading, and failure messages. */
    sidebarPdf: PdfLocaleKey
  }
}
