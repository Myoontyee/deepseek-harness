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

Saved assistants bind a provider and model. A newly submitted `@name` or assistant reference invokes one saved identity in the current Session with its existing history; code and quoted lines do not select an assistant. Ambiguous names and unavailable models fail visibly. Topic messages use their selected assistant by default. The next ordinary parent turn uses its own selected model.

| Field | Default | Meaning |
|---|---|---|
| maxMemoryChars | 6000 | Selected memory character budget including separators; 0 disables injection. |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

Assistant profiles optionally store `reasoningEffort`. Missing values use the selected model's default, preserving older profiles. Create and update validate explicit effort against that model's catalog. Replacing a draft without the field clears a previous override. Request routing passes the saved effort for the invocation; the next ordinary turn restores the conversation's model and effort.

<details>
<summary>Maintainer details — click to expand</summary>

The generated `discussions` Remote owns profile edits, topic creation and memory changes. Topic creation uses an idempotency key and an independent Session rather than forking the entire parent history. Profile and topic edits use revision checks. The system-context contribution is recorded through the existing prompt pipeline. Source quotations and parent transcripts are reference material, not new instructions. The parent is never automatically notified or awakened.

The step hook appends a `saved-assistant` notice containing duties, bounded memory and a reply identity snapshot. Request routing changes only that invocation. Old profiles remain readable but need a model before direct mention. Shared topic context contains the quotation and parent link, without another speaker's memory. Avatar thumbnails stay local and bounded.

The notice also records the conversation's return model. A fresh routing instance recovers it from the Session log; a later explicit user model choice takes precedence. A `saved-assistant-return` notice ends the invocation. This avoids adopting the assistant's last-used model as the ordinary conversation model after reload.

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

Discussion requests include assistant duties, the original quotation, a parent deep link and bounded confirmed memory. The `read_session` tool retrieves more parent text when needed. Direct mentions use current Session history, including other speakers' replies. A notice ends the saved identity on the next ordinary turn. Avatars are metadata, not model image inputs; these APIs expose no automatic memory-writing tools.

#### Token effect

Only sending a topic message invokes the model. The quotation and selected complete memory entries add context tokens within the Host memory character budget. The full parent transcript is not copied.

#### KV Cache effect

Changing an assistant profile or confirmed memory changes its subsequent context contribution. Saving history by itself does not invoke a model or inject old transcripts.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- No automatic fact extraction, vector index, background wake or multi-member dispatch is implemented. Project memories use the exact Host workspace identity. Topic metadata has no automatic expiry; explicit archive retains native Session history. Remote delegation requires an explicit access-policy grant for the new endpoints.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
