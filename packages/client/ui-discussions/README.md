---
description: "Historical assistant labels and cleanup of retired discussion panels."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-discussions

English | [中文](README.zh.md)

## Summary

Compatibility rendering for historical saved-assistant messages after the assistant and sidebar-discussion features are removed.

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

The custom desktop no longer registers saved-assistant settings, @ candidates, discussion buttons, topic panes or selection-menu discussion actions. Existing messages retain their captured nickname and avatar. Old discussion Sessions remain accessible through ordinary conversation history.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

Historical reply identity projection and mention-label rendering remain registered. The plugin closes obsolete `discussionboard` tabs when their conversation becomes visible, without deleting Sessions or other tabs. No profile list, model catalog or memory service is queried for these operations.

Existing composer drafts may still contain an old assistant chip. A compatibility serializer converts it to ordinary nickname text when copied or sent and returns no autocomplete candidates; it never selects a profile or model.

-----

<a id="further-exploration"></a>
## Further Exploration

[Web client subsystem](../../../docs/subsystems/web-client.md) and [discussion storage](../../api/discussion-controller/README.md).

-----

<a id="model-experience"></a>
## Model Experience

### Historical presentation

#### What the model sees

This client compatibility plugin adds no model input. The Host owns the one-time retirement notice for a previously selected assistant.

#### Token effect

Historical label rendering and tab cleanup invoke no model and add no tokens.

#### KV Cache effect

Presentation does not change the transcript or its model-request cache prefix.

## Known Limitations and Deferred Work

Saved identities and discussion metadata remain in storage for recovery. The removed settings and discussion panels do not offer editing or deletion.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
