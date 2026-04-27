use anyhow::{Result, anyhow};

use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::PathBuf,
};

use git_jump::{
    git::{GitDirs, list_worktrees, locate_git_repo_dirs, read_raw_git_branches},
    storage::get_and_clean_branches,
    types::{Branch, Model, ModifierKey, Worktree},
};

struct InitData {
    main_worktree: PathBuf,
    active_worktree: PathBuf,
    branches: Vec<Branch>,
    worktrees: Vec<Worktree>,
}

/// The name of the hidden directory created within the target Git repository
/// to store jump-related metadata.
const JUMP_FOLDER: &str = ".jump";

/// The name of the JSON file where branch usage history and timestamps are saved.
const DATA_FILE: &str = "data.json";

fn ensure_jump_folder_exists(path: &PathBuf) -> Result<()> {
    let jump_store_dir = path.join(JUMP_FOLDER);
    let store_data_file = jump_store_dir.join(DATA_FILE);

    if !jump_store_dir.exists() {
        if let Err(e) = fs::create_dir(jump_store_dir) {
            return Err(anyhow!("Couldn't create {} dir: {}", JUMP_FOLDER, e));
        };

        let mut file = OpenOptions::new()
            .append(true)
            .open(path.join(".git").join("info").join("exclude"))
            .unwrap();

        if let Err(e) = writeln!(file, "\n{}", JUMP_FOLDER) {
            return Err(anyhow!("Couldn't write to file: {}", e));
        }
    }

    if !store_data_file.exists() {
        let mut file = File::create(store_data_file)?;
        if let Err(e) = file.write_all(b"{}") {
            return Err(anyhow!("Couldn't write to file: {}", e));
        }
    }

    Ok(())
}

fn init() -> Result<InitData> {
    let GitDirs {
        main_worktree,
        active_worktree,
    } = locate_git_repo_dirs()?;

    ensure_jump_folder_exists(&main_worktree)?;

    let raw_git_branches = read_raw_git_branches()?;
    let branch_names: Vec<&str> = raw_git_branches.iter().map(|s| s.as_str()).collect();

    let worktrees = list_worktrees()?;

    let branches = get_and_clean_branches(&main_worktree, &branch_names)?;

    Ok(InitData {
        main_worktree,
        active_worktree,
        branches,
        worktrees,
    })
}

fn main() -> Result<()> {
    let data = init()?;

    let (columns, rows) = crossterm::terminal::size()?;

    let modifier_key = if std::env::consts::OS == "macos" {
        ModifierKey::Option
    } else {
        ModifierKey::Alt
    };

    let mut state: Model = Model {
        main_worktree: data.main_worktree,
        active_worktree: data.active_worktree,
        columns: columns as usize,
        rows: rows as usize,
        max_rows: rows as usize,
        branches: data.branches,
        worktrees: data.worktrees,
        modifier_key: modifier_key,
        interactive_state: None,
    };

    Ok(())
}
