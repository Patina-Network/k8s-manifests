import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const OWNERS_FILE_PATH = path.join(import.meta.dir, "../../../OWNERS.yaml");

type OwnersFile = Record<string, string[]>;

let cachedOwners: OwnersFile | undefined;

function loadOwners(): OwnersFile {
  cachedOwners ??= parse(readFileSync(OWNERS_FILE_PATH, "utf-8")) as OwnersFile;
  return cachedOwners;
}

/** Returns the `@org/team` references that own `base/<appName>`, per `.github/OWNERS.yaml`. */
export function getOwningTeams(appName: string): string[] {
  return loadOwners()[appName] ?? [];
}

export function parseTeamReference(teamReference: string): {
  org: string;
  teamSlug: string;
} {
  const match = /^@([^/]+)\/(.+)$/.exec(teamReference);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid team reference: ${teamReference}`);
  }
  return { org: match[1], teamSlug: match[2] };
}
