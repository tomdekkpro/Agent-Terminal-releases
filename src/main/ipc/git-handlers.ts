import { type IpcMain } from 'electron';
import { execSync } from 'child_process';
import { existsSync, readFileSync, appendFileSync, cpSync, mkdirSync } from 'fs';
import { join } from 'path';
import { IPC_CHANNELS } from '../../shared/constants';
import { debugLog, debugError } from '../../shared/utils';

/** Copy .claude/ directory from parent project to worktree so Claude Code CLI has project settings */
function copyClaudeConfig(projectPath: string, worktreeDir: string): void {
  try {
    const srcDir = join(projectPath, '.claude');
    if (!existsSync(srcDir)) return;

    const destDir = join(worktreeDir, '.claude');
    mkdirSync(destDir, { recursive: true });
    cpSync(srcDir, destDir, { recursive: true });
    debugLog('[Git] Copied .claude/ config to worktree');
  } catch (err) {
    debugError('[Git] Failed to copy .claude/ config:', err);
    // Non-critical — Claude will work without it
  }
}

/** Sanitize a string to be safe for git branch names and directory names */
function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function isGitRepo(cwd: string): boolean {
  try {
    execSync('git rev-parse --git-dir', { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function ensureGitignore(projectPath: string, entry: string): void {
  const gitignorePath = join(projectPath, '.gitignore');
  try {
    if (existsSync(gitignorePath)) {
      const content = readFileSync(gitignorePath, 'utf-8');
      if (!content.includes(entry)) {
        appendFileSync(gitignorePath, `\n${entry}\n`);
      }
    } else {
      appendFileSync(gitignorePath, `${entry}\n`);
    }
  } catch {
    // Non-critical, ignore
  }
}

export function registerGitHandlers(ipcMain: IpcMain): void {
  ipcMain.handle(
    IPC_CHANNELS.GIT_CREATE_WORKTREE,
    async (_event, projectPath: string, taskId: string, _taskName?: string) => {
      try {
        if (!isGitRepo(projectPath)) {
          return { success: false, error: 'Not a git repository' };
        }

        const safeName = sanitize(taskId);
        const worktreeDir = join(projectPath, '.task-worktrees', safeName);
        const branch = `task/${safeName}`;

        // Already exists — reuse
        if (existsSync(worktreeDir)) {
          debugLog('[Git] Reusing existing worktree:', worktreeDir);
          return { success: true, data: worktreeDir, branch };
        }

        // Add .task-worktrees/ to .gitignore
        ensureGitignore(projectPath, '.task-worktrees/');

        // Try creating with new branch
        try {
          execSync(`git worktree add "${worktreeDir}" -b "${branch}"`, {
            cwd: projectPath,
            stdio: 'pipe',
          });
        } catch {
          // Branch might already exist (previous worktree was removed but branch kept)
          try {
            execSync(`git worktree add "${worktreeDir}" "${branch}"`, {
              cwd: projectPath,
              stdio: 'pipe',
            });
          } catch (err: any) {
            return { success: false, error: err.message || 'Failed to create worktree' };
          }
        }

        // Copy .claude/ config so Claude Code CLI has project settings & permissions
        copyClaudeConfig(projectPath, worktreeDir);

        debugLog('[Git] Created worktree:', worktreeDir, 'branch:', branch);
        return { success: true, data: worktreeDir, branch };
      } catch (error: any) {
        debugError('[Git] createWorktree error:', error);
        return { success: false, error: error.message || 'Failed to create worktree' };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GIT_REMOVE_WORKTREE,
    async (_event, projectPath: string, worktreePath: string) => {
      try {
        execSync(`git worktree remove "${worktreePath}" --force`, {
          cwd: projectPath,
          stdio: 'pipe',
        });
        debugLog('[Git] Removed worktree:', worktreePath);
        return { success: true };
      } catch (error: any) {
        debugError('[Git] removeWorktree error:', error);
        return { success: false, error: error.message };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GIT_LIST_BRANCHES,
    async (_event, projectPath: string) => {
      try {
        if (!isGitRepo(projectPath)) {
          return { success: false, error: 'Not a git repository' };
        }

        const output = execSync('git branch --format="%(refname:short)"', {
          cwd: projectPath,
          encoding: 'utf-8',
        }).trim();

        const branches = output
          .split('\n')
          .map((b) => b.trim())
          .filter(Boolean);

        // Detect current branch
        let current = '';
        try {
          current = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: projectPath,
            encoding: 'utf-8',
          }).trim();
        } catch { /* ignore */ }

        return { success: true, branches, current };
      } catch (error: any) {
        debugError('[Git] listBranches error:', error);
        return { success: false, error: error.message };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GIT_MERGE_TASK,
    async (_event, projectPath: string, worktreePath: string, taskBranch: string, targetBranch: string) => {
      try {
        if (!isGitRepo(projectPath)) {
          return { success: false, error: 'Not a git repository' };
        }

        // Ensure task branch has commits ahead of target
        try {
          const aheadCount = execSync(
            `git rev-list --count ${targetBranch}..${taskBranch}`,
            { cwd: projectPath, encoding: 'utf-8' }
          ).trim();
          if (aheadCount === '0') {
            return { success: false, error: `No commits to merge — task branch is up to date with ${targetBranch}` };
          }
        } catch {
          // Could not determine ahead count, proceed anyway
        }

        // Remove the worktree first (must be done before merging to avoid lock issues)
        try {
          execSync(`git worktree remove "${worktreePath}" --force`, {
            cwd: projectPath,
            stdio: 'pipe',
          });
          debugLog('[Git] Removed worktree before merge:', worktreePath);
        } catch {
          // Worktree might already be gone
        }

        // Switch to target branch in the project root
        execSync(`git checkout ${targetBranch}`, {
          cwd: projectPath,
          stdio: 'pipe',
        });

        // Merge the task branch
        try {
          execSync(`git merge ${taskBranch} --no-ff -m "Merge ${taskBranch} into ${targetBranch}"`, {
            cwd: projectPath,
            stdio: 'pipe',
          });
        } catch (mergeErr: any) {
          // Merge conflict — abort and report
          try {
            execSync('git merge --abort', { cwd: projectPath, stdio: 'pipe' });
          } catch { /* ignore */ }
          return { success: false, error: 'Merge conflict detected. Please resolve manually.' };
        }

        // Delete the task branch
        try {
          execSync(`git branch -d ${taskBranch}`, {
            cwd: projectPath,
            stdio: 'pipe',
          });
          debugLog('[Git] Deleted task branch:', taskBranch);
        } catch {
          // Non-critical — branch may have other references
        }

        // Prune worktree list
        try {
          execSync('git worktree prune', { cwd: projectPath, stdio: 'pipe' });
        } catch { /* ignore */ }

        debugLog('[Git] Merged task branch into', targetBranch);
        return { success: true, targetBranch };
      } catch (error: any) {
        debugError('[Git] mergeTask error:', error);
        return { success: false, error: error.message || 'Failed to merge task branch' };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GIT_PUSH_BRANCH,
    async (_event, cwd: string, branch?: string) => {
      try {
        if (!isGitRepo(cwd)) {
          return { success: false, error: 'Not a git repository' };
        }

        // Detect current branch if not specified
        const branchName = branch || execSync('git rev-parse --abbrev-ref HEAD', {
          cwd,
          encoding: 'utf-8',
        }).trim();

        execSync(`git push -u origin ${branchName}`, {
          cwd,
          stdio: 'pipe',
        });

        debugLog('[Git] Pushed branch:', branchName);
        return { success: true, branch: branchName };
      } catch (error: any) {
        const msg = error.stderr?.toString() || error.message || '';
        if (msg.includes('up-to-date') || msg.includes('up to date')) {
          return { success: true, branch: branch || 'current', alreadyUpToDate: true };
        }
        debugError('[Git] pushBranch error:', error);
        return { success: false, error: msg || 'Failed to push branch' };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GIT_FETCH,
    async (_event, cwd: string) => {
      try {
        if (!isGitRepo(cwd)) {
          return { success: false, error: 'Not a git repository' };
        }

        execSync('git fetch --all --prune', {
          cwd,
          stdio: 'pipe',
          timeout: 30000,
        });

        let behindCount = 0;
        try {
          const count = execSync('git rev-list HEAD..@{u} --count', {
            cwd,
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 5000,
          }).trim();
          behindCount = parseInt(count, 10) || 0;
        } catch {
          // No upstream configured — ignore
        }

        debugLog('[Git] Fetched all remotes, behind by', behindCount);
        return { success: true, behindCount };
      } catch (error: any) {
        const msg = error.stderr?.toString() || error.message || '';
        debugError('[Git] fetch error:', msg);
        return { success: false, error: msg || 'Failed to fetch' };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GIT_PULL,
    async (_event, cwd: string) => {
      try {
        if (!isGitRepo(cwd)) {
          return { success: false, error: 'Not a git repository' };
        }

        const oldHead = execSync('git rev-parse HEAD', {
          cwd,
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 5000,
        }).trim();

        const output = execSync('git pull', {
          cwd,
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 60000,
        }).trim();

        const alreadyUpToDate = output.includes('Already up to date') || output.includes('up-to-date');

        let commitsPulled = 0;
        if (!alreadyUpToDate) {
          try {
            const count = execSync(`git rev-list ${oldHead}..HEAD --count`, {
              cwd,
              encoding: 'utf-8',
              stdio: 'pipe',
              timeout: 5000,
            }).trim();
            commitsPulled = parseInt(count, 10) || 0;
          } catch {
            // ignore
          }
        }

        debugLog('[Git] Pull result:', output, 'commits pulled:', commitsPulled);
        return { success: true, alreadyUpToDate, output, commitsPulled };
      } catch (error: any) {
        const msg = error.stderr?.toString() || error.message || '';
        debugError('[Git] pull error:', msg);
        return { success: false, error: msg || 'Failed to pull' };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GIT_CREATE_PR,
    async (
      _event,
      projectPath: string,
      worktreePath: string,
      taskBranch: string,
      targetBranch: string,
      title: string,
      body: string,
    ) => {
      try {
        if (!isGitRepo(projectPath)) {
          return { success: false, error: 'Not a git repository' };
        }

        // Check if gh CLI is available
        try {
          execSync('gh --version', { stdio: 'pipe' });
        } catch {
          return { success: false, error: 'GitHub CLI (gh) is not installed. Install from https://cli.github.com' };
        }

        // Push the task branch to remote from worktree (or project root if worktree gone)
        const pushCwd = existsSync(worktreePath) ? worktreePath : projectPath;
        try {
          execSync(`git push -u origin ${taskBranch}`, {
            cwd: pushCwd,
            stdio: 'pipe',
          });
          debugLog('[Git] Pushed branch to remote:', taskBranch);
        } catch (pushErr: any) {
          const msg = pushErr.stderr?.toString() || pushErr.message || '';
          // "Everything up-to-date" is fine
          if (!msg.includes('up-to-date') && !msg.includes('up to date')) {
            return { success: false, error: `Failed to push branch: ${msg}` };
          }
        }

        // Create PR using gh CLI
        const escapedTitle = title.replace(/"/g, '\\"');
        const escapedBody = body.replace(/"/g, '\\"');
        try {
          const prOutput = execSync(
            `gh pr create --base "${targetBranch}" --head "${taskBranch}" --title "${escapedTitle}" --body "${escapedBody}"`,
            { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' }
          ).trim();

          // gh pr create outputs the PR URL
          debugLog('[Git] Created PR:', prOutput);
          return { success: true, prUrl: prOutput };
        } catch (prErr: any) {
          const stderr = prErr.stderr?.toString() || prErr.message || '';
          // If PR already exists, try to get its URL
          if (stderr.includes('already exists')) {
            try {
              const existing = execSync(
                `gh pr view ${taskBranch} --json url --jq .url`,
                { cwd: projectPath, encoding: 'utf-8', stdio: 'pipe' }
              ).trim();
              return { success: true, prUrl: existing, existing: true };
            } catch {
              return { success: false, error: 'A PR already exists for this branch' };
            }
          }
          return { success: false, error: stderr || 'Failed to create PR' };
        }
      } catch (error: any) {
        debugError('[Git] createPR error:', error);
        return { success: false, error: error.message || 'Failed to create PR' };
      }
    }
  );
}
