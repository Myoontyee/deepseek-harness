/** User-owned colors for independent official and custom notifications. */
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopUpdateView, UpdateIndicatorColors, UpdateIndicatorColor } from '../types.ts'
import css from './DesktopUpdateIndicator.module.css'

export interface UpdateChannelSettingsInjected {
  hooks: { desktopUpdate: HostObservable<DesktopUpdateView> }
  setColors: (colors: UpdateIndicatorColors) => void
  openUpdate: (channel: 'custom' | 'official') => void
}
/** @param props - Shared update state and local color preferences. @returns Desktop custom-channel settings. */
export function UpdateChannelSettings({ useDesktopUpdate, setColors, openUpdate, t }:
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings'> & InjectFace<UpdateChannelSettingsInjected>) {
  const view = useDesktopUpdate(value => value)
  if (!view.presentation?.custom) return null
  const colors = view.colors ?? { custom: 'blue', official: 'green' }
  const choices: UpdateIndicatorColor[] = ['blue', 'green', 'orange', 'purple']
  return <section className={css.settings}>
    <h3>{t('desktop.channel.settings')}</h3><p>{t('desktop.channel.hint')}</p>
    {(['official', 'custom'] as const).map(channel => <div className={css.settingsRow} key={channel}>
      <label>{t(`desktop.channel.${channel}`)} <select aria-label={t(`desktop.channel.${channel}`)} value={colors[channel]}
        onChange={(event) => { const color = choices.find(choice => choice === event.target.value)
          if (color) setColors({ ...colors, [channel]: color }) }}>
        {choices.map(color => <option key={color} value={color}>{t(`desktop.channel.${color}`)}</option>)}
      </select></label>
      <span data-color={colors[channel]} className={css.indicator} aria-hidden="true"><span className={channel === 'official' ? css.officialDot : css.errorDot} /></span>
      <button type="button" onClick={() => { openUpdate(channel) }}>{t('desktop.channel.check')}</button>
    </div>)}
  </section>
}
