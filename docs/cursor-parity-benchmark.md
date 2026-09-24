# Dovee Cursor-Parity Benchmark

This benchmark is the acceptance checklist for the local-first coding workflow.
Run it on a clean Windows install and record the result in a dated copy of this
file or in the release notes.

## Measures

- Completion latency: request to first inline suggestion.
- Completion acceptance: accepted suggestions / shown suggestions.
- Context precision: selected files that are relevant / selected files.
- Agent completion: tasks finished with passing validation / tasks started.
- Tool-loop rate: turns stopped by repeat protection / total agent turns.
- First-success time: install to the first completed task.
- UI overflow: clipped or unreachable controls at 960px, 1200px, and 1440px.

## Ten repeatable tasks

1. Complete an unfinished function and accept one word and one full-line suggestion.
2. Add an import and use a dependency type from a TypeScript project.
3. Rename a symbol and verify diagnostics remain clean.
4. Fix a deliberately failing unit test.
5. Implement a small feature across three files and review the generated diff.
6. Repair a test failure by sending terminal output back to the agent.
7. Create a branch, stage selected files, commit, and recover an uncommitted edit.
8. Find a symbol in a large workspace and inspect the context selected for the agent.
9. Install a local extension, run its command, disable it, and verify isolation.
10. Start the packaged app without network access and open a local project.

## Screenshot design baseline

The supplied IDE screenshot is the baseline for the following states:

- Git panel: commit composer, staged/unstaged groups, history, and primary action.
- Editor: active tab, dirty state, line numbers, breadcrumbs, and readable code.
- Agent: task header, progress/tool states, response content, and composer.
- Shell chrome: activity rail, top bar, status bar, focus rings, and panel dividers.

Record visual checks for dark, light, and dusk themes. Each state must have:

- visible focus and hover feedback;
- no clipped labels or inaccessible controls;
- keyboard-only navigation;
- readable contrast and minimum 32px interactive targets;
- empty, loading, error, offline, and narrow-panel states.

## Current baseline

| Area | Current implementation | Next gate |
| --- | --- | --- |
| Editor intelligence | Monaco TypeScript libs and project models | Inline completion latency and acceptance |
| Context | Search and file watcher | Ranked index and context inspector |
| Agent | Streaming tools, repeat protection, visual diffs | Plan, checkpoint, validate, rollback |
| Extensions | Native Dovee extension API | Documented compatibility subset |
| Recovery | Dirty-buffer confirmation and auto-save | Journal and session restore |
| UI | Resizable shell with Git and agent panels | Screenshot states and accessibility audit |
