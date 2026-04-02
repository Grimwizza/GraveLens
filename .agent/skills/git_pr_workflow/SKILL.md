---
name: git_pr_workflow
description: Automates Git commits, pushes to the branch, and opens a GitHub Pull Request.
---
<execution_rules>
When asked to commit or open a PR, execute the following steps in order:
1. Look at the staged and unstaged changes using `git diff` [6].
2. Write a clear, concise commit message based strictly on what changed [6]. Use the Conventional Commits standard (e.g., `feat:`, `fix:`).
3. Commit the changes and push them to the current remote branch [6].
4. Use the `gh pr create` CLI command to open a pull request with a generated title and detailed description [6].
</execution_rules>