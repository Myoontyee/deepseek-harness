---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-02-session-relay

English | [中文](2026-10-02-session-relay.zh.md)

## Summary

Adds attributed messages and one-shot feedback between ordinary Sessions.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-02-session-relay
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-21-user-question-reply"
    after: "c54d01e01e946a5b3f28fb35268f9724894b3bc4fe8b0ff0935bf771dbebfaf1"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-09-21-user-question-reply"
    after: "b3f29c52823597e4d1d87960952140aec366f5e27b2fda93972b68205d058b3a"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-09-21-user-question-reply"
    after: "21c004a397766c06289ad39320956f8f2bd1038f0e2eec943c8b862cef94dbe5"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-09-21-user-question-reply"
    after: "8e5f6f9da05dba26acc463ed0b05fbad80502281024cc4c5bfed4726158d7948"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The session-relay alternative extends MessageSourceMap while preserving existing message and inbox envelopes. Existing sources remain valid; new records carry sender identity, request identity, the original request, and feedback flags. There is no replay of automatic feedback after Host termination.

<a id="verification"></a>
## Verification

The Session relay tests exercise real AgentLoop inboxes, concurrent duplicate delivery, feedback suppression, archived and unknown targets, cancellation before admission, and feedback attribution. Desktop qualification uses the shipped profile with a local deterministic provider.

<a id="dev-note"></a>
## Dev Note

None.
