# Autobase Action

This GitHub Action automatically rebases pull requests in your repository when certain conditions are met.

[![GitHub Super-Linter](https://github.com/actions/typescript-action/actions/workflows/linter.yml/badge.svg)](https://github.com/super-linter/super-linter)
![CI](https://github.com/actions/typescript-action/actions/workflows/ci.yml/badge.svg)
[![Check dist/](https://github.com/actions/typescript-action/actions/workflows/check-dist.yml/badge.svg)](https://github.com/actions/typescript-action/actions/workflows/check-dist.yml)
[![CodeQL](https://github.com/actions/typescript-action/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/actions/typescript-action/actions/workflows/codeql-analysis.yml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

## What this action does

When a pull request is merged, this action checks for other open pull requests that are labeled with a specific tag (by default `autobase`). If the merged pull request's base is the repository's default branch and other conditions (like required approvals) are met, the action will attempt to rebase the next available pull request starting with the oldest of the pull requests. If that fails it moves on to the next one, until one succeeds or there are no more pull requests to try to rebase.

## Inputs

| Input                  | Description                                                 | Required | Default |
|------------------------|-------------------------------------------------------------|:--------:|---------|
| `github-token`         | The GitHub token used to authenticate requests.             |   Yes    |   N/A   |
| `label`                | The label which the pull request must have to be rebased.   |   No     | autobase|
| `required-approvals`   | The number of approvals required before rebasing.           |   No     |   0     |
| `base-branch`          | The base branch to check for before rebasing.               |   No     | default branch of the repository |

## Outputs

_None. This action does not set any outputs._

## Token Permissions

To use this action, you must provide a `github-token` with the appropriate permissions. GitHub does not trigger new workflow runs on events caused by the default `GITHUB_TOKEN` for actions ([see here for more info](https://docs.github.com/en/actions/using-workflows/triggering-a-workflow#triggering-a-workflow-from-a-workflow)). Therefore, you need to create a Personal Access Token (PAT) with the required scopes and use it within your workflow to circumvent this limitation.

### Creating a Personal Access Token (PAT)

1. Go to your GitHub settings.
2. Under Developer settings, choose Personal Access Tokens.
3. Generate a new token with at least the `repo` scope for public repositories, or the `repo` and `workflow` scopes for private repositories.
4. Save the generated token, as you will not be able to view it again.

### Using the Personal Access Token in your workflow

After creating your PAT, you should store it as a secret in your repository:

1. Go to your repository's Settings tab.
2. Click on Secrets in the left sidebar.
3. Add a new secret with the name `AUTOBASE_TOKEN` and paste your PAT as the value.

Note: It is crucial to keep your PAT secure. Use it only when necessary and do not share it publicly.

## Example usage

```yml
name: Auto Rebase

on:
  pull_request:
    types: [closed]

jobs:
  rebase:
    runs-on: ubuntu-latest
    if: github.event.pull_request.merged == true
    steps:
    - name: Checkout
      uses: actions/checkout@v4
      with:
        token: ${{ secrets.AUTOBASE_TOKEN }}

    - name: Auto Rebase
      uses: eygraber/autobase@v1
      with:
        github-token: ${{ secrets.AUTOBASE_TOKEN }}
```
