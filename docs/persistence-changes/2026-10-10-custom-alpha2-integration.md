---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-10-custom-alpha2-integration

English | [中文](2026-10-10-custom-alpha2-integration.zh.md)

## Summary

Integrates ordinary Session relay attribution and queued same-Session editing on the official alpha.2 persistence history.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-10-custom-alpha2-integration
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-05-working-directory-attribution"
    after: "e445af34ea6ca9b80f031c1f53351db9295f98c0d7dd8204fc14d4f8ed9aaf6f"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-05-working-directory-attribution"
    after: "ec815e4603d44195802820df434f499c777f88b4c66ca65d4f53a6ddefb79758"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-07-title-reasoning-effort"
    after: "f3449ee7306ee3d3c5d5af935b2db922516c499ec7b1a6bc20342b6a1637aae7"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-05-working-directory-attribution"
    after: "578be6c12e868f1beb6f427b61b1a7b9146d2626f040267c478a2bdbeff6f5fc"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Official accepted records and released V4 readers are unchanged. The three earlier custom alpha.1 declarations and complete schema snapshots are retained byte-for-byte under custom-alpha1 as branch history. This successor records the combined current schema after the official working-directory attribution update. Existing message sources and records without optional edit fields remain readable. Session-relay metadata is attributed message data, not a replay command. The optional user-rpc edit range is applied by the next legal open step; physical log history is retained. Older controllers do not execute a pending edit intent, so downgrading with a queued edit is unsupported. No user session files are rewritten by this documentation integration.

<a id="verification"></a>
## Verification

On the alpha.2 integration, edit-message.host.spec.ts passes completed and queued compressed-log shutdown/reopen and rejected-admission cases. session-relay.host.spec.ts passes delivery, single feedback and no-bounce cases. The seven focused suites pass 298 tests (one platform skip).

<a id="dev-note"></a>
## Dev Note

None.
