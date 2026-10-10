---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-08-message-edit

English | [中文](2026-10-08-message-edit.zh.md)

## Summary

Adds message-edit source metadata for same-Session prompt revisions.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-08-message-edit
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-02-session-relay"
    after: "19e785c215cffac1b2c9e6fb1ff4465c52e886b6690489e693835618b68fd92e"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-02-session-relay"
    after: "41d3ceaa30671c4ddb9165384e83f3bef6aef4aa159fcf1767d585893755ef56"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-02-session-relay"
    after: "666b5da723d56738f4cc092bf54922774fcfc1bcdb8203d5e3aa02be46989f83"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-02-session-relay"
    after: "6c22f141746bc1cc6004fa54ce02ecdb884dbea9d329228ec82075ef9189b9b2"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing event records remain valid. The new source is attached to an existing empty developer/message and standard surface replace operation; physical logs remain append-only. Older Chat clients may show superseded rows, while the existing surface engine excludes the replaced model-visible tail.

<a id="verification"></a>
## Verification

631 focused Chat, message-edit and completion badge tests passed, including stale/busy/compacted rejection and revision replay.

<a id="dev-note"></a>
## Dev Note

None.
