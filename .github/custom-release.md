# Custom application releases

English | [中文](custom-release.zh.md)

The custom release workflow builds Windows x64, macOS ARM64, macOS x64, and the Android companion from one existing `custom-v` tag. It creates a draft after all four cloud builds succeed; local Android signing completes and publishes that draft. It never overwrites existing Release assets. Desktop packages are unsigned; macOS packages are not notarized. There is no iOS target because this repository does not contain an iOS client.

## Prepare a release

Merge the desired official `dsh-v` release into the custom branch, adapt custom features, and pass their focused checks and the normal push hooks. Retain both the upstream tag and custom history. Tag the verified commit as `custom-v<base>.YYYYMMDD.index` for a prerelease base, or `custom-v<base>-test.YYYYMMDD.index` for a stable base. Use the release creation date in Asia/Shanghai and an index from 1 to 99. Push the tag to start the workflow, or manually dispatch an existing tag. The workflow verifies that the tag matches the checked-out commit and includes the official release ancestor.

Android uses the same displayed version and a monotonically increasing `YYYYMMDDxx` version code. Cloud runners receive no signing credentials and retain an unsigned APK as a workflow artifact and an unpublished draft asset. On the owner's Windows machine, set `DSH_ANDROID_KEYSTORE`, `DSH_ANDROID_PASSWORD_FILE`, `ANDROID_HOME`, `JAVA_HOME`, and `DSH_CUSTOM_UPDATE_PRIVATE_KEY`, then run `node .github/scripts/custom-sign-android.mjs <tag> <run-id>`. The helper verifies source identities, download checksums and APK metadata, signs with the existing `dsh-companion` identity, verifies the APK, uploads the signed APK and final checksums, removes the unsigned draft asset, and publishes the draft. Set `DSH_ANDROID_BASELINE_APK` to the prior installer to verify upgrade signing continuity. Credentials remain local; changing the signing identity prevents an in-place upgrade.

## Downloads and updates

Each successful Release contains four installers, `SHA256SUMS.txt`, and a signed `update.json`. Failed runs retain Desktop diagnostics for fourteen days. The draft remains unpublished until local signing completes. Cloud builds reject an already published tag instead of replacing downloads. Rerunning local completion may verify the existing release and repair its signed channel pointer without replacing installers. Use a new version for changed source. Custom builds embed the public update-verification key and use the `custom-updates` Release as their signed update pointer. Windows retains the existing official mandatory-policy endpoint. Windows downloads verified installers in the background and offers restart installation when tasks are idle; unsigned macOS downloads verified DMGs and guides the user through replacement in Finder. These packages must not be represented as signed official releases.


## Custom update trust

Cloud builds create `UPDATE-PAYLOAD.json` with source identity and artifact SHA-256/SHA-512 hashes. Local completion checks the successful source run and artifact digests, replaces the unsigned Android entry with its locally signed APK, signs the final metadata with Ed25519, and removes the intermediate payload. Only after the immutable release is public does it advance `custom-updates/update.json`. No private key or GitHub access token is embedded in the application.

Keep the update private key backed up locally. Its public counterpart is pinned in `apps/desktop/src/custom-update-key.ts`; replacing the private key alone cannot update existing installations. Existing installations without this channel need one manual bootstrap upgrade. Download completion never grants permission to interrupt active work: restart installation still requires confirmation, including a reminder to save unsent drafts. The unsigned macOS build does not claim platform-native automatic replacement.
