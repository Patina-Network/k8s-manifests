import { GitHubClient } from "@tahminator/pipeline";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import {
  checkVersionOnlyStagingPr,
  getCurrentSha,
  PR_AUTO_MERGE_STATUS_CHECK_TITLE,
} from "@/lib/version-only-staging-pr";

const { baseSha, prNumber } = await yargs(hideBin(process.argv))
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
        "This PR only bumps `newTag` in a staging `kustomization.yaml`. An owner of the affected app can comment exactly `/merge` to have it merged automatically without an approval.",
    });

    await ghClient.statusCheck({
      action: "create",
      owner: "Patina-Network",
      repository: "k8s-manifests",
      sha,
      name: PR_AUTO_MERGE_STATUS_CHECK_TITLE,
      status: "completed",
      conclusion: "success",
      output: {
        title: PR_AUTO_MERGE_STATUS_CHECK_TITLE,
        summary: "Run `/merge` to merge.",
      },
    });
  } catch (error) {
    await ghClient.statusCheck({
      action: "create",
      owner: "Patina-Network",
      repository: "k8s-manifests",
      sha,
      name: PR_AUTO_MERGE_STATUS_CHECK_TITLE,
      status: "completed",
      conclusion: "failure",
      output: {
        title: PR_AUTO_MERGE_STATUS_CHECK_TITLE,
        summary:
          "The eligibility check crashed. See the workflow run for details.",
      },
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
