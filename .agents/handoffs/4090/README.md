# DeepSeek Harness Desktop: 4090 handoff

English | [中文](README.zh.md)

This is the owner's development handoff dated 2026-10-18 (Asia/Shanghai). Read the repository [AGENTS.md](../../../AGENTS.md) before editing. [state.json](state.json) records installer versions, checksums and delivery status.

## Scope

Move subsequent development to the 4090 machine to reduce laptop load. The owner will open the next conversation there. Do not create or message another conversation without authorization. Keep the application name **DeepSeek Harness Desktop** and the Desktop whale icon.

The latest owner request explicitly supersedes the previous phone scope: Android must open independent account-authenticated chat; computer access is optional in Settings. Phone history includes approved computer conversations with a globe icon. Phones synchronize content-only transcript and annotation copies to Desktop, where they are read-only previews. Resident assistants and side discussions remain removed. Preserve existing annotation drafts, inline editing, scrolling, keyboard shortcuts, Markdown links/formulas, secret redaction and the separate official/custom update indicators. Do not silently disable mandatory-update or package-verification protections.

## Current installers

Android **0.2.1-rc.2.20261018.5** and Windows **0.2.1-rc.2.20261018.6** use official base **dsh-v0.2.1-rc.2**. Both installers are in the laptop's `D:/DeepseekHarness/SetupBackage`. Android ARM64 matches the owner's vivo phone and uses the existing signing certificate, so it can upgrade the previous installation. Windows includes direct Desktop-to-Desktop approval requests, visible waiting/cancellation and device-neutral native prompts. The delivery branch and build records identify the source.

Android opens phone chat after official DeepSeek sign-in. Embedded Tailscale starts only for optional connection management or previously approved remote access. First use requires its own official Tailscale browser authorization; it cannot read another Android app's private credentials. It then lists account-visible devices automatically. Selecting a matching Desktop requests approval on that computer without QR or IP entry. The computer and app must remain running. QR pairing remains a backup.

## Start on 4090

The ready 4090 worktree is `D:/DeepseekHarness/handoff-20261018`, on local branch `codex/laptop-handoff-20261018`; its handoff entry is `.agents/handoffs/4090/README.zh.md`. It contains the laptop's fixes corresponding to `Myoontyee/deepseek-harness` delivery branch `codex/android-tailnet-20261018`. The laptop checkout remains `D:/DeepseekHarness/raw/deepseek-harness` on `custom/content-only-copy`. Do not assume either machine's default branch contains these changes.

Code transfer and checksum verification completed through SSH. The original 4090 checkout `D:/DeepseekHarness/deepseek-harness` remains on `master` with its one local change preserved; its shallow history was completed before creating the separate worktree. Both computers' bootstrap services respond, and their local daemons verify the peer identities. Tailscale currently relays traffic with roughly 0.8-second latency. Node 24.14.0, Git and PowerShell are available on 4090; dependencies are not installed in the new worktree, so inspect existing caches before preparing its toolchain.

## Local Android build

The owner subsequently authorized downloading the missing local toolchain instead of using GitHub artifact downloads. Go 1.27.1 and Android NDK 28.2.13676358 are installed alongside existing JDK 17, SDK 35, Build Tools 35.0.0 and Gradle 8.11.1 under `D:/DeepseekHarness/tools/android`. Go modules/build output and Gradle dependencies are cached there.

Use [build-local.ps1](../../../apps/android/scripts/build-local.ps1), documented in the [Android README](../../../apps/android/README.md). Supply private keystore/password-file paths; `-ProxyUrl` selects the machine's proxy, or an empty value uses direct connections. The default proxy is the laptop's port 17897. Do not assume this layout or proxy already exists on 4090. Local builds cap CPU affinity at eight logical processors and use two workers.

Signing keys and passwords stay on the laptop. Never copy them into GitHub Secrets, source, Release assets, the handoff or the 4090 transfer. The public certificate fingerprint is in `state.json`. Generated native binaries and license assets are ignored by Git; Go dependency checksums are committed. AndroidX/Go/native notices are included in the APK.

For Windows, the laptop has an offline packaging adapter and caches outside tracked source. Do not blindly copy its absolute paths to 4090. The standard repository entry is [package-target.ts](../../../apps/desktop/scripts/package-target.ts). The final laptop resume reused prepared runtime files and the existing bounded parallel inventory algorithm, retaining full checks. Do not change application source or commits during packaging.

## Verification

Current local checks cover native Go tests, six model-protocol tests, browser annotation/Markdown/remote-row behavior, six viewport sizes, visual-viewport-only keyboard resizing and dark mode. All 65 phone UI assets in the APK match the tested build. Four Android 35 emulator checks passed, including the real native long-press menu opening the comment editor with its selected quotation, node startup, database persistence and navigation; the version and run status are in state.json. The local ARM64 binary uses the pinned Go/NDK toolchain; local network tests, PKCE rejection tests, APK signature/certificate checks, ABI/name/version checks and 16KB ELF segment alignment passed. Physical-phone login and the complete cross-device connection still need owner validation.

Thirteen Desktop bootstrap/transport tests and eight device-view/state tests passed, including rejection, cancellation, timeout/retry and closing the panel during its probe. Nine final Windows compiler/bundle gates and five pre-push type checks passed. Prepared and packaged runtime smokes passed; the actual packaged main contains the new pairing operations and its connection UI matches the built bundle byte for byte. Live readiness checks reached both computers while an intentionally unusable HTTP proxy was configured. Actual native approval and repeated access between the two installed computers still need owner validation. These results do not mean every pre-existing UI or documentation test passes.

## Current local changes

Phone chat uses Desktop's icon artwork and theme colors, a left history drawer with Settings at the bottom, a conversation header and a rounded composer with model/effort controls below its message field. Long tables, code, math and quotation previews scroll locally; short keyboard viewports retain Send and annotation actions. Native settings use compact outlined buttons and device cards. Native long-press offers Add annotation on local and remote pages; the quotation survives Android menu dismissal. Saved Tailnet grants use the app-owned node instead of requiring the separate Android VPN switch. Foreground startup restores the node, refreshes remote conversations and retries offline connections; explicit embedded logout pauses restoration. Model/effort selection, streamed Messages requests, compressed account-scoped drafts, Markdown/TeX annotations, optional mirrored history and pinned/revocable remote access remain in place. Build and delivery evidence is recorded in state.json.

Desktop's device-row button now probes and sends an approval request to the selected computer instead of only expanding a pairing-code form. Closing the panel cancels pending work, including a late readiness probe. The receiver restores a minimized application window and displays device-neutral authorization copy. Approval remains separate from Tailscale sign-in and persists in OS-encrypted storage; do not remove operator approval just because a peer is in the same Tailnet. Manual codes remain a backup.

## Important implementation boundaries

Android app UIDs cannot use Go's raw netlink interface enumeration. [TailnetClient.java](../../../apps/android/app/src/main/java/io/jadegate/dsh/companion/TailnetClient.java) supplies SDK-visible interfaces to the [native helper](../../../apps/android/tailnet/main.go). Android+cgo does not register the androidbin fallback; importing it alone did not fix the issue. Keep the cgo/bionic resolver and do not add the netgo build tag.

The [Desktop bootstrap](../../../apps/desktop/src/tailnet-pairing.ts) binds only its Tailscale IPv4 address on port 42873. The local daemon verifies the actual source address before operator approval. Do not trust forwarded headers or self-reported device names. Grants are separate and revocable; the Host cookie remains on the computer. Switching an enabled LAN gateway to Tailscale requires stopping and rebinding it after approval.

Next install Windows .6 on both computers and validate actual approval, access in both directions, revocation and restarting the apps. Then validate actual phone sign-in, device selection, switching computers, Wi-Fi/mobile/VPN changes, foreground restoration and long annotation drafts. Do not replace device discovery with a 100.x address hint. Full multi-platform publishing and future upstream upgrades remain separate work. Electron tests must use isolated profiles, disable discovery for fixture accounts and restore the user's protocol association.
