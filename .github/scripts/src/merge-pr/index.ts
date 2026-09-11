import { GitHubClient } from "@tahminator/pipeline";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { getOwningTeams, parseTeamReference } from "@/lib/owners";
import {
  checkVersionOnlyStagingPr,
  getStagingAppName,
} from "@/lib/version-only-staging-pr";

const { baseSha, commenter, prNumber } = await yargs(hideBin(process.argv))
  .option("baseSha", {
    type: "string",
    describe:
      "SHA of the PR's base commit to diff the checked-out head against",
    demandOption: true,
  })
  .option("prNumber", {
    type: "number",
    describe: "Pull request number to merge",
    demandOption: true,
  })
  .option("commenter", {
    type: "string",
    describe: "Username of whoever commented `/merge`",
    demandOption: true,
  })
  .strict()
  .parse();

export async function main() {
  const { changedFiles, eligible } = await checkVersionOnlyStagingPr(baseSha);
  if (!eligible) {
    console.log("PR is not eligible.");
    return;
  }

  console.log("PR is eligible.");

  const { githubAppAppId, githubAppInstallationId, githubAppPemContent } =
    parseCiEnv(process.env);

  const ghClient = await GitHubClient.createWithGithubAppToken({
    appId: githubAppAppId,
    installationId: githubAppInstallationId,
    privateKey: githubAppPemContent,
  });

  const appNames = [...new Set(changedFiles.map(getStagingAppName))];
  const missingOwnerApps = appNames.filter(
    (appName) => getOwningTeams(appName).length === 0,
  );

  if (missingOwnerApps.length > 0) {
    await ghClient.sendPrMessage({
      prId: prNumber,
      owner: "Patina-Network",
      repository: "k8s-manifests",
      message: `Could not run \`/merge\`: no owning team is configured in \`.github/OWNERS.yaml\` for: ${missingOwnerApps
        .map((appName) => `\`${appName}\``)
        .join(", ")}. Add an entry there and try again.`,
    });
    return;
  }

  if (!(await isAuthorizedToMerge({ appNames, commenter, ghClient }))) {
    return;
  }

  await ghClient.mergePr({
    prId: prNumber,
    owner: "Patina-Network",
    repository: "k8s-manifests",
  });
}

/** Requires `commenter` to own every app touched by the PR, per `.github/OWNERS.yaml`. */
async function isAuthorizedToMerge({
  appNames,
  commenter,
  ghClient,
}: {
  appNames: string[];
  commenter: string;
  ghClient: GitHubClient;
}): Promise<boolean> {
  for (const appName of appNames) {
    const owningTeams = getOwningTeams(appName);

    if (!(await isMemberOfAnyTeam({ commenter, ghClient, owningTeams }))) {
      return false;
    }
  }

  return true;
}

async function isMemberOfAnyTeam({
  commenter,
  ghClient,
  owningTeams,
}: {
  commenter: string;
  ghClient: GitHubClient;
  owningTeams: string[];
}): Promise<boolean> {
  for (const teamReference of owningTeams) {
    const { org, teamSlug } = parseTeamReference(teamReference);
    if (await ghClient.isTeamMember({ org, teamSlug, username: commenter })) {
      return true;
    }
  }
  return false;
}

function parseCiEnv(ciEnv: Record<string, string | undefined>) {
  const githubAppAppId = (() => {
    const v = ciEnv["_GITHUB_APP_APP_ID"];
    if (!v) {
      throw new Error("Missing _GITHUB_APP_APP_ID from env");
    }
    return v;
  })();

  const githubAppInstallationId = (() => {
    const v = ciEnv["_GITHUB_APP_INSTALLATION_ID"];
    if (!v) {
      throw new Error("Missing _GITHUB_APP_INSTALLATION_ID from env");
    }
    return v;
  })();

  const githubAppPemContent = (() => {
    const v = ciEnv["_GITHUB_APP_PEM_CONTENT"];
    if (!v) {
      throw new Error("Missing _GITHUB_APP_PEM_CONTENT from env");
    }
    return v;
  })();

  return { githubAppAppId, githubAppInstallationId, githubAppPemContent };
}

if (import.meta.main) {
  await main();
}
