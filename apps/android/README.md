# DSH Android Companion

English | [中文](README.zh.md)

A personal Android companion for the opt-in Desktop phone-control gateway. This is not an official DeepSeek Android release. The PC and DSH must remain running. Android 8.0 or later is required; a recent Android System WebView is recommended.

## Connect

1. Install the companion APK and the matching custom Desktop build with Phone control.
2. Put both devices on the same LAN, or an already configured private network such as Tailscale. In Desktop, open Application → Phone control and choose the reachable private address. Public Internet routing and Tailscale installation are not configured automatically.
3. Choose Pair phone, copy the five-minute single-use code and paste it into the Android app. Approve the requesting device on the PC.
4. The phone opens the same DSH conversations. Send tasks and answer existing permission prompts there. Accepted work runs on the PC. Use Reconnect after restoring network connectivity.
5. Revoke a device from the Desktop phone-control panel to close its HTTP streams and WebSocket connections immediately. Clearing a connection on Android removes local credentials; offline server-side revocation still requires the PC panel.

## Trust and storage

The pairing code contains the private-network endpoint, a SHA-256 certificate identity and a random one-use secret. Native pairing and WebView requests require that exact certificate and its validity period; a changed identity requires re-pairing. There is no general certificate-error bypass and no JavaScript-to-native bridge. Navigation stays on the paired origin; user-initiated external links can open in the system browser without the DSH device cookie.

Desktop stores its TLS key and hashed per-device grants with Electron OS-backed encryption. It keeps the underlying Host cookie on the PC. Android encrypts the stored connection with an Android Keystore AES-GCM key, disables backup and uses a Secure/HttpOnly device cookie. Pairing requires local approval. The grant permits the full authenticated DSH operator interface, including viewing conversations, sending/stopping tasks and answering approvals; it is not a read-only grant. Up to eight devices can be paired.

## Build

Use JDK 17, Android SDK 35, Build Tools 35.0.0 and Gradle 8.11.1. Configure the SDK in an untracked `local.properties`. Set `DSH_ANDROID_KEYSTORE` and `DSH_ANDROID_STORE_PASSWORD` to a private persistent signing keystore, alias `dsh-companion`, before running `gradle :app:assembleRelease`. Never commit keys or passwords. Keep the same signing key for upgrades. Verify the APK with `apksigner verify` before distribution.

## Validation and limits

The release APK was compiled and its install signature verified. The companion has not yet been tested on a physical Android device. Desktop network checks cover one-use/expired pairing, authority checks, credential isolation, grant persistence, WebSocket round trips and revocation of active HTTP/WebSocket connections. Browser composition checks are separate from Android device qualification.

There is no background push notification service, phone voice capture, screen/mouse remote desktop, wake-on-LAN, public relay or persistent remote SSH Agent. Closing the phone does not intentionally stop accepted tasks; closing DSH stops access. The application does not disable PC sleep automatically. Changing the PC's selected network address requires choosing the new address and re-pairing. Camera/microphone requests from the web page are denied. File-picker support requires device validation.
