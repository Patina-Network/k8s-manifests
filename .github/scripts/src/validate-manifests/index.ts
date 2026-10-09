import { FluxClient, GitHubClient } from "@tahminator/pipeline";
import { $, Glob } from "bun";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const CRD_SCHEMA_LOCATION =
  "https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json";
const NON_STRING_SOPS_VALUE = /,type:(int|float|bool)\]/;

const { baseSha, prNumber } = await yargs(hideBin(process.argv))
  .option("baseSha", {
    type: "string",
    describe:
      "SHA to render the checked-out head against; the rendered diff is commented on --prNumber",
  })
  .option("prNumber", {
    type: "number",
    describe: "Pull request number to comment the rendered diff on",
  })
  .implies("baseSha", "prNumber")
  .implies("prNumber", "baseSha")
  .strict()
  .parse();

export async function main() {
  const { githubAppAppId, githubAppInstallationId, githubAppPemContent } = parseCiEnv(process.env);

  const ghClient = await GitHubClient.createWithGithubAppToken({
    appId: githubAppAppId,
    installationId: githubAppInstallationId,
    privateKey: githubAppPemContent,
  });
  const fluxClient = new FluxClient(ghClient);

  await runYamllint();
  await checkSecretTypes();

  if (baseSha && prNumber !== undefined) {
    console.log(`==> rendered diff against ${baseSha}`);
    await fluxClient.diff({
      baseRef: baseSha,
      owner: "Patina-Network",
      repository: "k8s-manifests",
      prId: prNumber,
      title: "Rendered manifest diff",
    });
  }

  const targets = [
    ...new Set((await fluxClient.findKustomizations()).map((kustomization) => kustomization.path)),
  ].sort((a, b) => a.localeCompare(b));
  console.log(`found ${targets.length} targets`);

  const outdir = await mkdtemp(path.join(tmpdir(), "validate-manifests-"));
  try {
    await buildFluxTargets(targets, outdir);
    await runKubeconform(outdir);
    await runKubeLinter(outdir);
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
}

async function runYamllint(): Promise<void> {
  console.log("==> yamllint");
  await $`yamllint -c .yamllint.yml base environments .github/workflows .github/composite`;
}

async function checkSecretTypes(): Promise<void> {
  console.log("==> checking secrets.yaml value types");

  const glob = new Glob("**/secrets.yaml");
  const files: string[] = [];
  for await (const file of glob.scan(".")) {
    files.push(file);
  }

  const contents = await Promise.all(files.map((file) => Bun.file(file).text()));

  const violations: string[] = [];
  contents.forEach((content, i) => {
    content.split("\n").forEach((line, lineIndex) => {
      if (NON_STRING_SOPS_VALUE.test(line)) {
        violations.push(`${files[i]}:${lineIndex + 1}: ${line.trim()}`);
      }
    });
  });

  if (violations.length > 0) {
    throw new Error(
      `secrets.yaml value(s) encrypted as a non-string type; Kubernetes Secret data/stringData requires strings, re-encrypt with quoted value (e.g. "5432" instead of 5432):\n${violations.join("\n")}`,
    );
  }
}

async function buildFluxTargets(targets: string[], outdir: string): Promise<void> {
  const results = await Promise.all(
    targets.map(async (target) => {
      console.log(`==> kustomize build ${target}`);
      const built = await buildFluxTarget(target, outdir);
      return { built, target };
    }),
  );

  const failures = results.filter((result) => !result.built).map((result) => result.target);

  if (failures.length > 0) {
    throw new Error(`kustomize build failed for: ${failures.join(", ")}`);
  }
}

async function buildFluxTarget(target: string, outdir: string): Promise<boolean> {
  const result = await $`kustomize build ${target}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    console.error(`FAIL: kustomize build ${target}`);
    console.error(result.stderr.toString());
    return false;
  }

  const dest = path.join(outdir, target);
  await mkdir(dest, { recursive: true });
  await Bun.write(path.join(dest, "built.yaml"), result.stdout);
  return true;
}

async function runKubeconform(outdir: string): Promise<void> {
  console.log("==> kubeconform");
  await $`kubeconform -summary -ignore-missing-schemas -schema-location default -schema-location ${CRD_SCHEMA_LOCATION} ${outdir}`;
}

async function runKubeLinter(outdir: string): Promise<void> {
  console.log("==> kube-linter");
  await $`kube-linter lint --config .kube-linter.yaml ${outdir}`;
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
