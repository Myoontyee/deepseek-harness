# Custom application releases

English | [中文](custom-release.zh.md)

The custom release workflow builds Windows x64, macOS ARM64, macOS x64, and the Android companion from one existing `custom-v` tag. It creates a draft after all four cloud builds succeed; local Android signing completes and publishes that draft. It never overwrites existing Release assets. Desktop packages are unsigned; macOS packages are not notarized. There is no iOS target because this repository does not contain an iOS client.

## Prepare a release

Merge the desired official `dsh-v` release into the custom branch, adapt custom features, and pass their focused checks and the normal push hooks. Retain both the upstream tag and custom history. Tag the verified commit as `custom-v<base>.YYYYMMDD.index` for a prerelease base, or `custom-v<base>-test.YYYYMMDD.index` for a stable base. Use the release creation date in Asia/Shanghai and an index from 1 to 99. Push the tag to start the workflow, or manually dispatch an existing tag. The workflow verifies that the tag matches the checked-out commit and includes the official release ancestor.

Android uses the same displayed version and a monotonically increasing `YYYYMMDDxx` version code. Cloud runners receive no signing credentials and retain an unsigned APK as a workflow artifact. On the owner's Windows machine, set `DSH_ANDROID_KEYSTORE`, `DSH_ANDROID_PASSWORD_FILE`, `ANDROID_HOME`, and `JAVA_HOME`, then run `node .github/scripts/custom-sign-android.mjs <tag> <run-id>`. The helper verifies source identities, signs with the existing `dsh-companion` identity, verifies the APK, uploads the signed APK and final checksums, and publishes the draft. Credentials remain local; changing the signing identity prevents an in-place upgrade.

## Downloads and updates

Each successful Release contains four installers and `SHA256SUMS.txt`. Failed runs retain Desktop diagnostics for fourteen days. The draft remains unpublished until local signing completes. Rerunning an already published tag fails instead of replacing downloads. Use a new version for changed source. GitHub Release publication does not configure an in-app updater; Windows retains the existing official mandatory-policy endpoint, and unsigned macOS builds use upstream local packaging defaults. These packages must not be represented as signed official releases.
