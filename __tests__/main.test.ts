import * as core from '@actions/core'
import * as github from '@actions/github'
import { run } from '../src/main'

jest.mock('@actions/core', () => ({
  getInput: jest.fn().mockImplementation((name: string) => {
    switch (name) {
      case 'github-token':
        return 'test-token'
      case 'label':
        return 'autobase'
      case 'required-approvals':
        return '0'
      case 'base-branch':
        return ''
      default:
        return ''
    }
  }),
  setFailed: jest.fn(),
  info: jest.fn(),
  error: jest.fn()
}))

const mockListPulls = jest.fn()
const mockGetPull = jest.fn()
const mockUpdateBranch = jest.fn()
const mockListReviews = jest.fn()
const mockRepoGet = jest.fn().mockImplementation(() => {
  return {
    data: {
      default_branch: 'master'
    }
  }
})

const mockOctokit = {
  rest: {
    pulls: {
      list: mockListPulls,
      get: mockGetPull,
      updateBranch: mockUpdateBranch,
      listReviews: mockListReviews
    },

    repos: {
      get: mockRepoGet
    }
  }
}

jest.mock('@octokit/rest', () => {
  return {
    Octokit: jest.fn().mockImplementation(() => {
      return mockOctokit
    })
  }
})

jest.mock('@actions/github', () => ({
  context: {
    repo: {
      owner: 'owner',
      repo: 'repo'
    },
    payload: {
      action: 'completed',
      pull_request: {
        number: 1,
        merged: true,
        base: {
          ref: 'master'
        },
        head: {
          sha: 'abc123'
        }
      },
      check_suite: {
        conclusion: 'failure',
        pull_requests: [
          {
            number: 1
          }
        ]
      },
      getOctokit: jest.fn().mockImplementation(() => {
        return mockOctokit
      })
    },
    eventName: 'pull_request'
  }
}))

describe('Auto Rebase Action', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('Use default input values', async () => {
    if (github.context.payload.pull_request) {
      github.context.payload.pull_request.base.ref = 'main'
    }

    jest
      .spyOn(core, 'getInput')
      .mockImplementationOnce(() => 'test-token')
      .mockImplementationOnce(() => '')
      .mockImplementationOnce(() => '')
      .mockImplementationOnce(() => '')

    mockRepoGet.mockResolvedValueOnce({
      data: {
        default_branch: 'main'
      }
    })

    mockListPulls.mockResolvedValueOnce({
      data: [
        {
          number: 2,
          labels: [{ name: 'autobase' }],
          draft: false,
          mergeable_state: 'behind',
          head: { sha: 'def456' }
        }
      ]
    })

    mockGetPull.mockResolvedValueOnce({
      data: {
        rebaseable: true,
        mergeable_state: 'behind'
      }
    })

    mockUpdateBranch.mockResolvedValueOnce({
      data: {
        url: 'https://api.github.com/repos/owner/repo/pulls/2'
      }
    })

    await run()

    expect(mockListReviews).not.toHaveBeenCalled()
    expect(mockListPulls).toHaveBeenCalledTimes(1)
    expect(mockGetPull).toHaveBeenCalledTimes(1)
    expect(mockUpdateBranch).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      pull_number: 2,
      expected_head_sha: 'def456',
      update_method: 'rebase'
    })

    if (github.context.payload.pull_request) {
      github.context.payload.pull_request.base.ref = 'master'
    }
  })

  it('Does not rebase when the event is not supported', async () => {
    github.context.eventName = 'some-event'

    await run()

    expect(mockListPulls).not.toHaveBeenCalled()
    expect(mockUpdateBranch).not.toHaveBeenCalled()
    expect(core.setFailed).toHaveBeenCalledWith(
      'This action only supports pull_request and check_suite events.'
    )

    github.context.eventName = 'pull_request'
  })

  it('Rebases the next PR correctly when a PR is merged into the default branch', async () => {
    mockListPulls.mockResolvedValueOnce({
      data: [
        {
          number: 2,
          labels: [{ name: 'autobase' }],
          draft: false,
          mergeable_state: 'behind',
          head: { sha: 'def456' }
        }
      ]
    })

    mockGetPull.mockResolvedValueOnce({
      data: {
        rebaseable: true,
        mergeable_state: 'behind'
      }
    })

    mockUpdateBranch.mockResolvedValueOnce({
      data: {
        url: 'https://api.github.com/repos/owner/repo/pulls/2'
      }
    })

    await run()

    expect(mockListPulls).toHaveBeenCalledTimes(1)
    expect(mockGetPull).toHaveBeenCalledTimes(1)
    expect(mockUpdateBranch).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      pull_number: 2,
      expected_head_sha: 'def456',
      update_method: 'rebase'
    })
  })

  it('Prints the PR that will be evaluated', async () => {
    mockListPulls.mockResolvedValueOnce({
      data: [
        {
          number: 2,
          labels: [{ name: 'autobase' }],
          draft: false,
          mergeable_state: 'behind',
          head: { sha: 'abc456' }
        }
      ]
    })

    await run()

    expect(mockListPulls).toHaveBeenCalledTimes(1)
    expect(core.info).toHaveBeenCalledWith('Evaluating the following PRs: #2')
  })

  it('Prints the PRs that will be evaluated', async () => {
    mockListPulls.mockResolvedValueOnce({
      data: [
        {
          number: 2,
          labels: [{ name: 'autobase' }],
          draft: false,
          mergeable_state: 'behind',
          head: { sha: 'abc456' }
        },
        {
          number: 3,
          labels: [{ name: 'autobase' }],
          draft: false,
          mergeable_state: 'behind',
          head: { sha: 'def456' }
        }
      ]
    })

    await run()

    expect(mockListPulls).toHaveBeenCalledTimes(1)
    expect(core.info).toHaveBeenCalledWith(
      'Evaluating the following PRs: #2, #3'
    )
  })

  it('Rebases the next PR correctly when a check suite does not succeed for a PR with the specified label', async () => {
    github.context.eventName = 'check_suite'

    mockGetPull.mockResolvedValueOnce({
      data: {
        labels: [{ name: 'autobase' }]
      }
    })

    mockListPulls.mockResolvedValueOnce({
      data: [
        {
          number: 2,
          labels: [{ name: 'autobase' }],
          draft: false,
          mergeable_state: 'behind',
          head: { sha: 'def456' }
        }
      ]
    })

    mockGetPull.mockResolvedValueOnce({
      data: {
        rebaseable: true,
        mergeable_state: 'behind'
      }
    })

    mockUpdateBranch.mockResolvedValueOnce({
      data: {
        url: 'https://api.github.com/repos/owner/repo/pulls/2'
      }
    })

    await run()

    expect(mockListPulls).toHaveBeenCalledTimes(1)
    expect(mockGetPull).toHaveBeenCalledTimes(2)
    expect(mockUpdateBranch).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      pull_number: 2,
      expected_head_sha: 'def456',
      update_method: 'rebase'
    })

    github.context.eventName = 'pull_request'
  })

  it('Does not rebase when the pull_request payload is not present', async () => {
    const payload = github.context.payload
    github.context.payload = {}

    await run()

    expect(mockListPulls).not.toHaveBeenCalled()
    expect(mockUpdateBranch).not.toHaveBeenCalled()
    expect(core.setFailed).toHaveBeenCalledWith(
      'Event payload missing `pull_request`'
    )

    github.context.payload = payload
  })

  it('Does not rebase when the check_suite payload is not present', async () => {
    github.context.eventName = 'check_suite'
    const payload = github.context.payload
    github.context.payload = {}

    await run()

    expect(mockListPulls).not.toHaveBeenCalled()
    expect(mockUpdateBranch).not.toHaveBeenCalled()
    expect(core.setFailed).toHaveBeenCalledWith(
      'Event payload missing `check_suite`'
    )

    github.context.eventName = 'pull_request'
    github.context.payload = payload
  })

  it('Does not rebase when a check suite action is not completed', async () => {
    github.context.eventName = 'check_suite'
    github.context.payload.action = 'requested'

    await run()

    expect(mockListPulls).not.toHaveBeenCalled()
    expect(mockUpdateBranch).not.toHaveBeenCalled()
    expect(core.info).toHaveBeenCalledWith(
      'Ignoring a check_suite event with a requested action and failure conclusion'
    )

    github.context.payload.action = 'completed'
    github.context.eventName = 'pull_request'
  })

  it('Does not rebase when a check suite is a success', async () => {
    github.context.eventName = 'check_suite'
    github.context.payload.check_suite.conclusion = 'success'

    await run()

    expect(mockListPulls).not.toHaveBeenCalled()
    expect(mockUpdateBranch).not.toHaveBeenCalled()
    expect(core.info).toHaveBeenCalledWith(
      'Ignoring a check_suite event with a completed action and success conclusion'
    )

    github.context.payload.check_suite.conclusion = 'failure'
    github.context.eventName = 'pull_request'
  })

  it('Does not rebase when a check suite does not have any PRs', async () => {
    const prs = github.context.payload.check_suite.pull_requests
    github.context.eventName = 'check_suite'
    github.context.payload.check_suite.pull_requests = []

    await run()

    expect(mockListPulls).not.toHaveBeenCalled()
    expect(mockUpdateBranch).not.toHaveBeenCalled()
    expect(core.info).toHaveBeenCalledWith(
      'No pull requests are associated with the check suite.'
    )

    github.context.payload.check_suite.pull_requests = prs
    github.context.eventName = 'pull_request'
  })

  it('Does not rebase when a check suite does not have any PRs with the specified label', async () => {
    github.context.eventName = 'check_suite'

    mockGetPull.mockResolvedValueOnce({
      data: {
        labels: [{ name: 'some-other-label' }]
      }
    })

    await run()

    expect(mockGetPull).toHaveBeenCalled()
    expect(mockListPulls).not.toHaveBeenCalled()
    expect(mockUpdateBranch).not.toHaveBeenCalled()
    expect(core.info).toHaveBeenCalledWith(
      "Skipping check suite for PR #1 since it does not have the label 'autobase'."
    )

    github.context.eventName = 'pull_request'
  })

  it('Does not rebase if the PR merged is not into the default branch', async () => {
    // Change the base ref to simulate a PR merged into a non-default branch
    if (github.context.payload.pull_request) {
      github.context.payload.pull_request.base.ref = 'develop'
    }

    await run()

    expect(mockListPulls).not.toHaveBeenCalled()
    expect(mockUpdateBranch).not.toHaveBeenCalled()

    if (github.context.payload.pull_request) {
      github.context.payload.pull_request.base.ref = 'master'
    }
  })

  it('Does not rebase if the PR does not have the specified label', async () => {
    mockListPulls.mockResolvedValueOnce({
      data: [
        {
          number: 3,
          labels: [{ name: 'some-other-label' }],
          draft: false,
          mergeable_state: 'behind',
          head: { sha: 'ghi789' }
        }
      ]
    })

    await run()

    expect(mockListPulls).toHaveBeenCalledTimes(1)
    expect(mockUpdateBranch).not.toHaveBeenCalled()
  })

  it('Does not rebase if the PR is a draft', async () => {
    mockListPulls.mockResolvedValueOnce({
      data: [
        {
          number: 4,
          labels: [{ name: 'autobase' }],
          draft: true,
          mergeable_state: 'behind',
          head: { sha: 'jkl012' }
        }
      ]
    })

    await run()

    expect(mockListPulls).toHaveBeenCalledTimes(1)
    expect(mockUpdateBranch).not.toHaveBeenCalled()
  })

  it('Does not rebase if the PR is not behind the default branch', async () => {
    mockListPulls.mockResolvedValueOnce({
      data: [
        {
          number: 5,
          labels: [{ name: 'autobase' }],
          draft: false,
          mergeable_state: 'clean',
          head: { sha: 'mno345' }
        }
      ]
    })

    await run()

    expect(mockListPulls).toHaveBeenCalledTimes(1)
    expect(mockUpdateBranch).not.toHaveBeenCalled()
  })

  it('Does not rebase if the PR does not have the required number of approvals', async () => {
    jest
      .spyOn(core, 'getInput')
      .mockImplementationOnce(() => 'test-token')
      .mockImplementationOnce(() => 'autobase')
      .mockImplementationOnce(() => '2')

    mockGetPull.mockResolvedValueOnce({
      data: {
        rebaseable: true,
        mergeable_state: 'behind'
      }
    })

    mockListPulls.mockResolvedValueOnce({
      data: [
        {
          number: 6,
          labels: [{ name: 'autobase' }],
          draft: false,
          mergeable_state: 'behind',
          head: { sha: 'pqr678' }
        }
      ]
    })

    mockListReviews.mockResolvedValueOnce({
      data: [{ state: 'APPROVED' }]
    })

    await run()

    expect(mockListPulls).toHaveBeenCalledTimes(1)
    expect(mockListReviews).toHaveBeenCalledTimes(1)
    expect(mockUpdateBranch).not.toHaveBeenCalled()
  })

  it('Handles errors during the rebase process', async () => {
    mockListPulls.mockResolvedValueOnce({
      data: [
        {
          number: 7,
          labels: [{ name: 'autobase' }],
          draft: false,
          mergeable_state: 'behind',
          head: { sha: 'stu901' }
        }
      ]
    })

    mockGetPull.mockResolvedValueOnce({
      data: {
        rebaseable: true,
        mergeable_state: 'behind'
      }
    })

    mockUpdateBranch.mockRejectedValueOnce(new Error('Rebase failed'))

    await run()

    expect(mockListPulls).toHaveBeenCalledTimes(1)
    expect(mockGetPull).toHaveBeenCalledTimes(1)
    expect(mockUpdateBranch).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      pull_number: 7,
      expected_head_sha: 'stu901',
      update_method: 'rebase'
    })
    expect(core.setFailed).toHaveBeenCalledWith(
      'Failed to rebase PR #7: Error: Rebase failed'
    )
  })

  it('Rebases only PRs targeting a specific base branch if configured', async () => {
    mockListPulls.mockResolvedValueOnce({
      data: [
        {
          number: 8,
          labels: [{ name: 'autobase' }],
          draft: false,
          base: { ref: 'master' },
          mergeable_state: 'behind',
          head: { sha: 'abc123' }
        },
        {
          number: 9,
          labels: [{ name: 'autobase' }],
          draft: false,
          base: { ref: 'develop' },
          mergeable_state: 'behind',
          head: { sha: 'def456' }
        }
      ]
    })

    mockGetPull.mockResolvedValueOnce({
      data: {
        rebaseable: true,
        mergeable_state: 'behind'
      }
    })

    await run()

    expect(mockUpdateBranch).toHaveBeenCalledWith(
      expect.objectContaining({ pull_number: 8 })
    )
    expect(mockUpdateBranch).toHaveBeenCalledTimes(1)
  })

  it('Handles the scenario where there are no pull requests to process', async () => {
    mockListPulls.mockResolvedValueOnce({ data: [] })

    await run()

    expect(mockUpdateBranch).not.toHaveBeenCalled()
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('Skips PRs that are already up-to-date with the base branch', async () => {
    mockListPulls.mockResolvedValueOnce({
      data: [
        {
          number: 10,
          labels: [{ name: 'autobase' }],
          draft: false,
          mergeable_state: 'clean',
          head: { sha: 'ghi789' }
        }
      ]
    })

    mockGetPull.mockResolvedValueOnce({
      data: {
        rebaseable: true,
        mergeable_state: 'clean'
      }
    })

    await run()

    expect(mockUpdateBranch).not.toHaveBeenCalled()
  })

  it('Skips PRs with a merge conflict', async () => {
    mockListPulls.mockResolvedValueOnce({
      data: [
        {
          number: 11,
          labels: [{ name: 'autobase' }],
          draft: false,
          mergeable_state: 'dirty',
          head: { sha: 'jkl012' }
        }
      ]
    })

    mockGetPull.mockResolvedValueOnce({
      data: {
        rebaseable: true,
        mergeable_state: 'dirty'
      }
    })

    await run()

    expect(mockUpdateBranch).not.toHaveBeenCalled()
  })

  it('Skips PRs that are closed', async () => {
    mockListPulls.mockResolvedValueOnce({
      data: [
        {
          number: 12,
          labels: [{ name: 'autobase' }],
          draft: false,
          state: 'closed',
          mergeable_state: 'behind',
          head: { sha: 'mno345' }
        }
      ]
    })

    await run()

    expect(mockUpdateBranch).not.toHaveBeenCalled()
  })

  it('Skips PRs that are not rebaseable', async () => {
    mockListPulls.mockResolvedValueOnce({
      data: [
        {
          number: 12,
          labels: [{ name: 'autobase' }],
          draft: false,
          state: 'open',
          mergeable_state: 'behind',
          head: { sha: 'mno345' }
        }
      ]
    })

    mockGetPull.mockResolvedValueOnce({
      data: {
        rebaseable: false,
        mergeable_state: 'behind'
      }
    })

    await run()

    expect(mockUpdateBranch).not.toHaveBeenCalled()
  })
})
