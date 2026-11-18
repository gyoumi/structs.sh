// The branch the local checks compare your work with: the one named with
// --base, else the base branch of this branch's open PR, else origin/dev.
// CI passes exact commits instead and never calls this.

import { execFileSync } from 'node:child_process';

/** @param {{ base?: string, prBase?: string }} options */
export function targetBranch({ base, prBase }) {
  if (base) return base;
  if (prBase) return `origin/${prBase}`;
  return 'origin/dev';
}

/** The GitHub repo ("owner/name") that origin points at, if it is on GitHub. */
const originRepo = () => {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
    return url.match(/github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/)?.[1];
  } catch {
    return undefined;
  }
};

/**
 * The base branch of the open PR for the checked-out branch, if gh can find
 * one. A fork's PRs can be on origin or on the repo gh defaults to (often
 * upstream), so it asks origin first.
 */
export function openPrBase() {
  const repo = originRepo();
  const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
  // With --repo, gh needs the branch named.
  const lookups = [repo && branch ? [branch, '--repo', repo] : null, []].filter(Boolean);
  for (const lookup of lookups) {
    try {
      const name = execFileSync('gh', ['pr', 'view', ...lookup, '--json', 'baseRefName', '--jq', '.baseRefName'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (name) return name;
    } catch {
      // No PR there, or gh isn't installed or signed in.
    }
  }
  return undefined;
}
