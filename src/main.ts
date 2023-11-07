import * as core from '@actions/core'
import * as github from '@actions/github'
import { Octokit } from '@octokit/rest'

export async function run(): Promise<void> {
  try {
    const token = core.getInput('github-token', { required: true })
    const label = core.getInput('label', { required: false }) || 'autobase'
    const requiredApprovals: number = parseInt(
      core.getInput('required-approvals', { required: false }) || '0',
      10
    )
    const octokit = new Octokit({ auth: token })

    const { context } = github
    const { owner, repo } = context.repo

    const repoInfo = await octokit.rest.repos.get({
      owner,
      repo
    })
    const defaultBranch = repoInfo.data.default_branch

    const baseBranch =
      core.getInput('base-branch', { required: false }) || defaultBranch

    if (context.eventName === 'pull_request') {
      const pullRequest = context.payload.pull_request
      if (!pullRequest) {
        core.setFailed('Event payload missing `pull_request`')
        return
      }

      const wasMerged = pullRequest.merged
      const baseRef = pullRequest.base.ref

      if (wasMerged && baseRef === baseBranch) {
        await rebaseNextPullRequest(
          octokit,
          owner,
          repo,
          label,
          requiredApprovals,
          baseBranch
        )
      }
    } else if (context.eventName === 'check_suite') {
      const checkSuite = context.payload.check_suite
      if (!checkSuite) {
        core.setFailed('Event payload missing `check_suite`')
        return
      }

      const { action, check_suite } = context.payload

      if (action === 'completed' && check_suite.conclusion !== 'success') {
        const { pull_requests } = check_suite

        if (pull_requests.length === 0) {
          core.info('No pull requests are associated with the check suite.')
          return
        }

        for (const pr of pull_requests) {
          // Get the full PR object to access its labels
          const { data: fullPr } = await octokit.rest.pulls.get({
            owner: context.repo.owner,
            repo: context.repo.repo,
            pull_number: pr.number
          })

          // Check if the PR has the specified label
          const hasLabel = fullPr.labels.some(
            fullPrLabel => fullPrLabel.name === core.getInput('label')
          )

          if (!hasLabel) {
            core.info(
              `Skipping check suite for PR #${
                pr.number
              } since it does not have the label '${core.getInput('label')}'.`
            )
            continue
          }

          await rebaseNextPullRequest(
            octokit,
            owner,
            repo,
            label,
            requiredApprovals,
            baseBranch
          )
        }
      } else {
        core.info(
          `Ignoring a check_suite event with a ${action} action and ${checkSuite.conclusion} conclusion`
        )
      }
    } else {
      core.setFailed(
        `This action only supports pull_request and check_suite events.`
      )
    }
  } catch (error) {
    core.setFailed(`Action failed with error: ${error}`)
  }
}

async function rebaseNextPullRequest(
  octokit: Octokit,
  owner: string,
  repo: string,
  label: string,
  requiredApprovals: number,
  baseBranch: string
): Promise<void> {
  const { data: pullRequests } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'open',
    base: baseBranch,
    sort: 'created',
    direction: 'asc'
  })

  for (const pr of pullRequests) {
    if (!pr.labels.map(prLabel => prLabel.name).includes(label)) {
      core.info(`PR #${pr.number} is not labeled with '${label}'.`)
      continue
    }

    if (pr.draft) {
      core.info(`PR #${pr.number} is a draft PR.`)
      continue
    }

    const { data: prData } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pr.number
    })

    if (prData.mergeable_state !== 'behind') {
      core.info(
        `PR #${pr.number} is not 'behind' (was '${prData.mergeable_state}').`
      )
      continue
    }

    if (!prData.rebaseable) {
      core.info(`PR #${pr.number} is not rebaseable.`)
      continue
    }

    if (requiredApprovals > 0) {
      const { data: reviews } = await octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: pr.number
      })

      const approvalCount = reviews.filter(
        review => review.state === 'APPROVED'
      ).length
      if (approvalCount < requiredApprovals) {
        core.info(
          `PR #${pr.number} requires ${requiredApprovals} approvals, but only has${approvalCount}.`
        )
        continue
      }
    }

    try {
      const { data: rebaseResult } = await octokit.rest.pulls.updateBranch({
        owner,
        repo,
        pull_number: pr.number,
        expected_head_sha: pr.head.sha,
        update_method: 'rebase'
      })

      core.info(`Rebased PR #${pr.number}: ${rebaseResult.url}`)
      return
    } catch (error) {
      core.setFailed(`Failed to rebase PR #${pr.number}: ${error}`)
      continue
    }
  }
}

run()
