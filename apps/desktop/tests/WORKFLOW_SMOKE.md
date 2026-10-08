# Desktop workflow smoke

Prepare the Windows Desktop build and runtime, then run `node --import tsx/esm apps/desktop/tests/workflow-smoke.mjs` from the repository root. The test starts the actual application with an isolated profile and temporary Git repositories. Only the external model and SSH processes are replaced by fixture providers. No online model request, GitHub mutation or real server command is issued.

Assertions cover persisted review context and read-only tools, visual staging/commit/branch creation, saved connection preferences, interactive terminal input/output, pinned SSH commands, read-only refusal and revocation. Screenshots and a JSON result are retained under `.artifacts`. The application exits in `finally`; assertion failures do not leave its windows running.
