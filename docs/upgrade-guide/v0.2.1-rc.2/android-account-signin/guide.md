---
kind: upgrade-guide
description: "Android opens account-authenticated phone chat and moves computer connections into Settings."
---

# Android phone chat and optional computer access

English | [中文](guide.zh.md)

## Change

Android opens phone chat after official DeepSeek browser authorization. It uses the same account-authenticated model endpoint as Desktop; connecting a computer is optional. Transcripts, drafts and annotations persist locally in account-scoped compressed SQLite storage. Existing encrypted computer grants remain stored. Settings contains embedded Tailscale discovery and computer access. A new computer requires local approval, with QR pairing available as a LAN backup. Authorized phones can synchronize content-only transcript and annotation copies to Desktop. This does not synchronize DeepSeek cloud chat history. Remote conversations appear in the phone history with a globe icon; their operator pages no longer have an extra native pairing toolbar.

## Migration

1. Install the new APK over the existing installation without clearing application data. Update Desktop too for phone transcript synchronization and corrected approval timeouts.
2. Sign in once through the official browser page and return to the app. If the official service reports a network or rate-limit error, retain application data and retry later.
3. Confirm the phone opens a message composer without pairing. Choose an account model and thinking effort. Long-press a reply to add an annotation; its quotation and comment remain separate until included in a sent message.
4. Optionally open Settings → Devices and conversations, sign in to embedded Tailscale, and connect an available DSH computer. Approve once on that computer. An installed Tailscale VPN does not expose its private login to this app.
5. Open the phone history and choose a conversation with a globe icon. On Desktop, open Devices and conversations → Phone conversations to read synchronized phone copies. Disable phone synchronization in Android Settings or revoke the device in Desktop Phone control to stop future access.
