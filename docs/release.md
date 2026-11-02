# Releases

**A `v*` tag builds a release** (`.github/workflows/release.yml`,
`electron-builder.yml`): a Windows installer and a zip, carrying no game data.
The notes are the matching section of `CHANGELOG.md` — so a version is written
up THERE before it is tagged, and the workflow refuses if the tag,
`package.json` and that file disagree.

**A change does not edit `CHANGELOG.md`.** Every change appending its own line
would make it a hot file. The section is written once, when a version is cut,
from the merged pull requests since the last tag.
