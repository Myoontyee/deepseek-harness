/** Shell-owned notices survive closing a file tab. */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { IconCopyOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'

/** One transient file-operation notice. */
export interface FileNoticeState { text: string; seq: number }
/** Injected shell notification state and dismissal. */
export interface FileNoticeInjected {
  hooks: { fileNotice: ObservableSnapshot<FileNoticeState> }
  dismissNotice(): void
}
/** Display the latest explicit file-operation outcome. */
export function FileNotice({ useFileNotice, dismissNotice }: InjectFace<FileNoticeInjected>) {
  const state = useFileNotice(value => value)
  return state.text === '' ? null : <Toast key={state.seq} text={state.text} icon={<IconCopyOutlineRegular />} onDone={dismissNotice} />
}
