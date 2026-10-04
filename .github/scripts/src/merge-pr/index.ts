import { GitHubClient } from "@tahminator/pipeline";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { getOwningTeams, parseTeamReference } from "@/lib/owners";
import {
  getChangedFiles,
  getCurrentSha,
  getStagingAppName,
  MERGE_STATUS_CHECK_NAME,
} from "@/lib/version-only-staging-pr";

const { baseSha, commenter, prNumber, runUrl } = await yargs(
  hideBin(process.argv),
)
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
  .option("runUrl", {
    type: "string",
    describe: "URL of the workflow run to link from the status check",
    demandOption: true,
  })
  .strict()
  .parse();

export async function main() {
  const { githubAppAppId, githubAppInstallationId, githubAppPemContent } =
    parseCiEnv(process.env);

  const ghClient = await GitHubClient.createWithGithubAppToken({
    appId: githubAppAppId,
    installationId: githubAppInstallationId,
    privateKey: githubAppPemContent,
  });

  const sha = await getCurrentSha();

  const statusCheck = await ghClient.statusCheck({
    action: "get",
    name: MERGE_STATUS_CHECK_NAME,
    owner: "Patina-Network",
    ref: sha,
    repository: "k8s-manifests",
  });

  if (!statusCheck || statusCheck.conclusion !== "success") {
    console.log("PR is not eligible.");
    return;
  }

  const checkRunId = statusCheck.id;

  console.log("PR is eligible.");

  const changedFiles = await getChangedFiles(baseSha);
  const appNames = [...new Set(changedFiles.map(getStagingAppName))];
  const missingOwnerApps = appNames.filter(
    (appName) => getOwningTeams(appName).length === 0,
  );

  if (missingOwnerApps.length > 0) {
    const summary = `No owning team is configured in \`.github/OWNERS.yaml\` for: ${missingOwnerApps
      .map((appName) => `\`${appName}\``)
      .join(", ")}.`;

    await ghClient.statusCheck({
      action: "update",
      checkRunId,
      conclusion: "failure",
      detailsUrl: runUrl,
      output: { summary, title: "Missing OWNERS.yaml entry" },
      owner: "Patina-Network",
      repository: "k8s-manifests",
      status: "completed",
    });
    return;
  }

  if (!(await isAuthorizedToMerge({ appNames, commenter, ghClient }))) {
    const summary = `@${commenter} is not an owner of: ${appNames
      .map((appName) => `\`${appName}\``)
      .join(", ")}.`;

    await ghClient.statusCheck({
      action: "update",
      checkRunId,
      conclusion: "failure",
      detailsUrl: runUrl,
      output: { summary, title: "Not authorized" },
      owner: "Patina-Network",
      repository: "k8s-manifests",
      status: "completed",
    });
    return;
  }

  await mergeAndReportStatus({ checkRunId, ghClient });
}

/** Merges the PR, moving the same check run through in-progress -> success/failure. */
async function mergeAndReportStatus({
  checkRunId,
  ghClient,
}: {
  checkRunId: number;
  ghClient: GitHubClient;
}): Promise<void> {
  await ghClient.statusCheck({
    action: "update",
    checkRunId,
    detailsUrl: runUrl,
    output: { summary: "Merging pr...", title: "Merging" },
    owner: "Patina-Network",
    repository: "k8s-manifests",
    status: "in_progress",
  });

  let succeeded = false;

  try {
    await ghClient.mergePr({
      prId: prNumber,
      owner: "Patina-Network",
      repository: "k8s-manifests",
    });

    succeeded = true;
  } finally {
    await ghClient.statusCheck({
      action: "update",
      checkRunId,
      conclusion: succeeded ? "success" : "failure",
      detailsUrl: runUrl,
      output:
        succeeded ?
          { summary: "PR merged.", title: "Merged" }
        : {
            summary: "See the workflow run for details.",
            title: "Merge failed",
          },
      owner: "Patina-Network",
      repository: "k8s-manifests",
      status: "completed",
    });
  }
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
