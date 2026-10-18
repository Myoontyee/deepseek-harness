/** Mask recognized credentials before rendering or serializing a read-only transcript. */
import { CredentialScanner } from './credential-scanner.ts'
import { formatTables } from './format-tables.ts'

/** @returns A synchronous text masker with its own bounded scanner cache. */
export function createCredentialTextMask(): (text: string) => string {
  const scanner = new CredentialScanner(formatTables())
  return (text) => {
    let output = '', from = 0
    for (;;) {
      const match = scanner.match(text, from)
      if (!match) return output + text.slice(from)
      output += text.slice(from, match.start) + match.data.masked
      from = match.end
    }
  }
}
