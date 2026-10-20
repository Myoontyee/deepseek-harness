/** Read-only Phase-0 surface for cross-device plugin synchronization. */
export * from './types.ts'
export { DEVICE_SYNC_FLAG, deviceSyncEnabled } from './feature.ts'
export { inventoryProfile, formatInventory, type InventoryOptions } from './inventory.ts'
export { diffInventories, formatDiff } from './diff.ts'
