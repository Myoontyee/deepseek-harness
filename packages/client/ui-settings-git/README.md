---
description: "Visual Git workspace operations and persisted Git preferences"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-git

English | [中文](README.zh.md)

## Summary

The Git settings section combines registered-project selection, repository status, diffs, history, staging, commits, branch operations and GitHub account/PR controls. It calls the [Git controller](../../api/git-controller/README.md) through authenticated Remote operations.

## Table of Contents

- [Use this package](#use-this-package)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Open Settings → Git and choose a registered project. File selection is separate from diff selection. Stage or unstage the checked files, inspect the staged diff and commit with a message. New branches use the saved prefix. Fetch, pull and push name explicit user actions; publishing an untracked branch is labeled with `origin`. The GitHub panel supports device-code sign-in, PR listing and creation, and a merge confirmation showing the target branch, head commit and selected merge method.

Preferences use `configForms` and the `git-controller` namespace. Operation notices live in a shell overlay, so changing pages does not lose completion feedback. Requests use generation checks to prevent an older project response from replacing newer state. Colors use theme tokens.

<a id="further-exploration"></a>
## Further Exploration

See [settings](../ui-settings/README.md), [slots](../../../docs/subsystems/slots.md) and the [Git controller](../../api/git-controller/README.md).

<a id="model-experience"></a>
## Model Experience

None, as the settings pages delegate review context and execution to Host controllers.

#### KV Cache effect

The interface and calls do not directly change model request prefixes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The page lists registered local projects; an ungrouped conversation alone does not create a project registration. GitHub login requires a browser and an available GitHub CLI. The PR panel has no always-on cloud worker or automatic publication. The controller README owns operation and credential-storage limitations.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
