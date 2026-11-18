// The branch the local checks compare your work with: the one named with
// --base, else the base branch of this branch's open PR (on the remote that
// points at the PR's repo), else origin/dev. CI passes exact commits instead
// and never calls this.

import { execFileSync } from 'node:child_process';

/**
 * @param {{
 *   base?: string,
 *   pr?: { repo: string, branch: string },
 *   remotes: Record<string, string>,
 * }} options `remotes` maps each git remote's name to its GitHub repo ("owner/name").
 */
export function targetBranch({ base, pr, remotes }) {
  if (base) return base;
  const remote = pr && Object.keys(remotes).find((name) => remotes[name] === pr.repo);
  return remote ? `${remote}/${pr.branch}` : 'origin/dev';
}

const run = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** Each git remote's GitHub repo ("owner/name"), by remote name. */
export function githubRemotes() {
  const remotes = {};
  for (const line of run('git', ['remote', '-v']).split('\n')) {
    const match = line.match(/^(\S+)\s+\S*github\.com[:/]([^/\s]+\/[^/\s]+?)(\.git)?\s+\(fetch\)$/);
    if (match) remotes[match[1]] = match[2];
  }
  return remotes;
}

/**
 * The open PR for the checked-out branch: its repo and base branch. A fork's
 * PRs can be on origin or on the repo gh defaults to (often upstream), so it
 * asks origin first.
 */
export function openPr(remotes) {
  const branch = run('git', ['branch', '--show-current']);
  // With --repo, gh needs the branch named.
  const lookups = [remotes.origin && branch ? [branch, '--repo', remotes.origin] : null, []].filter(Boolean);
  for (const lookup of lookups) {
    try {
      const [baseBranch, url] = run('gh', ['pr', 'view', ...lookup, '--json', 'baseRefName,url', '--jq', '.baseRefName, .url']).split('\n');
      const repo = url?.match(/github\.com\/([^/]+\/[^/]+)\/pull\//)?.[1];
      if (baseBranch && repo) return { repo, branch: baseBranch };
    } catch {
      // No PR there, or gh isn't installed or signed in.
    }
  }
  return undefined;
}

/** The branch to compare with, given --base if it was passed. */
export function findTargetBranch(base) {
  const remotes = githubRemotes();
  return targetBranch({ base, pr: base ? undefined : openPr(remotes), remotes });
}
