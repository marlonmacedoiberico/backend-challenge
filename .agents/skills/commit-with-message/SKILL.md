---
name: commit-with-message
description: Review repository changes, write a concise commit message, commit, and push. Use when the user invokes /commit-with-message or $commit-with-message, or asks to commit and push changes with an automatically chosen message.
---

# Commit with message

Invoking this skill authorizes committing the reviewed working-tree changes and pushing to the repository. Creating or discussing the skill does not invoke it.

## Workflow

1. Identify the repository, current branch, upstream, and working-tree status. Review staged and unstaged diffs and relevant untracked files before deciding what belongs in the commit. Respect any user-specified file scope; otherwise include the reviewed project changes, including existing user edits. Exclude credentials, generated artifacts, and unrelated files. Ask only if the intended scope or push destination is ambiguous.
2. Run checks appropriate to the changes and repository instructions. For documentation changes, check the diff and relevant links; do not install dependencies or run the application solely to commit documentation. Do not silently fix unrelated issues.
3. Write a concise, accurate commit subject describing the result. Follow the repository's established message convention when clear. Prefer a single line with no body unless essential context requires one.
4. Stage the selected files explicitly, review the staged diff, and commit with that message. Preserve unrelated staged changes; do not accidentally include them in a scoped commit. If there are no changes to commit, report that and push any existing unpushed commits only when covered by the user's request.
5. Push the current branch to its configured upstream. If no upstream exists, use the repository's unambiguous intended remote and the same branch name, setting the upstream. If the remote or branch is unclear, ask. Never force-push, amend existing commits, reset, or discard changes as part of this workflow. If a push is rejected, report the reason and leave the local commit intact; do not automatically rebase or merge.

## Result

Report the commit subject, short commit hash, and push outcome concisely. If a check, commit, or push fails, identify the blocker and accurately report what completed.
