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

Create an assistant in Settings → Saved assistants and select an available model. Choose a default avatar or upload a local PNG/JPEG/WebP up to 2 MB; uploads become 64-pixel thumbnails. A checkbox controls model-name display on replies. Type `@` in any conversation and select an assistant to answer with current context. Replies retain the identity captured at request time, including after profile edits and reloads.

The model list shares the conversation selector's cached catalog and follows model configuration and credential changes. Opening settings does not start another catalog request. Refresh retains available models; failed and empty catalogs show explicit messages without clearing the assistant draft.

Reasoning effort lists only the selected model's advertised levels, alongside Model default. Models without adjustable effort show a disabled control. Changing models clears the previous effort; unavailable saved levels must be reselected before saving. The choice persists across restarts and applies to assistant mentions and discussion replies.

Open Discussions from a conversation header or a text-selection menu. A topic starts an independent native Session without copying parent history. Select a topic to continue it in the sidebar. Closing, resolving or archiving keeps its history. Add a reviewed conclusion to the parent composer with its discussion link; this does not send the message.

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

Opening a pane or saving an assistant does not run a model. Topic quotation context uses `discussion-assistant`; the selected speaker's duties and confirmed memories use a logged `saved-assistant` notice. Confirmed memories are managed through Settings, not automatically extracted from every discussion.

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
