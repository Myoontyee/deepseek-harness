// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DEVICE_SYNC_FLAG, deviceSyncEnabled } from '../src/feature.ts'

describe('device-sync feature flag', () => {
  it('is disabled unless explicitly enabled', () => {
    expect(deviceSyncEnabled({})).toBe(false)
    expect(deviceSyncEnabled({ [DEVICE_SYNC_FLAG]: '0' })).toBe(false)
    expect(deviceSyncEnabled({ [DEVICE_SYNC_FLAG]: '1' })).toBe(true)
  })
})
