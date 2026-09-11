import { $ } from "bun";
import path from "node:path";

export const PR_AUTO_MERGE_STATUS_CHECK_TITLE = "PR auto-merge eligible";

export type VersionOnlyStagingPrCheck = {
  changedFiles: string[];
  eligible: boolean;
};

export async function checkVersionOnlyStagingPr(
  baseSha: string,
): Promise<VersionOnlyStagingPrCheck> {
  const changedFiles = await getChangedFiles(baseSha);

  if (
    changedFiles.length === 0 ||
    !changedFiles.every(isStagingKustomizationFile)
  ) {
    return { changedFiles, eligible: false };
  }

  const changedLines = await getChangedDiffLines(baseSha, "HEAD", changedFiles);
  const eligible = changedLines.length > 0 && changedLines.every(isNewTagLine);

  return { changedFiles, eligible };
}

/** Fetches `baseSha` and returns the files changed between it and the checked-out HEAD. */
export async function getChangedFiles(baseSha: string): Promise<string[]> {
  await fetchCommit(baseSha);

  const { stdout } = await $`git diff --name-only ${baseSha} HEAD`
    .quiet()
    .nothrow();

  return stdout
    .toString()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function getCurrentSha(): Promise<string> {
  const { stdout } = await $`git rev-parse HEAD`.quiet().nothrow();
  return stdout.toString().trim();
}

/** Extracts `<name>` from a `base/<environment>/<name>/kustomization.yaml` path. */
export function getStagingAppName(file: string): string {
  const segments = path.normalize(file).split(path.sep);
  const app = segments[2];
  if (!app) {
    throw new Error(`Could not determine app name from staging file: ${file}`);
  }
  return app;
}

async function fetchCommit(sha: string): Promise<void> {
  await $`git fetch --depth=1 origin ${sha}`.quiet().nothrow();
}

function isStagingKustomizationFile(file: string): boolean {
  return (
    path.basename(file) === "kustomization.yaml" &&
    path.normalize(file).startsWith(`base${path.sep}staging${path.sep}`)
  );
}

async function getChangedDiffLines(
  base: string,
  head: string,
  files: string[],
): Promise<string[]> {
  const topLevelFiles = files.map((file) => `:/${file}`);

  const { stdout } = await $`git diff ${base} ${head} -- ${topLevelFiles}`
    .quiet()
    .nothrow();

  return stdout
    .toString()
    .split("\n")
    .filter(
      (line) =>
        (line.startsWith("+") || line.startsWith("-")) &&
        !line.startsWith("+++") &&
        !line.startsWith("---"),
    );
}

const NEW_TAG_LINE = /^[+-]\s*newTag:\s*\S+\s*(#.*)?$/;

function isNewTagLine(line: string): boolean {
  return NEW_TAG_LINE.test(line);
}
