# Agent Note: File quotations and paired-device conversations

Status: implemented

English | [中文](2026-10-15-file-quotes-paired-devices.zh.md)

## Problem

File preview selections lack composer actions, while separate computers require manual addresses and isolated conversation browsing.

## Decision

File-preview selections use the existing session inputActions annotation admission path. Quotes retain rendered Markdown, math and their file address; comments remain separate draft fields. This avoids a second submission format or a dependency on another plugin’s component implementation. Isolated HTML iframe selections remain unsupported.

Desktop device discovery is opt-in and reads the installed Tailscale client’s local status. Discovery grants no access. A computer-generated one-use invitation pins the peer certificate and requires approval on that computer. Grants are stored with the local operating system encryption service; native IPC returns only public device metadata and conversation summaries. A paired conversation opens in an isolated remote window with no local preload. Its device name stays in the window title. Polling runs only while the device panel is mounted.

Android scanning fills the invitation field but does not automatically authorize or connect. QR images are generated locally. The camera permission belongs to the native scanner, not the remote WebView.

## Verification

Selection tests cover Markdown math, source identity, remark admission failure and editable exclusions. A real HTTPS listener checks certificate mismatch before transmitting a secret, explicit pairing, authenticated conversation RPC and revoked grants. X.509 serializer and extension types share the same schema version so first-time identity generation is exercised, not only restoration of an existing identity.

## Alternatives considered

Copying remote sessions into local storage would duplicate history and confuse execution ownership. Automatic trust for discovered peers would bypass explicit device approval.

## Consequences

Computers and DSH must remain running. Tailscale visibility is not proof that DSH or SSH is available. This adds no public relay, wake-on-LAN or iOS application. Remote conversation summaries are grouped by device rather than copied into the local session store.
