---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-16-assistant-model-restoration

English | [中文](2026-10-16-assistant-model-restoration.zh.md)

## Summary

Keeps a temporary saved-assistant call from replacing the conversation model.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-16-assistant-model-restoration
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-16-saved-assistant-speakers"
    after: "1cb622db8507ee96d35bbd5fc948859229f2d42fbb69fa528c8667de6641a512"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-16-saved-assistant-speakers"
    after: "8c4709ec7f40316d19863367526333afc753ff6cec0f014bfb096a0d65be3a0c"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-16-saved-assistant-speakers"
    after: "67409664b9a0f29e9970ae074ca3ebd612f0fc683374d5c509d14ee4002fc817"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-16-saved-assistant-speakers"
    after: "f872c1fff414d6c513138cc71b8c65d98fdb058f275916c92cee8ce5ce88b68a"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Adds optional returnModel metadata to the existing saved-assistant source and a distinct saved-assistant-return context source. Existing records remain readable. Old readers ignore the added metadata and retain unknown producer context as text; no existing event discriminator or header version changes. The captured route is recovered from the committed Session prefix and later explicit model/selection events take precedence.

<a id="verification"></a>
## Verification

The real Agent-loop test uses the actual last-request-driven selection behavior, clears and remounts routing state, checks the recorded return route, exercises consecutive mentions, and verifies that a later explicit user model choice wins.

<a id="dev-note"></a>
## Dev Note

None.
