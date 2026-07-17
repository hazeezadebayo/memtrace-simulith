# Git Workflow and Commands Guide

This document defines the Git rules, common commands, and recovery workflows for the MemTrace repository.

## 1. Common Workflows

### Standard Commit & Push
Use this workflow to save and publish your local changes:
```bash
git add <files>
git commit -m "commit message"
git push origin main
```

### Checking Status & Diff
Use these commands to view modified files and inspect changes before staging:
```bash
git status
git diff
```

### Syncing with Remote
To retrieve and integrate updates from the remote repository:
```bash
git fetch origin
git pull origin main
```

## 2. When to Use (and When NOT to Use)

- **Use `git commit`** only when you have made a complete, self-contained set of logical changes. Avoid committing incomplete or broken code.
- **Use `git pull`** before beginning any new feature work to minimize merge conflicts.
- **Do NOT use `git push --force`** unless working on an isolated feature branch and after coordinating with other contributors.
- **Do NOT use `git rebase`** on public shared branches (like `main`) to prevent rewriting shared history.

## 3. Recovery Workflows

> [!WARNING]
> The following commands modify git history or discard changes. Use with extreme caution!

### Discarding Local Uncommitted Changes
To discard local modifications in a specific file:
```bash
git restore <file>
```
To discard all local uncommitted changes:
```bash
git reset --hard HEAD
```

### Undoing the Last Commit (Keeping Changes)
If you committed by mistake but want to keep the modifications in your working directory:
```bash
git reset --soft HEAD~1
```

### Undoing the Last Commit (Discarding Changes)
If you want to completely destroy the last local commit and all its changes:
```bash
git reset --hard HEAD~1
```

### Viewing History & Reference Logs
To view full commit logs:
```bash
git log --oneline -n 10
```
To view the history of Git references (useful for finding lost commits/branches):
```bash
git reflog
```
