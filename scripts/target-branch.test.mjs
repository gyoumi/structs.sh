import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// A namespace import, so a helper that doesn't exist yet fails its own tests
// with a message instead of stopping the whole file from loading.
import * as targetBranchModule from './target-branch.mjs';

const { githubRepo, targetBranch } = targetBranchModule;

const remotes = { origin: 'gyoumi/structs.sh', upstream: 'devsoc-unsw/structs.sh' };

describe('targetBranch', () => {
  it('uses the branch named with --base', () => {
    const pr = { repo: 'gyoumi/structs.sh', branch: 'dev' };
    assert.equal(
      targetBranch({ base: 'origin/debugger-rewrite', pr, remotes }),
      'origin/debugger-rewrite',
      'targetBranch({ base: "origin/debugger-rewrite", pr into gyoumi/structs.sh dev }) should be the --base branch',
    );
  });

  it("uses the open PR's base branch, so a PR into another branch isn't compared with dev", () => {
    const pr = { repo: 'gyoumi/structs.sh', branch: 'debugger-rewrite' };
    assert.equal(
      targetBranch({ pr, remotes }),
      'origin/debugger-rewrite',
      'targetBranch({ pr into gyoumi/structs.sh debugger-rewrite }), origin = gyoumi/structs.sh',
    );
  });

  it('uses the remote of the repo the PR is on, for a fork PR into upstream', () => {
    const pr = { repo: 'devsoc-unsw/structs.sh', branch: 'debugger-rewrite' };
    assert.equal(
      targetBranch({ pr, remotes }),
      'upstream/debugger-rewrite',
      'targetBranch({ pr into devsoc-unsw/structs.sh debugger-rewrite }), upstream = devsoc-unsw/structs.sh',
    );
  });

  it('matches the repo name without regard to case, as GitHub does', () => {
    const pr = { repo: 'devsoc-unsw/structs.sh', branch: 'dev' };
    assert.equal(
      targetBranch({ pr, remotes: { upstream: 'Devsoc-UNSW/Structs.sh' } }),
      'upstream/dev',
      'targetBranch({ pr into devsoc-unsw/structs.sh dev }), upstream = Devsoc-UNSW/Structs.sh',
    );
  });

  it('falls back to dev when no remote points at the PR’s repo', () => {
    const pr = { repo: 'someone/else', branch: 'main' };
    assert.equal(
      targetBranch({ pr, remotes }),
      'origin/dev',
      'targetBranch({ pr into someone/else main }), no remote for someone/else',
    );
  });

  it('falls back to dev when there is no PR yet', () => {
    assert.equal(targetBranch({ remotes }), 'origin/dev', 'targetBranch({ no pr, no base })');
  });
});

describe('githubRepo', () => {
  it('reads owner/name from the URL forms git remotes use', () => {
    const urls = [
      'https://github.com/gyoumi/structs.sh.git',
      'https://github.com/gyoumi/structs.sh',
      'git@github.com:gyoumi/structs.sh.git',
      'ssh://git@github.com/gyoumi/structs.sh.git',
      'ssh://git@ssh.github.com:443/gyoumi/structs.sh.git',
      'ssh://git@github.com:22/gyoumi/structs.sh',
      'http://github.com/gyoumi/structs.sh.git',
    ];
    for (const url of urls) {
      assert.equal(githubRepo(url), 'gyoumi/structs.sh', `githubRepo(${JSON.stringify(url)}) should be gyoumi/structs.sh`);
    }
  });

  it('matches the host without regard to case, and returns owner/name as written', () => {
    const cases = [
      ['https://GitHub.com/devsoc-unsw/structs.sh.git', 'devsoc-unsw/structs.sh'],
      ['git@GITHUB.COM:owner/name.git', 'owner/name'],
      ['ssh://git@SSH.GitHub.com:443/Owner/Name.git', 'Owner/Name'],
      ['https://github.COM/Devsoc-UNSW/Structs.sh', 'Devsoc-UNSW/Structs.sh'],
      ['http://github.com/owner/name.git', 'owner/name'],
      ['http://GitHub.com/Owner/Name', 'Owner/Name'],
    ];
    for (const [url, repo] of cases) {
      assert.equal(githubRepo(url), repo, `githubRepo(${JSON.stringify(url)}) should be ${repo}`);
    }
  });

  it('ignores remotes that are not on GitHub', () => {
    const url = 'https://gitlab.com/gyoumi/structs.sh.git';
    assert.equal(githubRepo(url), undefined, `githubRepo(${JSON.stringify(url)}) should be undefined`);
  });

  it('ignores hosts that only contain github.com, such as gitlab-github.com or github.com.example.org', () => {
    const urls = [
      'https://gitlab-github.com/owner/name.git',
      'https://github.com.example.org/owner/name.git',
      'git@notgithub.com:owner/name.git',
      'https://example.com/github.com/owner/name.git',
      'https://user@gitlab-github.com/owner/name.git',
      'git@github.com.example.org:owner/name.git',
      'ssh://git@notgithub.com/owner/name.git',
      'ssh://git@ssh.github.com.example.org:443/owner/name.git',
      'https://GITLAB-GITHUB.COM/owner/name.git',
      'http://gitlab-github.com/owner/name.git',
    ];
    // Every URL is checked before failing, so the message lists them all.
    const missed = urls
      .map((url) => [url, githubRepo(url)])
      .filter(([, repo]) => repo !== undefined)
      .map(([url, repo]) => `  githubRepo(${JSON.stringify(url)}) gave ${JSON.stringify(repo)}`);
    assert.deepEqual(
      missed,
      [],
      'each URL below has a host that is not exactly github.com or ssh.github.com, so githubRepo should give undefined, ' +
        `but didn't:\n${missed.join('\n')}`,
    );
  });

  it('reads owner/name when the URL names a user before the host', () => {
    const cases = [
      ['https://x-access-token@github.com/gyoumi/structs.sh.git', 'gyoumi/structs.sh'],
      ['git@GitHub.com:gyoumi/structs.sh', 'gyoumi/structs.sh'],
      ['ssh://git@ssh.github.com:443/gyoumi/structs.sh', 'gyoumi/structs.sh'],
    ];
    for (const [url, repo] of cases) {
      assert.equal(githubRepo(url), repo, `githubRepo(${JSON.stringify(url)}) should be ${repo}`);
    }
  });
});

describe('prFromView', () => {
  /** The helper, failing with a clear message while it doesn't exist. */
  const prFromView = (view) => {
    assert.equal(
      typeof targetBranchModule.prFromView,
      'function',
      'target-branch.mjs should export prFromView(view), which reads `gh pr view --json baseRefName,url,state`',
    );
    return targetBranchModule.prFromView(view);
  };
  const url = 'https://github.com/devsoc-unsw/structs.sh/pull/35';

  it("gives an open PR's repo and base branch", () => {
    const view = { baseRefName: 'dev', url, state: 'OPEN' };
    assert.deepEqual(
      prFromView(view),
      { repo: 'devsoc-unsw/structs.sh', branch: 'dev' },
      `prFromView(${JSON.stringify(view)}) should be { repo: 'devsoc-unsw/structs.sh', branch: 'dev' }`,
    );
  });

  it('ignores a merged PR, whose base may since have been deleted', () => {
    const view = { baseRefName: 'debugger-rewrite', url, state: 'MERGED' };
    assert.equal(prFromView(view), undefined, `prFromView(${JSON.stringify(view)}) should be undefined`);
  });

  it('ignores a closed PR', () => {
    const view = { baseRefName: 'debugger-rewrite', url, state: 'CLOSED' };
    assert.equal(prFromView(view), undefined, `prFromView(${JSON.stringify(view)}) should be undefined`);
  });

  it('ignores a URL that is not a GitHub PR', () => {
    for (const notPr of ['https://github.com/devsoc-unsw/structs.sh', 'https://gitlab.com/devsoc-unsw/structs.sh/-/merge_requests/35']) {
      const view = { baseRefName: 'dev', url: notPr, state: 'OPEN' };
      assert.equal(prFromView(view), undefined, `prFromView(${JSON.stringify(view)}) should be undefined`);
    }
  });
});
