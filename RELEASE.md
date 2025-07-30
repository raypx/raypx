# Release Process

This document describes the release process for the Raypx project using Changesets.

## Overview

The release process consists of two main workflows:

1. **Version Workflow**: Triggered on `main` branch pushes - creates version PRs
2. **Release Workflow**: Triggered on tag pushes - publishes packages and creates GitHub releases

## Release Steps

### 1. Create a Changeset

When you make a change that should be included in the next release, create a changeset:

```bash
pnpm changeset
```

This will prompt you to:
- Select which packages have changed
- Choose the type of change (major, minor, patch)
- Write a description of the change

### 2. Commit and Push Changes

```bash
git add .
git commit -m "feat: add new feature"
git push origin main
```

### 3. Version PR Creation

When you push to `main`, GitHub Actions will automatically:
- Check if there are any changesets
- Create a "Release: Version Packages" PR with updated versions
- Update CHANGELOG files

### 4. Merge Version PR

Review and merge the version PR. This will:
- Update package versions
- Update CHANGELOG files
- Commit the changes to `main`

### 5. Create Release Tag

After the version PR is merged, create a release tag:

```bash
pnpm release:tag
```

This script will:
- Read the current version from `package.json`
- Create a git tag (e.g., `v1.0.0`)
- Push the tag to GitHub

### 6. Automatic Release

When the tag is pushed, GitHub Actions will automatically:
- Build all packages
- Publish to npm (if configured)
- Create a GitHub release

## Manual Commands

### Create a changeset
```bash
pnpm changeset
```

### Apply changesets (update versions)
```bash
pnpm changeset:version
```

### Publish packages
```bash
pnpm changeset:publish
```

### Create release tag
```bash
pnpm release:tag
```

## Configuration

### NPM Publishing

To enable npm publishing, add `NPM_TOKEN` to your GitHub repository secrets:

1. Go to your repository settings
2. Navigate to "Secrets and variables" → "Actions"
3. Add a new secret named `NPM_TOKEN` with your npm token

### Private Packages

If your packages are private, update `.changeset/config.json`:

```json
{
  "access": "restricted"
}
```

For public packages, change it to:

```json
{
  "access": "public"
}
```

## Troubleshooting

### Tag already exists
If a tag already exists, the `release:tag` script will skip creation and inform you.

### Failed CI builds
Check the GitHub Actions logs for detailed error messages. Common issues:
- Missing npm token for publishing
- Build failures
- Test failures

### Emergency releases
For hotfixes, you can manually create tags:

```bash
git tag v1.0.1
git push origin v1.0.1
```