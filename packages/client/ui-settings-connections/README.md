---
description: "Saved SSH connections and remote conversation entry points"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-connections

English | [中文](README.zh.md)

## Summary

Connections settings for saved OpenSSH servers. Displays discovered aliases, saves names and POSIX directories, tests authentication, and opens a remote terminal or dedicated SSH conversation.

## Table of Contents

- [Composition](#composition)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="composition"></a>
## Composition

Requires the authenticated `connections` remote, settings forms, locale, workspace navigation and terminal sidebar. Preferences use framework-managed subscriptions. A pending terminal is revealed only when its owning Session surface has mounted. No private keys or passwords are collected by this page.

<a id="model-experience"></a>
## Model Experience

None, as the connection controller and SSH preset own model context and command execution.

#### KV Cache effect

The interface and calls do not directly change model request prefixes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- New server aliases must first exist in OpenSSH configuration. AI commands require explicit saved permission and a POSIX shell. The conversation runs locally; paired-device control and persistent remote Agents are separate capabilities. A test result describes the last probe, not a continuous health monitor.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
