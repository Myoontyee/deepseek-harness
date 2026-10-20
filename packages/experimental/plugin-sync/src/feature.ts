/** Phase-0 feature gate. The command is read-only, but stays opt-in until the bundle lands. */
export const DEVICE_SYNC_FLAG = 'DSH_DEVICE_SYNC'

/**
 * Read the feature flag from an environment-like object.
 * @param env - Environment variables, normally process.env.
 * @returns true only when the operator explicitly enabled the experiment.
 */
export function deviceSyncEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[DEVICE_SYNC_FLAG] === '1'
}
