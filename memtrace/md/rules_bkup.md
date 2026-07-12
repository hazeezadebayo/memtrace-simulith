
/// Gemini.md

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.



## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.



## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.



## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.



## 5. Reproducibility Over Convenience

**Eliminate “it works on my system.” Environments must be deterministic.**

Every project must be runnable by a stranger, on a clean machine, without guesswork.

* Default to Docker or equivalent containerization.
* Explicitly define the runtime environment (OS base image, language version, system dependencies).
* Maintain an authoritative dependency manifest:

  * `requirements.txt` / `pyproject.toml` for Python
  * `package.json` / lockfiles for JavaScript
  * `Cargo.toml`, `go.mod`, `composer.json`, `CMakeLists.txt`, etc., as appropriate
* Dependency lists must reflect what is actually required to run the project — not guesses, not leftovers.
* When new libraries/packages are introduced:

  * Update the dependency file immediately.
  * Remove dependencies that become unused due to YOUR changes.
* If a language lacks a standard dependency file, define one and explain it.

The test:
A fresh clone + documented steps must succeed without manual fixes.



## 6. Living Documentation as a First-Class Artifact

**Documentation is not optional, static, or cosmetic. It evolves with the code.**

### a. `project_report.md` (continuous, technical, authoritative)

This file must be created and continuously updated. It is written for future engineers *and other AI agents*.

It must contain:

* A concise project introduction and purpose
* Technical, algorithmic, or mathematical breakdown (as applicable)
* A high-level architectural flow (textual + flowchart-style description)
* Clear separation of:

  * What has been completed
  * What is currently in progress
  * What remains to be done
* Step-by-step reasoning such that another model could continue work **without ambiguity**

If behavior or structure changes, this file must change with it.

### b. `README.md` (entry point for humans)

This file must always explain:

* What the project is
* Where to start
* How to install dependencies (or use Docker)
* How to build and run the project
* How to run tests (if any)
* Expected inputs/outputs

Additionally:

* The full project directory structure must be drawn and kept up to date.
* Any change to structure or execution steps requires a README update.

The test:
A new contributor should not need to ask how to run the project.



## 7. Isolation, Hygiene, and Host Safety

**The host machine is sacred. Treat it as immutable.**

* Never install dependencies directly on the host unless absolutely unavoidable.
* Prefer:

  * Docker containers
  * Virtual environments
  * Language-specific sandboxing tools
* If host installation is unavoidable:

  * State why isolation is insufficient
  * Ask for explicit permission before proceeding
* Experiments, prototypes, and production code all follow the same isolation rules.
* No “quick installs,” no silent global changes.

The test:
The host should remain clean even after the project is abandoned.



## 8. Explicit Git Discipline

**Version control actions must be intentional, documented, and justified.**

* Maintain a dedicated script or document (e.g. `git_workflow.md` or `git_commands.sh`) that includes:

  * Initial repository setup and publishing to remote
  * Common workflows (clone, branch, commit, push, pull, fetch, merge, rebase)
  * When to use each command and when *not* to
  * Recovery commands (reset, revert, stash, reflog) with warnings
* The command list should be comprehensive — covering the vast majority of day-to-day Git usage.
* If any agent needs to run a Git command not listed:

  * It must justify the command
  * Explain the risk
  * Request permission before execution

The test:
No Git command should ever feel “casual” or unexplained.









//// workflow -> project-checklist.md

# Agent Operating Contract — Iteration Checklist

If any item fails, the agent must stop and correct or ask.

---

## 1. Clarity Invariant

**Am I acting with full understanding?**

* [ ] All assumptions I’m relying on are explicit.
* [ ] Ambiguities have been surfaced, not silently resolved.
* [ ] If multiple interpretations existed, the chosen one is justified.
* [ ] I am not proceeding despite confusion.

---

## 2. Scope Invariant

**Am I solving only the requested problem?**

* [ ] Every change directly supports the stated goal.
* [ ] No abstractions exist without reuse.
* [ ] The solution is no more complex than required.

---

## 3. Change Boundary Invariant

**Did I touch only what I was allowed to touch?**

* [ ] Every modified line traces to the request.
* [ ] Unrelated code was not refactored, reformatted, or “cleaned up.”
* [ ] Existing style and conventions were preserved.

---

## 4. Verification Invariant

**Can success be objectively verified right now?**

* [ ] The change can be verified (test, output, invariant, behavior).
* [ ] Bugs are reproducible before and resolved after.

---

## 5. Reproducibility Invariant

**Would this still work somewhere else?**

* [ ] The runtime and system dependencies are defined.
* [ ] New dependencies are documented immediately.
* [ ] Removed dependencies were cleaned up.

---

## 6. Documentation Invariant

**Does the documentation describe reality *right now*?**

* [ ] `project_report.md` reflects the current state and intent.
* [ ] Another agent could continue from the documentation alone.
* [ ] `README.md` correctly explains setup, execution, and structure.

---

## 7. Isolation Invariant

**Is the host protected?**

* [ ] The change runs in an isolated environment.
* [ ] Docker or virtual environments are preferred.
* [ ] Host installs (if any) were justified and approved.


---

## 8. Version Control Invariant

**Are version control actions intentional and auditable?**

* [ ] The reason for each Git action/command is stated and documented.
* [ ] No undocumented or “casual” commands were run.
* [ ] Risky commands are justified and permissioned.