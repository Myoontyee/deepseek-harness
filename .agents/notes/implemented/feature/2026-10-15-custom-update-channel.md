# Agent Note: Signed custom application update channel

Status: implemented

English | [中文](2026-10-15-custom-update-channel.zh.md)

## Problem

Users of the custom build repeatedly locate and install release files manually. An official updater feed cannot represent the retained custom patches, and an unsigned mutable feed alone provides no independent installer authenticity.

## Decision

Custom packages carry a pinned Ed25519 public key and a fixed public GitHub update endpoint. Only the locally held private key can authorize a release manifest. The verifier rejects unknown fields, invalid signatures, duplicate targets, mismatched filenames and unsupported architectures, and constructs immutable repository URLs rather than trusting a remote URL field. Windows keeps the existing NSIS updater and task-aware restart confirmation. macOS verifies and downloads a DMG, then offers a Finder handoff without stopping the running application. The existing mandatory-update policy is retained.

Local release completion signs metadata after Android signing and artifact verification. It publishes immutable assets before advancing the mutable channel pointer and refuses version regressions. Clients automatically download checked newer versions and offer installation only while the window is visible and work is idle. Dismissing the offer does not reopen it repeatedly for the same version.

## Alternatives considered

Embedding a GitHub access token in clients would distribute a credential unnecessarily. An unauthenticated checksum file would not establish independent release authority. Replacing an unsigned macOS application with custom shell scripts would expand installer scope beyond the supported platform mechanism.

## Consequences

Old installations need a manual bootstrap upgrade once. Private signing keys stay on the owner's machine and need local backups; cloud builds remain drafts until local signing completes. Windows installers still lack Authenticode signatures and macOS DMGs remain unsigned and unnotarized. Feed signing authenticates update metadata and package hashes, not OS publisher identity. Restart still asks the user to preserve unsent annotation drafts.
