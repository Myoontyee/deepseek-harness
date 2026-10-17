# DeepSeek Harness Desktop for Android

English | [中文](README.zh.md)

A personal Android companion for the opt-in Desktop phone-control gateway. This is not an official DeepSeek Android release. The PC and DSH must remain running. Android 8.0 or later is required; a recent Android System WebView is recommended.

The launcher reuses the Desktop whale logo and supplies Android adaptive and round icon resources.

## Connect

1. Sign in to DeepSeek in the system browser. The app uses the Platform PKCE authorization flow; passwords stay on the official page. The phone does not run an independent chat model. Existing computer grants survive an APK upgrade, but account sign-in is required before reopening them.
2. The home page starts the embedded Tailscale node and restores its app-private login. On first use, choose **Sign in to Tailscale** and complete the official browser authorization. This is a separate node from the installed Tailscale VPN app; that app's credentials are not read. The list automatically shows the nodes visible to this account, with their Tailnet names and online state.
3. Choose a computer running the matching Desktop version and approve its local connection dialog. No QR code or address entry is required. Desktop binds the bootstrap listener only to its Tailscale IPv4 address, verifies the source using the local daemon, then returns a device grant after approval. Disabling Phone control also disables automatic discovery. QR pairing remains a backup for LAN connections.
4. Open the same DSH conversations and files. Long-press text and choose Add annotation, or use the toolbar annotation button. The existing DSH editor preserves the source quotation and records the remark separately. Accepted tasks run on the PC.
5. Computer grants are saved separately so switching among previously authorized computers does not require new approval. Settings can enable automatic reconnection to the selected, certificate-pinned computer. Network restoration retries a failed page; it does not reload a working page containing remarks. Revoke a device from the Desktop panel to terminate active access. Clearing the phone's grant does not revoke it on an offline PC.

## Trust and storage

QR invitations contain the private-network endpoint, a SHA-256 certificate identity and a random one-use secret. The embedded bootstrap exchanges identity material over the authenticated Tailnet connection; later native pairing and WebView requests require that exact certificate and its validity period; a changed identity requires re-pairing. There is no general certificate-error bypass and no JavaScript-to-native bridge. Navigation stays on the paired origin; user-initiated external links can open in the system browser without the DSH device cookie.

Desktop stores its TLS key and hashed per-device grants with Electron OS-backed encryption. It keeps the underlying Host cookie on the PC. Android stores the official account grant and computer grants in separate Android Keystore AES-GCM namespaces. Embedded Tailscale node state stays in app-private files. The app disables backup and uses a Secure/HttpOnly device cookie. Pairing requires local approval. The grant permits the full authenticated DSH operator interface, including viewing conversations, sending/stopping tasks and answering approvals; it is not a read-only grant. Up to eight devices can be paired.

## Build

Use JDK 17, Android SDK 35, Build Tools 35.0.0 and Gradle 8.11.1. Configure the SDK in an untracked `local.properties`. Build `tailnet/` for Android with the pinned Tailscale dependency and place the helpers in `app/src/main/jniLibs/<abi>/libdsh_tailnet.so`; the dedicated Actions workflow performs this and packages third-party notices. Set `DSH_ANDROID_KEYSTORE` and `DSH_ANDROID_STORE_PASSWORD` to a private persistent signing keystore, alias `dsh-companion`, before running `gradle :app:assembleRelease`. Never commit keys or passwords. Keep the same signing key for upgrades. Verify the APK with `apksigner verify` before distribution. Without `DSH_ANDROID_KEYSTORE`, the release task produces an unsigned APK without configuring a signing identity. `DSH_ANDROID_VERSION_NAME` and `DSH_ANDROID_VERSION_CODE` select the displayed release version and its monotonically increasing Android code.

## Validation and limits

The native helper and APK are compiled in GitHub Actions; the APK is signed locally with the existing private key. Build verification includes an Android emulator running the helper under the application UID, obtaining the official Tailscale login URL and checking the requested application name on the home page. This does not complete a real user login or qualify the physical phone. PKCE proof tests reject altered state, hosts, paths and duplicate callback parameters. The native annotation action is exercised against the packaged Desktop UI. The APK has not yet been verified through a complete connection on the user’s physical Android device. Desktop network checks cover one-use/expired pairing, authority checks, credential isolation, grant persistence, WebSocket round trips and revocation of active HTTP/WebSocket connections. Browser composition checks are separate from Android device qualification.

There is no background push notification service, phone voice capture, screen/mouse remote desktop, wake-on-LAN, public relay or persistent remote SSH Agent. Closing the phone does not intentionally stop accepted tasks; closing DSH stops access. The application does not disable PC sleep automatically. Changing the PC's selected network address requires choosing the new address and re-pairing. Camera/microphone requests from the web page are denied. File-picker support requires device validation.

The pairing screen supports QR scanning through ZXing Android Embedded. Camera permission is requested only for the native scanner; WebView camera and microphone requests remain denied. Scanning fills the invitation field and still requires an explicit connection action and approval on the computer.
