use std::path::PathBuf;

// AppConfig is not the best name. This is more like.. runtime info?
// - cols, rows, max_rows are definitely just runtime information
// - modifier_key is presentation info, previously it was a `isMac` boolean flag
//   that just changed the string we displayed for the modifier key (opt or alt)
// - main_worktree is actually constant every time
// - active_worktree depends on where you run it from
pub struct Model {
    pub main_worktree: PathBuf,
    pub active_worktree: PathBuf,
    pub modifier_key: ModifierKey,
    pub columns: usize,
    pub rows: usize,
    pub max_rows: usize,
    pub branches: Vec<Branch>,
    pub worktrees: Vec<Worktree>,
    pub interactive_state: Option<UIState>,
}

pub enum ModifierKey {
    Alt,
    Option,
}

pub struct Branch {
    pub name: String,
    pub last_switch: u64,
}

pub struct Worktree {
    pub dir: PathBuf,
    pub head: Head,
}

pub enum Head {
    Detached { sha: String },
    Branch { name: String },
}

// There are two modes, plain (compute-and-print-and-exit) and interactive (Elm loop)
// the interactive mode requires the following state to be present on the model
pub struct UIState {
    pub highlighted_line_index: usize,
    pub search_string: String,
    pub cursor_position: usize,
}
// the interactive mode renders the available branches using the following rules:
// - render the currently checked out branch / hash first
// - render all the rest of the branches (nothing detached) that are not checked out in worktrees
// - render all the rest of the branches that *are* checked out in other linked worktrees
//
// So Vec<Either<Head, Branch>> is also not quite honest. Really it should be this struct:
struct List {
    head: Head,
    available_branches: Vec<Branch>,
    checked_out_branches: Vec<Branch>,
}

// the Non-interactive mode really just renders things on-demand
// and may not even need this type at all
enum Msg {
    Info(Vec<String>),
    Error { title: String, body: String },
}
