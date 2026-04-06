import { exec } from "child_process";
import { readFileSync } from "fs";
import * as fsPath from "path";
import { InputError, PackageInfo } from "./types";

function readPackageInfo(): PackageInfo {
  if (state.packageInfo !== null) {
    return state.packageInfo;
  }

  const info: PackageInfo = JSON.parse(
    readFileSync(fsPath.join(__dirname, "../package.json")).toString(),
  );
  state.packageInfo = info;

  return info;
}

export function readVersion() {
  return readPackageInfo().version;
}

function readRequiredNodeVersion() {
  const semverString = readPackageInfo().engines.node;
  const match = semverString.match(/\d+\.\d+\.\d+/);

  return match === null ? null : match[0];
}

export function checkUpdates(): void {
  const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

  exec("npm info git-jump dist-tags.latest", (error, stdout) => {
    if (error) {
      return;
    }

    const output = stdout.trim();

    if (!VERSION_PATTERN.test(output)) {
      return;
    }

    state.latestPackageVersion = output;
  });
}

export function compareSemver(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

export function ensureNodeVersion() {
  const currentVersion = process.versions.node;
  const requiredVersion = readRequiredNodeVersion();

  if (requiredVersion === null) {
    return;
  }

  if (compareSemver(currentVersion, requiredVersion) === -1) {
    throw new InputError(
      "Unsupported Node.js version.",
      `git-jump requires Node.js version >=${requiredVersion}, you're using ${currentVersion}.`,
    );
  }
}
