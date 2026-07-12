# Git Workflow Guide

This document defines the authoritative version control procedures and commands allowed in this workspace.



# GitHub Setup & Deployment Guide

This document outlines all the commands and steps used to successfully initialize, configure, and push the Memgraph AI Core project to GitHub.

## Project Information
- **Repository Name**: memtrace
- **GitHub URL**: https://github.com/hazeezadebayo/memtrace-simulith.git
- **Local Path**: `/home/azeez/ws/dev_env/py_code/projects/memtrace`

## Step-by-Step Commands Executed

### 1. Initialize Git Repository

```bash
cd "/home/azeez/ws/dev_env/py_code/projects/memtrace"
git init
```

**Result**: Initialized empty Git repository in `./.git/`

### 2. Configure Git for Safe Directory Access

Due to Windows ownership issues, we needed to whitelist the directory:

```bash
git config --global --add safe.directory "/home/azeez/ws/dev_env/py_code/projects/memtrace"
```

**Result**: Directory marked as safe in git config to bypass ownership verification

### 3. Create .gitignore File

Created comprehensive `.gitignore` to exclude unnecessary files:

```bash
# File: .gitignore
# Contents include:
# - Python artifacts (__pycache__, *.egg, venv/, etc.)
# - IDE files (.vscode/, .idea/)
# - Node.js artifacts (node_modules/, npm-debug.log)
# - Build artifacts (dist/, build/, *.tar.gz, *.zip)
# - Environment files (.env, .env.local)
# - Jupyter notebooks (.ipynb_checkpoints)
# - OS specific files (Thumbs.db, .DS_Store)
```

### 4. Stage All Files for Commit

```bash
cd "/home/azeez/ws/dev_env/py_code/projects/memtrace"
git add -A
```

**Result**: 51 files staged for commit (with LF/CRLF line ending warnings, which is normal on Windows)

### 5. Create Initial Commit

```bash
git commit -m "Initial commit: Memgraph AI Core with universal chat threadlet and LLM server integration"
```

**Result**: 
- Commit hash: `cce5fc9`
- 51 files changed, 144,724 insertions
- Includes all project files without zip archives

### 6. Remove Zip Archive Files (First Cleanup)

Since we didn't want to upload version archive zips:

```bash
git rm --cached v0/v1_universal-chat.zip
git rm --cached v0/v2_universal-chat-threadlet.zip
git rm --cached v0/v3_universal-chat-threadlet.zip
git rm --cached v0/v4_dw_universal-chat-threadlet.zip
git rm --cached v0/v4bad_universal-chat-threadlet.zip
git rm --cached v5_universal-chat-threadlet.zip
git rm --cached v6_universal-chat-threadlet.zip
git rm --cached v7.0_universal-chat-threadlet.zip
git rm --cached v7.1_universal-chat-threadlet.zip
git rm --cached v7.2_universal-chat-threadlet.zip
git rm --cached v7.4_universal-chat-threadlet.zip
git rm --cached v7.5_universal-chat-threadlet.zip
git rm --cached v8.0_universal-chat-threadlet.zip
git rm --cached v8.1_universal-chat-threadlet.zip
```

### 7. Update .gitignore to Exclude Zips

```bash
# Added to .gitignore:
*.zip
```

### 8. Commit the Cleanup

```bash
git add .gitignore
git commit -m "Remove zip archive files - keep only source code"
```

**Result**: 
- Commit hash: `3bfb954`
- 15 files deleted
- .gitignore updated

### 9. Add Remote Repository

```bash
git remote add origin https://github.com/hazeezadebayo/memtrace-simulith.git
```

**Result**: Remote `origin` configured pointing to GitHub repository

### 10. Rename Branch to Main

```bash
git branch -M main
```

**Result**: Default branch renamed to `main` (GitHub standard)

### 11. Push to GitHub

```bash
git push -u origin main
```

**Result**: 
- Successfully pushed 54 objects
- 16.58 MiB transferred
- Set up tracking: `main` → `origin/main`
- Status: ✅ **SUCCESS**









## 1. Initial Repository Setup & Publishing

* **`git init`**
  - *When to use:* Creating a new repository locally.
  - *When NOT to use:* If the repository is already initialized or cloned.
* **`git clone <url>`**
  - *When to use:* Downloading a remote repository for the first time.
* **`git remote add <name> <url>`**
  - *When to use:* Binding a local repository to a remote service like GitHub.
  - *When NOT to use:* If the remote has already been added. Check with `git remote -v`.
* **`git push -u origin <branch>`**
  - *When to use:* Publishing a new branch to the remote and setting upstream tracking.

## 2. Common Workflows

### Synchronizing
* **`git fetch`**
  - *When to use:* Safely checking for updates on remote branches without modifying local work.
* **`git pull origin <branch>`**
  - *When to use:* Fetching and merging updates from the remote.
  - *When NOT to use:* If you have uncommitted changes that might conflict. Commit or stash them first.

### Branch Management
* **`git branch`**
  - *When to use:* Listing local branches.
* **`git checkout -b <branch>`**
  - *When to use:* Creating a new feature or fix branch from your current HEAD.
* **`git checkout <branch>`**
  - *When to use:* Switching to an existing branch.

### Staging & Committing
* **`git status`**
  - *When to use:* Inspecting modified, untracked, or staged files.
* **`git diff`**
  - *When to use:* Reviewing lines modified before staging or committing them.
* **`git add <file>` / `git add .`**
  - *When to use:* Staging changes to prepare them for the next commit.
* **`git commit -m "<message>"`**
  - *When to use:* Committing staged modifications with a clear, descriptive message.

### Integrating Code
* **`git merge <branch>`**
  - *When to use:* Merging changes from another branch (e.g. main) into your current branch.
* **`git rebase <branch>`**
  - *When to use:* Reapplying commits from your branch on top of another branch to keep a linear history.
  - *When NOT to use:* On public/shared branches where others have based their work (can cause history mismatch).

## 3. Recovery Operations

* **`git stash`**
  - *When to use:* Temporarily saving uncommitted changes to work on a clean tree.
* **`git stash pop`**
  - *When to use:* Restoring previously stashed changes.
* **`git revert <commit-hash>`**
  - *When to use:* Creating a new commit that undoes the changes of a prior commit. (Extremely safe as it preserves history).
* **`git reset --hard HEAD`**
  - *Warning:* **DESTRUCTIVE**. Reverts working directory and index to the last commit, discarding all uncommitted code.
  - *When to use:* When you want to completely discard your local modifications.
* **`git reset --soft HEAD~1`**
  - *When to use:* Undoing the last local commit while keeping its changes staged in your working directory.
* **`git reflog`**
  - *When to use:* Recovering lost commits or tracking checkout history.
