---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-16-saved-assistant-speakers

English | [中文](2026-10-16-saved-assistant-speakers.zh.md)

## Summary

Records saved-assistant reply identity on a dedicated user context source.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-16-saved-assistant-speakers
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-10-custom-alpha2-integration"
    after: "00616e6b51b251a1e2dea776079144900566b9f0401e3930e848ffc77e417b42"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-10-custom-alpha2-integration"
    after: "21420126d5a1353f727177d72771afb9144c09ad6507d7d0f47cbac09c2eadea"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-10-custom-alpha2-integration"
    after: "6c74a4b585cc29f4c24057eadc65808a42997ea4b104fb7c3b20de6fd45ad144"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-10-custom-alpha2-integration"
    after: "d8cbc3e308754eabb8dd3c01fbcdc8095377aae1f3b6a70999bbcb3f7816a259"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The saved-assistant source kind is a new discriminator on the existing user/message envelope. New readers accept old messages unchanged; old readers retain unknown producer context and its model-visible text without interpreting speaker metadata. Provider/model/avatar preferences are optional in assistant storage, so old profiles remain readable. Avatar metadata is never model image content. Existing Session event discriminators and header version remain unchanged.

<a id="verification"></a>
## Verification

Focused assistant tests: 18 passed, including a real Agent loop verifying model routing, previous conversation context, bounded-memory input and ordinary-model restoration. Client type compilation passed.

<a id="dev-note"></a>
## Dev Note

None.
