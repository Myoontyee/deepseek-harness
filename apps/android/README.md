# DeepSeek Harness Desktop for Android

English | [中文](README.zh.md)

A custom Android client with account-authenticated phone chat and optional computer access. This is not an official DeepSeek Android release. Android 8.0 or later and a recent Android System WebView are required. The application name and whale logo match Desktop.

## Chat and annotations

Sign in through DeepSeek's official browser authorization page. Phone chat uses the same account grant, model listing and Messages endpoint as Desktop; it does not require a paired computer or an API key. Choose the account model and thinking effort before sending. Only explicit messages invoke a model. This text-only chat does not execute Desktop tools or synchronize DeepSeek's cloud chat history.

The phone interface uses Desktop's theme colors and icon artwork. Conversation history opens on the left, Settings stays at its bottom, and the composer keeps model and thinking controls below the message field with Send on the right. Narrow screens overlay the history drawer; wider screens can keep it alongside chat. Keyboard resizing preserves the composer, while long formulas, code, tables and annotation quotations scroll within their own areas. Computer access remains under Settings.

Phone transcripts, partial replies, drafts and annotations are stored in account-scoped SQLite rows with gzip-compressed bodies. Long-press rendered text to add a source quotation and a separate comment. Markdown links, tables and original TeX formulas survive selection. Recognized credentials are masked before display, copy and annotation. Annotation drafts are saved automatically; Escape closes the editor without deleting the draft and Ctrl+Enter saves the annotation. Pending annotations become part of the visible, saved user message when sent.

Android's native text-selection menu offers Add annotation in phone chat and approved computer pages, including file previews. The page retains the quotation before Android closes its menu, then opens the comment editor. The existing floating selection action remains available. Quotations stay inside their page; remote pages receive no native message bridge.

## Optional computer access

1. Open Settings → Devices and conversations. Embedded Tailscale has its own app-private node and official browser login; an installed Tailscale VPN cannot share its private credentials. Device discovery runs here, not as a prerequisite for chat.
2. Online nodes are probed only for the DSH service. Choose an available computer and approve once there. The computer and DSH must remain running. Previously approved grants reconnect without QR or address entry. Once signed in inside DSH, the separate Android Tailscale app's switch is not required. Older grants with Tailnet IP addresses use the saved app-owned node; LAN grants retain direct access. QR invitations remain a backup for LAN connections.
3. Open phone history to choose remote conversations marked with a globe. The computer operator page has no extra native pairing toolbar. Android Back returns through its page history to phone chat. Long-press remote text and choose Add annotation to use the existing computer editor.
4. Phone transcripts and annotations synchronize to approved computers while the app is foregrounded. Desktop → Devices and conversations → Phone conversations provides read-only previews. Continue phone replies on the phone; computer tasks execute on that computer. Settings can disable phone synchronization. Offline computers receive retained changes on a later foreground sync.
5. Revoke a device in Desktop Phone control to terminate access and hide its phone mirrors. Clearing a phone grant does not revoke an offline computer's grant. Up to eight devices can be authorized by a computer.

Automatic connection is enabled in Settings by default. Opening or foregrounding the app restores its saved node and refreshes approved computer conversations; failed restoration retries with a bounded delay up to one minute while foregrounded. Remote pages rebuild their proxy after a failed connection instead of reusing a dead local port. Leaving the app stops the retry timer; explicitly signing out of embedded Tailscale pauses automatic restoration until the next sign-in. Expired or revoked authorization still requires sign-in or approval. System VPN diagnostics are optional and do not report the app-owned node's state.

## Trust and storage

Official account grants and computer grants use separate Android Keystore AES-GCM stores. The local chat WebView exposes a bounded native message bridge only to the packaged app-assets origin and main frame. Remote computer pages have no native bridge. Their requests require the approved certificate fingerprint and validity period; credentials are not sent across redirects. External links open in the browser without device cookies. Desktop keeps its internal Host cookie local and seals compressed phone mirrors with OS-backed encryption. Phone data is app-private and backup is disabled.

## Build and validation

Use JDK 17, SDK 35, Build Tools 35.0.0, Gradle 8.11.1, Go 1.27.1, NDK 28.2.13676358 and the repository's Node/pnpm dependencies. Build the local interface with `node apps/android/ui/build.mjs` before a direct Gradle build. Generated assets and native binaries are ignored by Git. Third-party notices ship in the APK.

On Windows use `pwsh -File apps/android/scripts/build-local.ps1 -ToolsRoot <cache-directory> -OutputRoot <installers> -KeyStore <private-keystore> -PasswordFile <private-password-file>`. It builds ARM64 with at most eight logical processors and two workers, reuses caches, builds the interface, signs locally and verifies the existing signing certificate. `-Version` and `-VersionCode` select an upgrade; `-Unsigned` omits signing. `-ProxyUrl` overrides the laptop default of port 17897; an empty value connects directly. Keys and passwords must never enter source, GitHub Secrets, Release assets or a 4090 transfer.

Run `:app:testReleaseUnitTest` for account-model protocol tests, `go test ./...` in `tailnet/` for pinned transport, and `node apps/android/tests/chat-ui-smoke.mjs` after the interface build for browser checks. Android instrumentation covers application-UID Tailscale startup, optional connection navigation and local database persistence. These checks do not replace physical-phone login and cross-device qualification. There is no background push, voice capture, wake-on-LAN, public relay or remote screen/mouse service. Camera permission is used only by the native QR scanner; web-page camera and microphone requests are denied.
