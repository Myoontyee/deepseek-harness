/** Device connections are the default; SSH configuration remains independently accessible. */
import { useState } from 'react'
import { SegmentedTabs } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { ConnectionsPage, type ConnectionProps } from './ConnectionsPage.tsx'
import { DevicesPage } from './DevicesPage.tsx'
import type { DeviceActions } from './devices.ts'
import css from './devices.module.css'

/** @param props - Native devices and SSH settings with their framework hooks. @returns Connection settings tabs. */
export function ConnectionCenter(props: ConnectionProps & InjectFace<DeviceActions>) {
  const [tab, setTab] = useState<'devices' | 'ssh'>(props.devicesAvailable ? 'devices' : 'ssh')
  const { t } = props
  return <section className={css.center}>
    {props.devicesAvailable && <SegmentedTabs className={css.tabs} label={t('nav')} value={tab} onChange={setTab} items={[
      { value: 'devices', label: t('devices.tab'), id: 'connections-devices', panelId: 'connections-devices-panel' },
      { value: 'ssh', label: t('ssh.tab'), id: 'connections-ssh', panelId: 'connections-ssh-panel' },
    ]} />}
    <div role="tabpanel" id={`connections-${tab}-panel`} aria-labelledby={`connections-${tab}`}>
      {tab === 'devices' ? <DevicesPage {...props} /> : <ConnectionsPage {...props} devicesAvailable={false} />}
    </div>
  </section>
}
