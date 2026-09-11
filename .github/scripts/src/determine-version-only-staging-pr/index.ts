import { GitHubClient } from "@tahminator/pipeline";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import {
  checkVersionOnlyStagingPr,
  getCurrentSha,
  MERGE_STATUS_CHECK_NAME,
} from "@/lib/version-only-staging-pr";

const { baseSha, prNumber, runUrl } = await yargs(hideBin(process.argv))
  .option("baseSha", {
    type: "string",
    describe:
      "SHA of the PR's base commit to diff the checked-out head against",
    demandOption: true,
  })
  .option("prNumber", {
    type: "number",
    describe: "Pull request number to check and comment on",
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

  try {
    const { eligible } = await checkVersionOnlyStagingPr(baseSha);
    if (!eligible) {
      console.log("PR is not eligible.");
      return;
    }

    console.log("PR is eligible.");

    await ghClient.sendPrMessage({
      prId: prNumber,
      owner: "Patina-Network",
      repository: "k8s-manifests",
      message:
        "This PR is eligible for auto-merge. An owner of the affected app can comment `/merge` to have it merged automatically without an approval.",
    });

    await ghClient.statusCheck({
      action: "create",
      conclusion: "success",
      detailsUrl: runUrl,
      name: MERGE_STATUS_CHECK_NAME,
      output: {
        summary: "Run /merge to merge.",
        title: "Eligible for auto-merge",
      },
      owner: "Patina-Network",
      repository: "k8s-manifests",
      sha,
      status: "completed",
    });
  } catch (error) {
    await ghClient.statusCheck({
      action: "create",
      conclusion: "failure",
      detailsUrl: runUrl,
      name: MERGE_STATUS_CHECK_NAME,
      output: {
        summary: "See the workflow run for details.",
        title: "Eligibility check crashed",
      },
      owner: "Patina-Network",
      repository: "k8s-manifests",
      sha,
      status: "completed",
    });
    throw error;
  }
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
