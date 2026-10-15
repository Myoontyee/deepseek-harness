# Agent Note: Link-preserving content copying

Status: implemented

English | [中文](2026-10-15-link-preserving-clipboard.zh.md)

## Problem

Content-only copying removes link destinations, so a selected file label or documentation link cannot be reused outside the conversation. Restoring every Markdown style would contradict the user's preference for unstyled prose.

## Decision

Selection and complete-message copying retain Markdown links, TeX formulas and Markdown table cells. Headings, emphasis, list markers and code fences remain omitted. Link labels contain only the selected visible content; escaping preserves literal brackets and destination delimiters. Whole-message source projection resolves reference-style links using the first matching definition. Unsupported URL schemes remain plain labels.

The clipboard contains text/plain only. Explicit paste-as-text in the DSH composer removes link markup along with the existing math and table flattening. Secret masking and annotation quotations retain their existing behavior.

## Alternatives considered

Rich HTML clipboard payloads can reintroduce font styling and duplicated formula glyphs. Copying every original Markdown marker would restore unwanted styling. Label-only links lose the destination the user wants to reuse.

## Consequences

Markdown-aware destinations can reconstruct links from pasted text. Other editors receive literal Markdown link text. Existing selection, full-message, formula, table, masking and plain-paste tests cover the distinct paths.
