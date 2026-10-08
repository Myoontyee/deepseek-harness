---
description: "Start read-only source reviews in dedicated Sessions"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-code-review-controller

English | [中文](README.zh.md)

## Summary

Starts dedicated read-only code-review Sessions from working-tree, branch or checked-out PR changes. Preferences select reviewer provider/model and criteria per registered workspace without changing ordinary chat defaults.

## Table of Contents

- [Preparation and persistence](#preparation-and-persistence)
- [Configuration](#configuration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="preparation-and-persistence"></a>
## Preparation and persistence

The Git controller captures a bounded patch, changed paths and commit identities. Branch and PR comparisons require a clean checkout; a PR head must match the checked-out commit. The `code_review` v1 domain retains the prepared context and request hash. Stable request identities deduplicate concurrent calls and reuse an admitted Session after restart. Different input cannot reuse an identity.

The Session is created with the `code-review` preset, read-only permissions and a model selection that does not update global defaults. A short user prompt describes the review; full source material enters the logged dynamic context. Cancellation before admission stops preparation. After admission, the conversation owns the run and normal stop controls apply. Host teardown cancels and joins preparations before closing their storage.

<a id="configuration"></a>
## Configuration

Volatile provider, model, instructions and repository preferences are edited by the Git settings client. Empty provider/model follows the ordinary default route. `maxDiffChars`, `maxFiles` and `contextOrder` bound and order the model context. Truncation is reported to the reviewer.

<a id="model-experience"></a>
## Model Experience

### Review input

#### What the model sees

The model receives a short task and the captured diff through logged `code-review-changes` context. The `code-review` preset allows only read/search tools and requests findings with locations, evidence and coverage limits.

#### Token effect

The initial diff is bounded by `maxDiffChars` and `maxFiles`; additional reads extend normal tool history.

#### KV Cache effect

The prepared diff stays fixed for this review. New turns reuse unchanged prefixes; selecting the reviewer model does not modify other conversations.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Automatic PR monitoring and remote hosted review workers are not implemented. Local files can change during review; reviewers are instructed to report mismatches. Prepared records currently remain in local application storage after Session deletion. Tests with local fixture models validate transport, persistence and tool restrictions, not model review quality.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
