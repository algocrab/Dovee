export type GitFile = {
  path: string;
  index: string;
  worktree: string;
  label: string;
};

export type GitCommit = {
  hash: string;
  short: string;
  author: string;
  date: string;
  subject: string;
};

export type GitStatus = {
  isRepo: boolean;
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  remote: string | null;
  files: GitFile[];
  unpushed: GitCommit[];
};
