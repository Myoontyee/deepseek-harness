---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-09-queued-message-edit

English | [中文](2026-10-09-queued-message-edit.zh.md)

## Summary

Persist the queued latest-message edit range on user-rpc input so the legal next step can apply its surface replacement after restart.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-09-queued-message-edit
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-08-message-edit"
    after: "9f08f7bfa3ba0375c8c209dd4c815c5ef0722141f7aaadbb22bffc17784a6512"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-08-message-edit"
    after: "83125dc83823b8bbe772ed13a5f39c47424f406f3cd0710c777b2876c1273a74"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-08-message-edit"
    after: "9a4d446f9d59b4bb76454f0a23264d8e7fc67e1a189c5dc647d654382f0b0e69"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-08-message-edit"
    after: "ae6f2b5ea3bdfb9669d97ef4675a939150bc6ef1dcf396b39e0200dfc9d15a70"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Adds an optional edit property; existing records without it remain valid. Completed edits use the unchanged standard surface replacement. Older controllers preserve the optional data but do not execute a pending revision intent; downgrade with a pending edit is not supported. Released V4 validators and records are unchanged.

<a id="verification"></a>
## Verification

Seven focused message-edit tests pass, including compressed-log shutdown/reopen, queued edit recovery, rejection preserving history, and model-input exclusion. The old implementation fails the same cold-reopen test with developer/message does not match an open turn and step.

<a id="dev-note"></a>
## Dev Note

None.
