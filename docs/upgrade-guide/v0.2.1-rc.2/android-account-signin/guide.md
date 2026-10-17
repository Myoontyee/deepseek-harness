---
kind: upgrade-guide
description: "The Android companion requires official account sign-in before reopening computer connections."
---

# Android account sign-in before computer access

English | [中文](guide.zh.md)

## Change

The Android companion opens the official DeepSeek browser authorization flow before showing computer access. Existing encrypted computer grants remain stored. Account sign-in does not grant computer control or synchronize conversations through DeepSeek's cloud. Connection management moves to Settings, and phone annotations use the connected computer's conversation and file editor.

## Migration

1. Install the new APK over the existing installation without clearing application data.
2. Sign in once through the official browser page and return to the app. If the official service reports a network or rate-limit error, retain application data and retry later.
3. Open Settings → Connections to detect VPN private-network addresses, open Tailscale or reconnect a saved computer. A new computer still requires its single-use QR invitation and local approval.
4. Confirm that the stored computer opens, then long-press text and choose Add annotation. Verify that the source quotation and remark appear separately in the composer before sending.
