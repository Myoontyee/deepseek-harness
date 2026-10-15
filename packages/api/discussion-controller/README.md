---
description: "Persistent discussion metadata and explicitly saved assistant memories."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-discussion-controller

English | [中文](README.zh.md)

## Summary

Keep sidebar discussions across restarts and give recurring assistants explicitly confirmed memories. Each topic retains its source quotation without copying the parent transcript. Closing a pane or turning memory off keeps stored records. Opening a topic starts no model turn.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The Web bundle composes the service. Settings manages names, responsibilities and memory scope. Temporary assistants inject no cross-task memory; project assistants use only their current project's entries; resident assistants may also use their own global entries. Memory changes require explicit user saves. `maxMemoryChars` bounds complete selected entries, including separators, per model request.

| Field | Default | Meaning |
|---|---|---|
| maxMemoryChars | 6000 | Selected memory character budget including separators; 0 disables injection. |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

The generated `discussions` Remote owns profile edits, topic creation and memory changes. Topic creation uses an idempotency key and an independent Session rather than forking the entire parent history. Profile and topic edits use revision checks. The system-context contribution is recorded through the existing prompt pipeline. Source quotations and parent transcripts are reference material, not new instructions. The parent is never automatically notified or awakened.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

[GUI subsystem](../../../docs/subsystems/web-client.md) and [Session storage](../../session-query/session-log-export/README.md) describe the existing presentation and transcript readers.

-----

<a id="model-experience"></a>
## Model Experience

### Discussion context

#### What the model sees

Discussion requests include the assistant responsibilities, the original quotation, a parent deep link and bounded user-confirmed memory. The existing `read_session` tool can retrieve more parent text only when needed. These APIs do not expose automatic memory-writing tools.

#### Token effect

Only sending a topic message invokes the model. The quotation and selected complete memory entries add context tokens within the Host memory character budget. The full parent transcript is not copied.

#### KV Cache effect

Changing an assistant profile or confirmed memory changes its subsequent context contribution. Saving history by itself does not invoke a model or inject old transcripts.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- No automatic fact extraction, vector index, background wake or multi-member dispatch is implemented. Project memories use the exact Host workspace identity. Topic metadata has no automatic expiry; explicit archive retains native Session history. Remote delegation requires an explicit access-policy grant for the new endpoints.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
