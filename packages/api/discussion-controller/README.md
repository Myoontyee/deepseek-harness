---
description: "Read-only archives and ordinary-chat restoration after assistant and discussion retirement."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-discussion-controller

English | [中文](README.zh.md)

## Summary

Compatibility support for retired saved assistants and sidebar discussions. Existing profile, memory and topic records remain readable, and their native conversation logs are preserved.

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

Saved assistant settings, assistant mentions and discussion creation are no longer offered. Continue old discussion conversations through the ordinary conversation list. The remaining `discussions` Remote methods read archived records; mutation methods have been removed.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The storage domain keeps its existing schema and rows. A retirement hook recognizes a previously active assistant from its own Session events, appends an existing `saved-assistant-return` notice and restores the captured ordinary model and reasoning effort. A later explicit model choice wins. No profile is selected and no saved memory or discussion prompt is injected.

-----

<a id="further-exploration"></a>
## Further Exploration

[GUI subsystem](../../../docs/subsystems/web-client.md) and [Session storage](../../session-query/session-log-export/README.md) describe the existing presentation and transcript readers.

-----

<a id="model-experience"></a>
## Model Experience

### Retirement context

#### What the model sees

The first accepted continuation of a legacy assistant invocation receives a notice ending that role. Existing transcript content remains historical context; no new saved-assistant duties or memories are added.

#### Token effect

Retirement adds one short notice when needed. Reading archives does not invoke a model or copy conversation histories.

#### KV Cache effect

The ordinary transcript prefix is preserved. The appended retirement notice affects only subsequent context.

## Known Limitations and Deferred Work

Historical records are retained without a dedicated editing UI or automatic deletion. Read-only archive APIs remain available for explicit recovery; creation and mutation endpoints are retired.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer details — click to expand</summary>

None.

</details>
