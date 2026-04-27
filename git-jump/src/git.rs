use anyhow::{Context, Result, anyhow};
use std::{path::PathBuf, process::Command};

use crate::types::{Head, Worktree};

pub struct GitDirs {
    pub main_worktree: PathBuf,
    pub active_worktree: PathBuf,
}

pub fn locate_git_repo_dirs() -> Result<GitDirs> {
    let stdout = run_git_cmd(&["rev-parse", "--path-format=absolute", "--git-common-dir"])?;
    let main_worktree = PathBuf::from(stdout);

    let stdout = run_git_cmd(&["rev-parse", "--show-toplevel"])?;
    let active_worktree = PathBuf::from(stdout);

    Ok(GitDirs {
        main_worktree,
        active_worktree,
    })
}

pub fn read_raw_git_branches() -> Result<Vec<String>> {
    let branches = run_git_cmd(&["branch", "--format=%(refname:short)"])?;

    let branches: Vec<String> = branches
        .split("\n\n")
        .filter(|s| !s.is_empty())
        .map(|s| s.to_owned())
        .collect();

    return Ok(branches);
}
pub fn list_worktrees() -> Result<Vec<Worktree>> {
    let stdout = run_git_cmd(&["worktree", "list", "--porcelain"])?;

    stdout
        .split("\n\n")
        .filter(|s| !s.is_empty())
        .map(|r| {
            let entry_lines: Vec<&str> = r.lines().collect();
            parse_worktree_entry(&entry_lines)
        })
        .collect::<Result<Vec<Worktree>>>()
}

pub fn fetch_remote_branches() -> Result<Vec<String>> {
    let branches = run_git_cmd(&[
        "for-each-ref",
        "--format='%(refname:lstrip=3)'",
        "refs/remotes/",
    ])?;

    let mut branches: Vec<String> = branches
        .lines()
        .map(|s| s.to_owned())
        .filter(|s| !s.is_empty())
        .collect();

    branches.sort();
    branches.dedup();

    Ok(branches)
}

fn parse_worktree_entry(lines: &[&str]) -> Result<Worktree> {
    let mut dir: Option<PathBuf> = None;
    let mut sha: Option<&str> = None;
    let mut branch: Option<&str> = None;
    let mut detached = false;
    let mut bare = false;

    for line in lines.iter() {
        match line.split_once(' ') {
            Some((key, val)) => match key {
                "worktree" => dir = Some(PathBuf::from(val)),
                "HEAD" => sha = Some(val),
                "branch" => {
                    branch = match val.strip_prefix("refs/heads") {
                        Some(name) => Some(name),
                        None => Some(val),
                    }
                }
                _ => {}
            },
            None => {
                match line.as_ref() {
                    "bare" => bare = true,
                    "detached" => detached = true,
                    _ => {}
                };
            }
        }
    }

    match (bare, detached, sha, branch, dir) {
        (true, _, _, _, _) => Err(anyhow!("Bare repo not supported")),
        (false, true, Some(sha), None, Some(dir)) => Ok(Worktree {
            dir,
            head: Head::Detached {
                sha: sha.to_owned(),
            },
        }),
        (false, false, None, Some(name), Some(dir)) => Ok(Worktree {
            dir,
            head: Head::Branch {
                name: name.to_owned(),
            },
        }),
        _ => Err(anyhow!("Malformed worktree record: {:?}", lines)),
    }
}

fn run_git_cmd(args: &[&str]) -> Result<String> {
    let mut cmd = Command::new("git");
    cmd.args(args);

    let output = cmd.output()?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("git exited with {}: {}", output.status, err_msg));
    };

    let stdout =
        String::from_utf8(output.stdout).context("git returned non-UTF-8 bytes on stdout")?;

    Ok(stdout.trim().to_owned())
}
