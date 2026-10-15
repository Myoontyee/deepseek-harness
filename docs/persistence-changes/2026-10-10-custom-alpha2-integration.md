---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-10-custom-alpha2-integration

English | [中文](2026-10-10-custom-alpha2-integration.zh.md)

## Summary

Integrates custom Session relay attribution and queued same-Session editing with the official alpha.3 persistence history.

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
    previous: "2026-10-13-user-rpc-principal"
    after: "48682fb0438da203bc928c4a8964fa8eee4d54640de78160ed1ee2807c2d9628"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "db570388df700b34e2d7330e2114fb6b67513f64b915e83b104a83a46d0ba2e6"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-13-user-rpc-principal"
    after: "69207758da6350ec4bc96014d039f17f47c12442e12ff621c95010b71e3573f8"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "2d7a591baca42163e83c4b895d23258ed7bfd3e01537d4f31d503ce4c5b50a49"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

The custom metadata remains optional and preserves the official user-rpc principal attribution. Existing alpha.2 custom records without principal continue to identify the owner. The edit discriminator identifies queued revisions; admitted replacements remain ordinary persisted surface replacements. Readers without the custom attribution may display its audit rows but must use the persisted replacements for model replay. This record is outside the finalized checkpoint and is refreshed against the accepted upstream history; no Session generation or finalized schema is rewritten.

<a id="verification"></a>
## Verification

Focused edit-message Host tests passed in the alpha.3 integration run. Host and Client typechecks passed. The real Desktop annotation scenario passed, including exact annotation delivery to the model and synchronized completion markers.

<a id="dev-note"></a>
## Dev Note

None.
