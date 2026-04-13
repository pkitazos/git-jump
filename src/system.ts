import { exec } from "child_process";
import { readFileSync } from "fs";
import * as fsPath from "path";

import { err, InputError, ok, PackageInfo, Result } from "./types";

let cachedPackageInfo: PackageInfo | null = null;

// I really don't like this whole thing where we get info from NPM
// and manually extract the version using regex from the response
// I'll need to think of a better solution to this later on

const SEMVER_EXACT_PATTERN = /^\d+\.\d+\.\d+$/;
const SEMVER_RANGE_PATTERN = /\d+\.\d+\.\d+/;

export function fetchLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    exec("npm info git-jump dist-tags.latest", (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }

      const version = stdout.trim();
      resolve(SEMVER_EXACT_PATTERN.test(version) ? version : null);
    });
  });
}

// I could technically just inline this, but It makes the `readPackageInfo` function
// more focused on what it's job is
function isPackageInfo(value: unknown): value is PackageInfo {
  if (typeof value !== "object" || value === null) return false;

  // since I check for typeof === "object", this assertion is fine
  const obj = value as Record<string, unknown>;
  if (typeof obj.version !== "string") return false;
  if (typeof obj.engines !== "object" || obj.engines === null) return false;

  // same here
  const engines = obj.engines as Record<string, unknown>;
  if (typeof engines.node !== "string") return false;

  return true;
}

export function readPackageInfo(): Result<PackageInfo> {
  if (cachedPackageInfo !== null) return ok(cachedPackageInfo);

  const data: unknown = JSON.parse(
    readFileSync(fsPath.join(__dirname, "../package.json"), "utf-8"),
  );

  if (!isPackageInfo(data)) {
    return err(new Error("package.json is missing required fields"));
  }

  const nodeVersionMatch = data.engines.node.match(SEMVER_RANGE_PATTERN);
  if (nodeVersionMatch === null)
    return err(
      new Error(
        `package.json engines.node is not a valid semver: ${data.engines.node}`,
      ),
    );

  // cache the result so subsequent calls skip the file read and validation
  cachedPackageInfo = {
    version: data.version,
    engines: { node: nodeVersionMatch[0] },
  };

  return ok(cachedPackageInfo);
}

export function isOlderVersion(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { numeric: true }) < 0;
}

export function ensureNodeVersion(): Result<void> {
  const currentVersion = process.versions.node;
  const res = readPackageInfo();

  if (res.tag === "err") return err(res.error);

  const requiredVersion = res.value.engines.node;

  if (isOlderVersion(currentVersion, requiredVersion))
    return err(
      new InputError(
        "Unsupported Node.js version.",
        `git-jump requires Node.js version >=${requiredVersion}, you're using ${currentVersion}.`,
      ),
    );

  return ok(undefined);
}
