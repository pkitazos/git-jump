# Release Instructions

## Publish new NPM package

1. Update `CHANGELOG.md`, `help.txt`, and `git-jump.1` if needed
2. Commit changes
3. `pnpm version <major | minor | patch>`
4. `git push origin HEAD --tags`
5. `pnpm publish --access public`

## Update Homebrew formula with new version

1. Check that the registry has published the new version: `pnpm view @pkitazos/git-jump dist.tarball`
2. Get the SHA256 of the latest package by running `./latest-sha256.sh`
3. Go to the folder containing your Homebrew tap repository (e.g., `homebrew-git-jump`)
4. Insert the new package version and SHA hash into `git-jump.rb`
5. Commit changes
6. `git push origin HEAD`

## Create new release on GitHub

1. Go to GitHub and create a new release based on the new tag
2. Describe what has changed in the new version (you can simply copy the relevant entry from your `CHANGELOG.md`)
