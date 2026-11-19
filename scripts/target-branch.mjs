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
  // GitHub ignores case in owner and repo names.
  const remote = pr && Object.keys(remotes).find((name) => remotes[name].toLowerCase() === pr.repo.toLowerCase());
  return remote ? `${remote}/${pr.branch}` : 'origin/dev';
}

const run = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/**
 * The GitHub repo ("owner/name") a remote URL points at: https, scp-style
 * (git@github.com:owner/name) or ssh://, with or without a port, as with
 * ssh.github.com:443. Hosts ignore case; owner/name comes back as written.
 */
export function githubRepo(url) {
  return url.match(/github\.com(?::\d+(?=\/))?[:/]([^/\s:]+\/[^/\s]+?)(?:\.git)?\/?$/i)?.[1];
}

/**
 * The repo and base branch from what `gh pr view --json baseRefName,url,state`
 * prints, or undefined unless it's an open GitHub PR. gh also shows closed and
 * merged PRs, whose base is stale.
 */
export function prFromView({ baseRefName, url, state } = {}) {
  const repo = url?.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/\d+\/?$/i)?.[1];
  return state === 'OPEN' && baseRefName && repo ? { repo, branch: baseRefName } : undefined;
}

/** Each git remote's GitHub repo ("owner/name"), by remote name. */
export function githubRemotes() {
  const remotes = {};
  for (const line of run('git', ['remote', '-v']).split('\n')) {
    const [name, url, kind] = line.split(/\s+/);
    const repo = kind === '(fetch)' ? githubRepo(url ?? '') : undefined;
    if (repo) remotes[name] = repo;
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
      const pr = prFromView(JSON.parse(run('gh', ['pr', 'view', ...lookup, '--json', 'baseRefName,url,state'])));
      if (pr) return pr;
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
