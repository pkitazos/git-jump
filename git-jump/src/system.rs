use anyhow::{Context, Result, anyhow};
use regex::Regex;

use std::process::Command;

use std::sync::LazyLock;

// so the reason these can't just be constant values is that initialising a Regex
// only happens at runtime, because for potentially very large patterns constructing the NFA/DF
// may actually require heap allocations and a `const` needs to be compile-time computable
// so using LazyLock means its computed the first time we need it,
// but every other time we need it it's using the same computed pattern
fn semver_exact_pattern(haystack: &str) -> bool {
    static RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\d+\.\d+\.\d+$").unwrap());
    RE.is_match(haystack)
}

pub fn fetch_latest_version() -> Result<String> {
    // ! don't worry about this still querying npm for now
    // ! this will eventually just be an API call to fetch the latest GitHub release
    // ! as that will be the new source of truth
    let output = Command::new("npm")
        .arg("info")
        .arg("@pkitazos/git-jump")
        .arg("dist-tags.latest")
        .output()?;

    if !output.status.success() {
        // the reason we're using the lossy variant here is because otherwise
        // we might end up bubbling up a conversion error which just adds noise.
        // If npm ever returns non-valid utf8, then we have bigger problems to deal with
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("npm exited with {}: {}", output.status, err_msg));
    }

    let version =
        String::from_utf8(output.stdout).context("npm returned non-UTF-8 bytes on stdout")?;
    // trimming the Vec<u8> directly also works but that requires taking ownership
    // and then having the method borrow it and re-allocated a new vector on the heap
    // `String::from_utf8` just "re-labels" the same buffer in memory as a String if it contains
    // only valid utf8 characters
    let version = version.trim();

    if semver_exact_pattern(version) {
        Ok(version.to_owned())
    } else {
        Err(anyhow!("the returned string doesn't contain a version"))
    }
}
