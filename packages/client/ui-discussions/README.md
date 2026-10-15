---
description: "Persistent sidebar discussions and user-managed assistant templates."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-discussions

English | [中文](README.zh.md)

## Summary

Each conversation can open a sidebar discussion board. Selected transcript or file text can start a topic with its original quotation. Settings provides saved assistant identities, responsibilities, temporary/project/resident templates and explicit memory controls.

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

Create an assistant in Settings → Saved assistants. Open Discussions from a conversation header or a text-selection menu. A topic starts an independent native Session without copying parent history. Select a topic to continue it in the sidebar. Closing the tab keeps the topic and its transcript. Resolve, archive and reopen retain history. Add a reviewed conclusion to the parent composer with its discussion link; this does not send the message.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

The `discussionboard` resource retains the parent Session while its tab is open. An opened topic retains one additional Session reference and renders the existing Conversation factory. Only the visible topic is mounted. The Host owns assistant records, topic metadata and memory entries. Failed settings writes keep the user's editor text; revision conflicts require refresh.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

[Web client subsystem](../../../docs/subsystems/web-client.md) and [discussion storage](../../api/discussion-controller/README.md).

-----

<a id="model-experience"></a>
## Model Experience

### Discussion context

#### What the model sees

Opening a pane or saving an assistant does not run a model. Sending within a topic uses the native conversation pipeline and its recorded `discussion-assistant` context. Confirmed memories are managed through Settings, not automatically extracted from every discussion.

#### Token effect

Only sending a topic message invokes the model. The quotation and selected complete memory entries add context tokens within the Host memory character budget. The full parent transcript is not copied.

#### KV Cache effect

The UI adds no extra model request. Only context selected by the Host enters subsequent topic requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- This initial board has explicit refresh and one selected assistant per topic. Automatic memory extraction, multi-member dispatch, topic search and unread counts are not implemented. Unsaved topic creation fields are panel-local; native chat drafts use the existing conversation persistence. No automatic history deletion is enabled.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
