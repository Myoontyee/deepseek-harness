# DSH Android Companion

English | [中文](README.zh.md)

A personal Android companion for the opt-in Desktop phone-control gateway. This is not an official DeepSeek Android release. The PC and DSH must remain running. Android 8.0 or later is required; a recent Android System WebView is recommended.

The launcher reuses the Desktop whale logo and supplies Android adaptive and round icon resources.

## Connect

1. Sign in to DeepSeek in the system browser. The app uses the Platform PKCE authorization flow; passwords stay on the official page. The phone does not run an independent chat model. Existing computer grants survive an APK upgrade, but account sign-in is required before reopening them.
2. Open Settings → Connections. The app detects local 100.64.0.0/10 addresses and can open the installed Tailscale app. Both devices must already have working private-network connectivity, or share a LAN. Detection does not enumerate the whole tailnet or authorize new computers.
3. In Desktop, choose Application → Phone control, select a reachable private address and generate a QR invitation. Scan it on the phone; approve the requesting device on the PC. The five-minute invitation is single-use. Pasting its code remains available.
4. Open the same DSH conversations and files. Long-press text and choose Add annotation, or use the toolbar annotation button. The existing DSH editor preserves the source quotation and records the remark separately. Accepted tasks run on the PC.
5. Settings can enable automatic reconnection to the stored, certificate-pinned computer. Network restoration retries a failed page; it does not reload a working page containing remarks. Revoke a device from the Desktop panel to terminate active access. Clearing the phone's grant does not revoke it on an offline PC.

## Trust and storage

The pairing code contains the private-network endpoint, a SHA-256 certificate identity and a random one-use secret. Native pairing and WebView requests require that exact certificate and its validity period; a changed identity requires re-pairing. There is no general certificate-error bypass and no JavaScript-to-native bridge. Navigation stays on the paired origin; user-initiated external links can open in the system browser without the DSH device cookie.

Desktop stores its TLS key and hashed per-device grants with Electron OS-backed encryption. It keeps the underlying Host cookie on the PC. Android stores the official account grant and the computer grant in separate Android Keystore AES-GCM namespaces, disables backup and uses a Secure/HttpOnly device cookie. Pairing requires local approval. The grant permits the full authenticated DSH operator interface, including viewing conversations, sending/stopping tasks and answering approvals; it is not a read-only grant. Up to eight devices can be paired.

## Build

Use JDK 17, Android SDK 35, Build Tools 35.0.0 and Gradle 8.11.1. Configure the SDK in an untracked `local.properties`. Set `DSH_ANDROID_KEYSTORE` and `DSH_ANDROID_STORE_PASSWORD` to a private persistent signing keystore, alias `dsh-companion`, before running `gradle :app:assembleRelease`. Never commit keys or passwords. Keep the same signing key for upgrades. Verify the APK with `apksigner verify` before distribution. Without `DSH_ANDROID_KEYSTORE`, the release task produces an unsigned APK without configuring a signing identity. `DSH_ANDROID_VERSION_NAME` and `DSH_ANDROID_VERSION_CODE` select the displayed release version and its monotonically increasing Android code.

## Validation and limits

The release APK is compiled offline and its install signature is verified. PKCE proof tests reject altered state, hosts, paths and duplicate callback parameters. The native annotation action is exercised against the packaged Desktop UI. The companion has not yet been tested on a physical Android device. Desktop network checks cover one-use/expired pairing, authority checks, credential isolation, grant persistence, WebSocket round trips and revocation of active HTTP/WebSocket connections. Browser composition checks are separate from Android device qualification.

There is no background push notification service, phone voice capture, screen/mouse remote desktop, wake-on-LAN, public relay or persistent remote SSH Agent. Closing the phone does not intentionally stop accepted tasks; closing DSH stops access. The application does not disable PC sleep automatically. Changing the PC's selected network address requires choosing the new address and re-pairing. Camera/microphone requests from the web page are denied. File-picker support requires device validation.

The pairing screen supports QR scanning through ZXing Android Embedded. Camera permission is requested only for the native scanner; WebView camera and microphone requests remain denied. Scanning fills the invitation field and still requires an explicit connection action and approval on the computer.
