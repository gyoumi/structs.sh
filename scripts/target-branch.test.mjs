import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { targetBranch } from './target-branch.mjs';

describe('targetBranch', () => {
  it('uses the branch named with --base', () => {
    assert.equal(targetBranch({ base: 'origin/debugger-rewrite', prBase: 'dev' }), 'origin/debugger-rewrite');
  });

  it("uses the open PR's base branch, so a PR into another branch isn't compared with dev", () => {
    assert.equal(targetBranch({ prBase: 'debugger-rewrite' }), 'origin/debugger-rewrite');
  });

  it('falls back to dev when there is no PR yet', () => {
    assert.equal(targetBranch({}), 'origin/dev');
  });
});
