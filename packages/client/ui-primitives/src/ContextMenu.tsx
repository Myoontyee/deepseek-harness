// ContextMenu: a right-click menu fixed at pointer coordinates. Wraps Menu's
// portal positioning and roving keyboard navigation behind a cursor-position
// API, so a render site only supplies {x, y, items, onSelect, onClose} — the
// exact shape a right-click handler already owns (clientX/clientY).
//
// The wrapper renders an empty anchor: the portaled list is placed from
// getAnchorRect (the pointer rect), never from the wrapper's own layout, so
// ContextMenu may sit anywhere in the tree.

import { useCallback } from 'react'
import { Menu } from './Menu.tsx'
import type { MenuEntry } from './Menu.tsx'

export interface ContextMenuProps {
  /** Whether the menu is open. */
  open: boolean
  /** Pointer x (client coordinates) the menu anchors to. */
  x: number
  /** Pointer y (client coordinates) the menu anchors to. */
  y: number
  /** Menu rows (see {@link MenuEntry}); separators/labels/disabled rows render but are not keyboard-navigable. */
  items: readonly MenuEntry[]
  /** Row activation (mouse click or keyboard Enter/Space). */
  onSelect: (id: string) => void
  /** Invoked on Escape, outside pointerdown, or Tab. */
  onClose: () => void
}

/** A zero-size synthetic rect at the pointer. */
function rectAt(x: number, y: number): DOMRect {
  return {
    x, y, left: x, top: y, right: x, bottom: y, width: 0, height: 0,
    toJSON: () => ({}),
  } as DOMRect
}

export function ContextMenu({ open, x, y, items, onSelect, onClose }: ContextMenuProps) {
  // Stable across renders while the pointer is unchanged, so Menu's placement
  // effect does not re-subscribe to scroll/resize on every parent render.
  const getAnchorRect = useCallback(() => rectAt(x, y), [x, y])
  return (
    <Menu
      open={open}
      anchor={<span aria-hidden />}
      items={items}
      onSelect={onSelect}
      onClose={onClose}
      portal
      keyboard
      getAnchorRect={getAnchorRect}
    />
  )
}
