# Agent Note: Persistent discussions and explicit assistant memory

Status: implemented

English | [中文](2026-10-15-persistent-discussions.zh.md)

## Problem

Users need to discuss a passage beside a main conversation without losing the discussion when its pane closes. Copying the entire parent history into every topic wastes storage and repeats irrelevant context. A saved assistant identity should not imply an always-running model or automatic retention of every assertion as a fact.

## Decision

Each topic records its parent, an original quotation and an independent native Session. The existing Session store owns messages and attachment references. Closing, resolving and archiving retain history. A topic carries a parent link for the existing paginated read-only transcript tool rather than copying the parent history. Returning a conclusion inserts user-reviewed text and a link into the parent draft without sending it or waking its Agent.

Saved assistants have persistent names and responsibilities but no background execution loop. Temporary, project and resident templates select off, project-only and assistant-plus-current-project memory respectively; users can override memory independently. Only explicit saves create memory entries. The existing logged system-context pipeline includes bounded confirmed notes, and variable interpolation is disabled to preserve quotations literally. Initial topic permissions are read-only; ordinary explicit permission controls remain available.

## Alternatives considered

The community's temporary side-task design deletes tasks after use, which conflicts with retaining discussions. Automatically forking full parent histories increases both storage and irrelevant context. Automatically extracting durable facts from every message would promote mistakes and tentative ideas without review. A standing multi-agent chat would also introduce dispatch, loop and budget behavior beyond a single sidebar discussion.

## Consequences

The first version provides manual refresh and one selected assistant per topic. Search, unread counts, automatic memory extraction and multi-member dispatch remain separate work. Confirmed memory can be edited, disabled or deleted without deleting conversations. Project matching uses the exact Host workspace identity. Revision checks preserve concurrent profile and memory edits; topic creation has an idempotency key. Creating and browsing topics need no model step.
