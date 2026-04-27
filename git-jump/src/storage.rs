use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{BufReader, BufWriter},
    path::Path,
};

use crate::types::Branch;
use anyhow::{Context, Result};
use serde::Deserialize;

pub fn get_and_clean_branches(data_file: &Path, branch_names: &[&str]) -> Result<Vec<Branch>> {
    let mut jump_data: BranchCollection = load_jump_data(&data_file)?;

    keep_branches(&mut jump_data, branch_names);
    let reconciled_branches = reconcile_branches(&jump_data, branch_names);

    save_branches_jump_data(&data_file, &jump_data)?;

    Ok(reconciled_branches)
}

type BranchCollection = HashMap<String, u64>;

/// Reads the historical data from disk, updates the timestamp in memory,
/// and immediately flushes the changes back to `.jump/data.json`.
pub fn update_branch_last_switch(data_file: &Path, name: &str, last_switch: u64) -> Result<()> {
    let mut jump_data: BranchCollection = load_jump_data(&data_file)?;

    set_branch_timestamp(&mut jump_data, name, last_switch);

    save_branches_jump_data(&data_file, &jump_data)
}

/// Reads the current data from disk, applies the pure rename transformation,
/// and safely writes the updated history back to `.jump/data.json`.
pub fn rename_jump_data_branch(data_file: &Path, current_name: &str, new_name: &str) -> Result<()> {
    let mut jump_data: BranchCollection = load_jump_data(&data_file)?;

    rename_branch(&mut jump_data, current_name, new_name);

    save_branches_jump_data(&data_file, &jump_data)
}

/// Reads the current data from disk, filters out the specified branches,
/// and writes the clean data back to `.jump/data.json`.
pub fn delete_jump_data_branch(data_file: &Path, branch_names: &[&str]) -> Result<()> {
    let mut jump_data: BranchCollection = load_jump_data(&data_file)?;

    delete_branches(&mut jump_data, branch_names);

    save_branches_jump_data(&data_file, &jump_data)
}

// --- actual file I/O

#[derive(Deserialize)]
#[serde(untagged)]
enum OnDisk {
    V2(HashMap<String, u64>),
    V1(HashMap<String, BranchEntry>),
}

#[derive(Deserialize)]
struct BranchEntry {
    #[serde(rename = "lastSwitch")]
    last_switch: u64,
}

fn parse_from_disk(data: OnDisk) -> BranchCollection {
    match data {
        OnDisk::V2(hash_map) => hash_map,
        OnDisk::V1(hash_map) => hash_map
            .into_iter()
            .map(|(k, v)| (k, v.last_switch))
            .collect::<BranchCollection>(),
    }
}

/// Loads jump data from disk, normalising the on-disk format if needed.
///
/// Supports both:
/// - the legacy V1 format (`{ "branch": { "name": <string>, "lastSwitch": <timestamp> } }`)
/// - the current V2 format (`{ "branch": <timestamp> }`)
///
/// When a V1 file is encountered, the original is copied to `<data_file>.v1.bak`
/// before the caller writes it back in V2 form.
fn load_jump_data(data_file: &Path) -> Result<BranchCollection> {
    let file = File::open(data_file)?;
    let reader = BufReader::new(file);

    let branches: OnDisk =
        serde_json::from_reader(reader).context("Failed to deserialize jump data")?;

    match branches {
        OnDisk::V2(_) => {}
        OnDisk::V1(_) => {
            // This is the aforementioned side-effect
            create_backup(data_file)?;
        }
    };

    Ok(parse_from_disk(branches))
}

fn create_backup(data_file: &Path) -> Result<()> {
    let backup_file = data_file.with_extension(".json.v1.bak");
    fs::copy(data_file, backup_file).context("Failed to back up old jump data file")?;
    Ok(())
}

fn save_branches_jump_data(data_file: &Path, jump_data: &BranchCollection) -> Result<()> {
    let file = File::open(data_file)?;
    let writer = BufWriter::new(file);
    serde_json::to_writer(writer, &jump_data).context("Failed to write serialized branch data")?;
    Ok(())
}

// pure utils

fn reconcile_branches(jump_data: &BranchCollection, branch_names: &[&str]) -> Vec<Branch> {
    branch_names
        .iter()
        .map(|&branch_name| Branch {
            name: branch_name.to_owned(),
            last_switch: jump_data.get(branch_name).copied().unwrap_or(0u64),
        })
        .collect::<Vec<Branch>>()
}

fn set_branch_timestamp(jump_data: &mut BranchCollection, name: &str, last_switch: u64) {
    jump_data.insert(name.to_owned(), last_switch);
}

fn rename_branch(jump_data: &mut BranchCollection, current_name: &str, new_name: &str) {
    if let Some(last_switch) = jump_data.remove(current_name) {
        jump_data.insert(new_name.to_owned(), last_switch);
    };
}

enum FilterMode {
    Keep,
    Delete,
}

fn filter_jump_data(jump_data: &mut BranchCollection, branch_names: &[&str], mode: FilterMode) {
    let set: HashSet<&str> = branch_names.iter().copied().collect();
    jump_data.retain(|k, _| {
        let in_set = set.contains(k.as_str());
        match mode {
            FilterMode::Keep => in_set,
            FilterMode::Delete => !in_set,
        }
    });
}

fn keep_branches(jump_data: &mut BranchCollection, branch_names: &[&str]) {
    filter_jump_data(jump_data, branch_names, FilterMode::Keep);
}

fn delete_branches(jump_data: &mut BranchCollection, branch_names: &[&str]) {
    filter_jump_data(jump_data, branch_names, FilterMode::Delete);
}
