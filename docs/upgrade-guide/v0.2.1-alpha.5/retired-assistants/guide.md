---
kind: upgrade-guide
description: "Saved assistant creation, mentions and sidebar discussions are removed from the custom desktop build."
---

# Saved assistants and sidebar discussions retired

English | [中文](guide.zh.md)

## Change

The custom desktop no longer offers saved assistant settings, assistant @ candidates, discussion panels or selection-menu discussion actions. The discussion API retains historical read operations but removes creation and mutation methods. Stored profiles, explicit notes and native conversation logs are preserved. Historical reply labels remain readable.

## Migration

1. Install the new custom desktop over the existing installation without deleting the Harness data directory.
2. Continue previous discussion conversations through the ordinary conversation list. The first continuation of a previously selected assistant restores the captured ordinary model and ends the old role; subsequent explicit model choices take precedence.
3. Stop calling the retired assistant and topic mutation APIs. Use ordinary conversation model selection and messages.
4. Confirm that Saved assistants is absent from Settings, the discussion actions are absent and existing conversation history is still readable.
