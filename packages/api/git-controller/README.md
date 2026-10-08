---
description: "Workspace-scoped Git operations and GitHub workflow for Desktop"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-git-controller

English | [中文](README.zh.md)

## Summary

`ctx.gitController` exposes authenticated `remote.git` operations for registered local workspaces. Commands use the managed subprocess provider with explicit argument arrays, bounded output and deadlines. Git and GitHub CLI executables are configurable.

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

Mount the controller with `typert`, `workspaceRegistry` and `subprocess`. The Web application bundle supplies the controller and its [settings UI](../../client/ui-settings-git/README.md). Repository status carries a revision derived from HEAD, porcelain status and index entries. Stage, unstage, commit, branch and network operations reject stale revisions and serialize by repository root. Unstaging preserves working files; commits never stage or amend implicitly. Pulls are fast-forward only. A branch without an upstream is published explicitly to `origin`; no force push occurs.

GitHub browser login exposes a device code and a fixed authorization URL, never an access token. Cancelling the stream terminates the login command. PR creation uses the saved draft preference; PR merge names the exact reviewed head commit and uses the saved merge method. A refused immediate merge does not enable automatic merge. Preferences use the existing Host settings service.

<a id="understand-the-implementation"></a>
## Understand the implementation

`commands.ts` owns process lifetime and complete-output checks. `parse.ts` decodes NUL-delimited status records, including rename source paths. `auth.ts` bounds and cancels one Host login attempt. `index.ts` resolves registered workspaces, exposes Remote methods and fences mutations. Git network commands append GitHub CLI as a GitHub-only credential helper for that invocation, after existing helpers. This enables a newly authorized GitHub account when no earlier helper supplies credentials, without rewriting global Git configuration. Existing helpers still take priority.

<a id="further-exploration"></a>
## Further Exploration

See [API Gateway](../../../docs/api-gateway.md) for authenticated transport, [subprocess](../../subprocess/subprocess/README.md) for process containment, and [settings](../../settings/settings/README.md) for preference persistence.

<a id="model-experience"></a>
## Model Experience

None, as this controller exposes authenticated Git operations and the review consumer owns model context.

#### KV Cache effect

The interface and calls do not directly change model request prefixes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Git operations use the Host's local workspaces. Untracked file diff previews require staging first. Status snapshots are not a filesystem transaction against external Git processes. A process timeout may occur after a mutation committed; callers must refresh before retrying. GitHub CLI owns credential storage and may fall back to its configuration file if the operating-system credential store is unavailable. GitHub network operations still depend on the configured CLI, credential helper and connectivity.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
