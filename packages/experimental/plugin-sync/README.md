# @deepseek-ai/dsh-experimental-plugin-sync

Phase 0 of tailnet device synchronization: **read-only profile inventory and dry-run diff**. It does not install, remove, or write any profile file.

## Enable

The command is gated:

```bash
DSH_DEVICE_SYNC=1 node --import tsx/esm packages/experimental/plugin-sync/src/cli.ts inventory --profile desktop
DSH_DEVICE_SYNC=1 node --import tsx/esm packages/experimental/plugin-sync/src/cli.ts diff --source /tmp/source.json --target-profile desktop --target-dsh-home /path/to/other/.dsh
```

`inventory --out <file>` writes only the explicitly requested report. `diff` exits `2` when the target base version differs or `--strict` finds unsupported/inventory-only carriers.

## Carrier matrix (Phase 0)

| Carrier | Phase 0 status | Note |
|---|---|---|
| Registry npm package (`name@version`) | supported | Reinstall from the registry in a later phase; pinned version + integrity required. |
| Local `file:` tgz | inventory-only | Hash and size are recorded, but there is no canonical Gitea artifact URL yet. Must be published with URL + SHA256 before apply. |
| `link:` directory | **unsupported** | Never copied or followed. Replace with a Gitea tarball or git commit. |
| `workspace:*` dependency | **unsupported** | Publish as a tarball; workspace protocol is not portable. |
| Host-bundled profile bundle | supported | The receiving Host must provide the same bundled package. |
| `cordis.patch.yml` / profile patch files | supported | Hashed; later phases copy only after staging and backup. |
| `~/.dsh/config.yaml` | inventory-only | Only hash and secret-like **key names** are reported; values are never exported. |
| Regular `~/.dsh/skills` entry | supported | Content hash recorded; actual copy is a later phase. |
| Symlinked skill | **unsupported** | Symlink target is reported; content is not followed. |
| `~/.dsh/.agent-presets` | supported | Content hash recorded; actual copy is a later phase. |
| `.credentials.yaml`, device grants, backups | excluded | Never inventoried or exported. |

## Safety

- Reads only; the profile is never modified.
- Base-version mismatch is a hard rejection (`TARGET_BASE_VERSION_MISMATCH`), not a silent skip.
- Unsupported carriers are reported with a manual action; they are not silently ignored.
