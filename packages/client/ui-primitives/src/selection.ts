// Selection helpers shared by context-menu owners: a right-click over a
// non-empty browser selection shows selection actions instead of the target's
// own menu (Codex behavior). Cordis-free, like the rest of this package.

/** Whether the page currently holds a non-empty text selection. */
export function hasActiveSelection(): boolean {
  const selection = window.getSelection()
  return selection !== null && selection.toString().trim() !== ''
}
