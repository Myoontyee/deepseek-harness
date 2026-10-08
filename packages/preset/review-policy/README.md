---
description: "Restrict the code-review preset to its explicitly mounted tools"
kind: "package-reference"
---

# @deepseek-ai/dsh-review-policy

English | [中文](README.zh.md)

## Summary

Preset-scoped policy that limits each Agent to an explicit inherited-tool allowlist. The code-review preset allows read/search tools; the SSH preset configures the same policy with only `ssh_exec`.

## Table of Contents

- [Configuration and lifecycle](#configuration-and-lifecycle)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="configuration-and-lifecycle"></a>
## Configuration and lifecycle

`preset` selects the preset identity and `tools` lists permitted inherited names. Restrictions are installed after Agent creation, updated on preset switches and removed when the Agent or plugin is disposed. Applying them at the Agent scope permits that Agent’s inherited preset tools while filtering ambient tools.

<a id="model-experience"></a>
## Model Experience

### Preset tool visibility

#### What the model sees

The model sees only permitted inherited tools: `read`, `grep` and `glob` for review, or `ssh_exec` for SSH. The policy adds no prompt text.

#### Token effect

Removing tools removes their descriptions and parameter declarations from each request.

#### KV Cache effect

Changing the allowlist changes the tool prefix; an unchanged allowlist remains stable across turns.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The policy does not restrict capabilities registered later directly inside the Agent scope. Executor-level checks still enforce SSH target grants and file-read-only behavior. This plugin is not an operating-system sandbox.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
