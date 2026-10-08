---
description: "Saved OpenSSH connections, bounded remote commands and interactive terminals"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-connection-controller

English | [中文](README.zh.md)

## Summary

Saved OpenSSH aliases, connection probes and dedicated remote-control Sessions. The Web settings consumer is `@deepseek-ai/dsh-client-ui-settings-connections`; the SSH preset uses the `remote-tools` entry.

## Table of Contents

- [Configuration](#configuration)
- [Operations](#operations)
- [Source reuse](#source-reuse)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="configuration"></a>
## Configuration

`profiles` stores display labels, POSIX working directories and explicit AI command grants. `sshExecutable` selects OpenSSH; `sshConfigPath` optionally selects a configuration file. Empty `controlRoot` resolves under the running Host’s DSH home, never the build machine. Discovery file/byte limits, process deadlines and output limits are deployment settings.

Aliases are discovered from config files; OpenSSH `-G` resolves the actual endpoint. Session bindings pin alias, hostname, username, port and directory in the `ssh_connections` v1 storage domain. Private-key contents and passwords are not stored. Existing host-key trust is required; neither probes nor tools accept new keys automatically.

<a id="operations"></a>
## Operations

The authenticated `connections` API lists aliases, reads preferences, tests access with a fixed command and opens a dedicated conversation or interactive terminal. Stable request IDs deduplicate an in-flight open and reuse its Session identity. Each AI command checks the live Agent, stored target, current saved grant and full-access permission; removing a grant blocks later commands. Interactive terminals are user-owned and separate from Agent tools.

The `ssh_exec` tool accepts only a command, never a new host or credential. Commands run through managed subprocesses, in separate POSIX shells. Abort and Host disposal terminate and join the local SSH process; timeout/disconnection cannot establish the remote process outcome. Results report bounded stdout/stderr, exit status, truncation and timeout. No local execution fallback exists.

<a id="source-reuse"></a>
## Source reuse

Alias discovery is adapted from Yan-Zero/dsh-remote-ssh. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [Apache-2.0](LICENSES/Apache-2.0.txt).

<a id="model-experience"></a>
## Model Experience

### Remote target and commands

#### What the model sees

SSH Sessions receive their saved label and directory in logged context and expose only `ssh_exec`. Each result contains bounded output and flags unknown remote outcomes after interrupted transport.

#### Token effect

The target contributes one short context entry. Command results are bounded by the configured per-stream byte limit.

#### KV Cache effect

Target context is stable for the Session. Commands append ordinary tool history; profile changes do not rewrite earlier requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The Agent runs on the local Host. Closing DSH does not leave a persistent remote Agent. AI commands require a POSIX remote shell; Windows remote shell support and paired-device control are separate work. Alias discovery is a bounded hint, not a replacement for OpenSSH evaluation. Config includes exceeding limits are reported. Saved binding records currently remain with local application data after Session deletion.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
