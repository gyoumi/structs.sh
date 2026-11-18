import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { githubRepo, targetBranch } from './target-branch.mjs';

const remotes = { origin: 'gyoumi/structs.sh', upstream: 'devsoc-unsw/structs.sh' };

describe('targetBranch', () => {
  it('uses the branch named with --base', () => {
    const pr = { repo: 'gyoumi/structs.sh', branch: 'dev' };
    assert.equal(targetBranch({ base: 'origin/debugger-rewrite', pr, remotes }), 'origin/debugger-rewrite');
  });

  it("uses the open PR's base branch, so a PR into another branch isn't compared with dev", () => {
    const pr = { repo: 'gyoumi/structs.sh', branch: 'debugger-rewrite' };
    assert.equal(targetBranch({ pr, remotes }), 'origin/debugger-rewrite');
  });

  it('uses the remote of the repo the PR is on, for a fork PR into upstream', () => {
    const pr = { repo: 'devsoc-unsw/structs.sh', branch: 'debugger-rewrite' };
    assert.equal(targetBranch({ pr, remotes }), 'upstream/debugger-rewrite');
  });

  it('matches the repo name without regard to case, as GitHub does', () => {
    const pr = { repo: 'devsoc-unsw/structs.sh', branch: 'dev' };
    assert.equal(targetBranch({ pr, remotes: { upstream: 'Devsoc-UNSW/Structs.sh' } }), 'upstream/dev');
  });

  it('falls back to dev when no remote points at the PR’s repo', () => {
    const pr = { repo: 'someone/else', branch: 'main' };
    assert.equal(targetBranch({ pr, remotes }), 'origin/dev');
  });

  it('falls back to dev when there is no PR yet', () => {
    assert.equal(targetBranch({ remotes }), 'origin/dev');
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
    ];
    for (const url of urls) assert.equal(githubRepo(url), 'gyoumi/structs.sh', url);
  });

  it('ignores remotes that are not on GitHub', () => {
    assert.equal(githubRepo('https://gitlab.com/gyoumi/structs.sh.git'), undefined);
  });
});
