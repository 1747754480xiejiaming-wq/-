# Backend Canonical Workspace Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the verified backend-development worktree the canonical source for remote `main` and the frontend-development worktree while preserving the displaced frontend history on an archive branch.

**Architecture:** Treat the backend branch as an immutable source and the old frontend commit as an immutable recovery point. Archive the old commit first, record the synchronization snapshot, update `main` only with an exact `--force-with-lease`, then detach the frontend worktree at the resulting canonical commit and verify both trees byte-for-byte on critical files.

**Tech Stack:** Git worktrees, GitHub remote branches, PowerShell, Python/pytest, React/Vite/npm, Codex thread messaging

**Spec:** `docs/superpowers/specs/2026-09-11-backend-canonical-workspace-sync-design.md`

## Global Constraints

- Canonical source worktree: `C:\Users\17477\.codex\worktrees\b2de\茶文化智能体`.
- Target frontend worktree: `C:\Users\17477\.codex\worktrees\c604\茶文化智能体`.
- Displaced frontend commit: `172103d134d8470af2de1ae2692c2342e2e53319`.
- Recovery branch: `archive/frontend-before-backend-sync-20260911`.
- Never use plain `--force`; update `main` only with `--force-with-lease=refs/heads/main:172103d134d8470af2de1ae2692c2342e2e53319`.
- Stop if either worktree is dirty or remote `main` differs from the expected old frontend commit.
- Do not delete or rewrite the recovery branch or `codex/tea-backend-integration`.
- Preserve the currently running backend-canonical integration service unless a process is proven to originate from the frontend worktree.

---

### Task 1: Lock the source, target, and recovery point

**Files:**
- Read: `.git` worktree metadata
- Read: `docs/superpowers/specs/2026-09-11-backend-canonical-workspace-sync-design.md`

**Interfaces:**
- Consumes: local commits `8c0ca11` and `172103d`, remote `origin/main`
- Produces: verified preflight state and remote/local recovery branch `archive/frontend-before-backend-sync-20260911`

- [ ] **Step 1: Fetch only the remote refs needed for the safety check**

```powershell
git fetch origin main codex/tea-backend-integration
```

Expected: exit code 0; no local worktree files change.

- [ ] **Step 2: Verify both worktrees are clean and identify their exact commits**

```powershell
$canonicalTree = 'C:\Users\17477\.codex\worktrees\b2de\茶文化智能体'
$frontendTree = 'C:\Users\17477\.codex\worktrees\c604\茶文化智能体'
git -C $canonicalTree status --short
git -C $frontendTree status --short
git -C $canonicalTree rev-parse HEAD
git -C $frontendTree rev-parse HEAD
git -C $canonicalTree rev-parse origin/main
```

Expected: both status outputs are empty; frontend HEAD and `origin/main` both equal `172103d134d8470af2de1ae2692c2342e2e53319`. Stop on any mismatch.

- [ ] **Step 3: Create a local recovery branch without switching either worktree**

```powershell
git branch archive/frontend-before-backend-sync-20260911 172103d134d8470af2de1ae2692c2342e2e53319
git rev-parse archive/frontend-before-backend-sync-20260911
```

Expected: the branch resolves exactly to `172103d134d8470af2de1ae2692c2342e2e53319`. If it already exists, verify it points there and do not move it.

- [ ] **Step 4: Push and verify the recovery branch before any overwrite**

```powershell
git push origin archive/frontend-before-backend-sync-20260911:archive/frontend-before-backend-sync-20260911
git ls-remote --heads origin archive/frontend-before-backend-sync-20260911
```

Expected: remote output begins with `172103d134d8470af2de1ae2692c2342e2e53319`.

- [ ] **Step 5: Record the archive checkpoint in the plan**

Mark Task 1 complete only after the remote archive hash is verified. Do not update `main` during this task.

---

### Task 2: Record and validate the canonical synchronization snapshot

**Files:**
- Modify: `README.md`
- Modify: `VERSION_SNAPSHOTS.md`
- Modify: `docs/superpowers/plans/2026-09-11-backend-canonical-workspace-sync.md`
- Test: `backend/tests/`
- Test: `prototype/package.json`

**Interfaces:**
- Consumes: verified recovery branch from Task 1
- Produces: one clean canonical commit containing the synchronization record and all already-verified backend/login UI work

- [ ] **Step 1: Add the canonical-baseline status to README**

Add a short status item stating that the backend-development implementation is the sole code/UI baseline for `main` and both development tasks, and that the former frontend line is recoverable from `archive/frontend-before-backend-sync-20260911`.

- [ ] **Step 2: Add snapshot `SNAP-20260911-024`**

Append a `VERSION_SNAPSHOTS.md` row with:

```markdown
| SNAP-20260911-024 | full | 以后端开发工作区为唯一基线，归档旧前端历史，并同步远程 main 与前端开发工作区 | 双工作区提交及关键文件哈希一致；后端测试、API 模式前端构建、远程分支核验通过 | 已推送至 GitHub `main`、`codex/tea-backend-integration`；旧前端历史保存在 `archive/frontend-before-backend-sync-20260911` |
```

- [ ] **Step 3: Run the backend test suite**

```powershell
Set-Location backend
python -m pytest -q
```

Expected: 30 tests pass; only the already-known dependency deprecation warnings are allowed.

- [ ] **Step 4: Run the frontend build against the local API base**

```powershell
Set-Location prototype
$env:VITE_API_BASE_URL = 'http://127.0.0.1:8000/api/v1'
npm run build
```

Expected: TypeScript checking and Vite production build complete with exit code 0.

- [ ] **Step 5: Check documentation and repository differences**

```powershell
git diff --check
git status --short
```

Expected: only `README.md`, `VERSION_SNAPSHOTS.md`, and this plan are modified; no whitespace errors.

- [ ] **Step 6: Commit the canonical synchronization snapshot**

```powershell
git add -- README.md VERSION_SNAPSHOTS.md docs/superpowers/plans/2026-09-11-backend-canonical-workspace-sync.md
git diff --cached --check
git commit -m "snapshot(full): synchronize backend canonical baseline"
```

Expected: one new commit on `codex/tea-backend-integration`; working tree clean.

---

### Task 3: Publish the canonical history to GitHub main

**Files:**
- No worktree file changes
- Modify remote refs: `codex/tea-backend-integration`, `main`

**Interfaces:**
- Consumes: final clean canonical commit from Task 2
- Produces: `origin/codex/tea-backend-integration` and `origin/main` at the same commit

- [ ] **Step 1: Push the canonical branch normally**

```powershell
git push origin codex/tea-backend-integration
```

Expected: exit code 0 and remote canonical branch advances to local HEAD.

- [ ] **Step 2: Re-read remote main immediately before overwrite**

```powershell
git ls-remote --heads origin main
```

Expected: `main` still equals `172103d134d8470af2de1ae2692c2342e2e53319`. Stop if it differs.

- [ ] **Step 3: Replace main with the canonical history using the exact lease**

```powershell
git push origin HEAD:main --force-with-lease=refs/heads/main:172103d134d8470af2de1ae2692c2342e2e53319
```

Expected: forced update succeeds. A lease rejection is a safe failure and must not be bypassed.

- [ ] **Step 4: Fetch and prove both remote refs match the local commit**

```powershell
git fetch origin main codex/tea-backend-integration
$canonicalHead = (git rev-parse HEAD).Trim()
$remoteMain = (git rev-parse origin/main).Trim()
$remoteCanonical = (git rev-parse origin/codex/tea-backend-integration).Trim()
"local=$canonicalHead main=$remoteMain branch=$remoteCanonical"
```

Expected: all three full hashes are identical.

---

### Task 4: Synchronize the frontend task worktree and verify both tasks

**Files:**
- Replace target worktree contents through Git checkout: `C:\Users\17477\.codex\worktrees\c604\茶文化智能体`
- Compare: `prototype/src/AdminLogin.tsx`
- Compare: `prototype/src/main.tsx`
- Compare: `backend/app/api/auth.py`
- Compare: `README.md`

**Interfaces:**
- Consumes: the canonical commit published by Task 3
- Produces: both Codex tasks at the same commit and a notification to frontend thread `01a08e41-5409-7862-b3a5-14215f5df169`

- [ ] **Step 1: Identify and stop only stale frontend-worktree dev processes if present**

Inspect `Win32_Process` command lines for Node processes whose working invocation names the `c604` worktree. Stop only those exact process IDs. Do not stop API PID 84184 or canonical frontend PID 79284 when they are still bound to the `b2de` worktree.

- [ ] **Step 2: Reconfirm the frontend target has no uncommitted files**

```powershell
git -C 'C:\Users\17477\.codex\worktrees\c604\茶文化智能体' status --short
```

Expected: empty. Stop rather than overwrite if any path is listed.

- [ ] **Step 3: Detach the frontend worktree at the final canonical commit**

```powershell
$canonicalHead = (git rev-parse HEAD).Trim()
git -C 'C:\Users\17477\.codex\worktrees\c604\茶文化智能体' checkout --detach $canonicalHead
```

Expected: checkout succeeds and reports detached HEAD at the canonical commit.

- [ ] **Step 4: Verify commits, cleanliness, and critical file hashes**

```powershell
$canonicalTree = 'C:\Users\17477\.codex\worktrees\b2de\茶文化智能体'
$frontendTree = 'C:\Users\17477\.codex\worktrees\c604\茶文化智能体'
git -C $canonicalTree rev-parse HEAD
git -C $frontendTree rev-parse HEAD
git -C $canonicalTree status --short
git -C $frontendTree status --short
$paths = @('prototype/src/AdminLogin.tsx','prototype/src/main.tsx','backend/app/api/auth.py','README.md')
foreach ($path in $paths) {
    $left = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $canonicalTree $path)).Hash
    $right = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $frontendTree $path)).Hash
    "$path canonical=$left frontend=$right equal=$($left -eq $right)"
}
```

Expected: HEAD values match, both statuses are empty, and every `equal` value is `True`.

- [ ] **Step 5: Confirm the canonical integration service remains healthy**

```powershell
$api = (Invoke-RestMethod -Uri 'http://127.0.0.1:8000/health/ready' -TimeoutSec 5).status
$web = (Invoke-WebRequest -Uri 'http://127.0.0.1:4173/admin' -UseBasicParsing -TimeoutSec 5).StatusCode
"api=$api frontend=$web"
```

Expected: `api=ready frontend=200`.

- [ ] **Step 6: Notify the frontend task of the new canonical baseline**

Send this exact operational context to thread `01a08e41-5409-7862-b3a5-14215f5df169`:

```text
同步已完成：本任务工作区已覆盖为“茶文化智能体后端开发 (2)”的最终基线，HEAD 与远程 main/codex/tea-backend-integration 相同。原前端历史保存在 archive/frontend-before-backend-sync-20260911。后续请以当前 main 和后端界面为准，不要恢复旧 LoginPage/API service 实现；开始新改动前先确认工作区状态。
```

- [ ] **Step 7: Report the exact recovery commands**

Final handoff must include the final commit, the three matching remote/local refs, both worktree paths, verification results, and this recovery command without executing it:

```powershell
git push origin archive/frontend-before-backend-sync-20260911:main --force-with-lease=refs/heads/main:<final-canonical-commit>
```
