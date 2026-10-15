/** Dictation adapter that cannot write into the message composer. */
import { useRef } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { VoiceInput, type VoiceInputInjected } from './VoiceInput.tsx'
import { NS } from './locales.ts'

type Props = Pick<PropsRuntime<'conversation.annotation.voice'>, 'identity' | 'value' | 'onChange'> & PropsLocale<typeof NS> & InjectFace<VoiceInputInjected>
const activity = (): void => {}

/** @param props - Comment owner and existing speech provider. @returns The shared microphone targeting the comment. */
export function AnnotationVoiceInput(props: Props) {
  const latest = useRef(props)
  latest.current = props
  return <VoiceInput<string> {...props} sessionId={props.identity} locked={false} onActiveChange={activity}
    inputActions={{ captureInsertion: () => latest.current.value, insertText: (text, captured) => {
      if (latest.current.value !== captured) return false
      latest.current.onChange(captured + (captured && !/\s$/u.test(captured) ? ' ' : '') + text)
      return true
    } }} />
}
