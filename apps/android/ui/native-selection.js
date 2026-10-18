/* Runs inside either trusted chat page; selections and quotations never enter native code. */
(() => {
  if (window.dshNativeAnnotate) return
  let passage = null, pending = null
  const element = node => node instanceof Element ? node : node?.parentElement
  const remember = () => {
    const selection = getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return
    const range = selection.getRangeAt(0)
    if (element(range.startContainer)?.closest('input,textarea,[contenteditable="true"],[role="dialog"],dialog')
      || element(range.endContainer)?.closest('input,textarea,[contenteditable="true"],[role="dialog"],dialog')) { passage = null; return }
    passage = range.cloneRange()
  }
  document.addEventListener('selectionchange', remember)
  document.addEventListener('pointerdown', () => { passage = null })
  window.dshNativeAnnotate = () => {
    remember()
    const range = passage
    if (!range || !range.commonAncestorContainer.isConnected || !range.toString().trim()) return false
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range)
    const event = new CustomEvent('dsh:annotate-selection', { cancelable: true })
    if (!document.dispatchEvent(event)) return true
    // Existing Desktop versions expose their selection actions after pointerup.
    // Observe the actual menu mount instead of guessing how many animation frames it takes.
    pending?.()
    let observer, timeout
    const stop = () => { observer.disconnect(); clearTimeout(timeout); pending = null }
    const choose = () => {
      const action = Array.from(document.querySelectorAll('button[role="menuitem"]'))
        .find(button => !button.disabled && /^(添加注释|添加批注|Add annotation|Add comment)$/i.test(button.textContent.trim()))
      if (!action) return false
      stop(); action.click(); return true
    }
    observer = new MutationObserver(choose)
    pending = stop
    observer.observe(document.body, { childList: true, subtree: true })
    timeout = setTimeout(() => {
      stop()
      const warning = document.createElement('div'); warning.setAttribute('role', 'alert')
      warning.textContent = '此处暂未打开批注，请重新选中对话或文件正文。'
      warning.style.cssText = 'position:fixed;bottom:16px;left:12px;right:12px;padding:12px;background:#fff5d6;color:#795500;border-radius:12px;z-index:2147483647;font:14px system-ui'
      document.body.append(warning); setTimeout(() => warning.remove(), 5000)
    }, 5000)
    element(range.startContainer)?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }))
    choose()
    return true
  }
})()
