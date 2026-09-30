import { $, Glob } from "bun";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseAllDocuments } from "yaml";

const CRD_SCHEMA_LOCATION =
  "https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json";

export async function main() {
  await runYamllint();

  const targets = await discoverFluxTargets();
  console.log(`found ${targets.length} targets`);

  const outdir = await mkdtemp(path.join(tmpdir(), "validate-manifests-"));
  try {
    await buildFluxTargets([...targets, "environments"], outdir);
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

async function discoverFluxTargets(): Promise<string[]> {
  const targets = new Set<string>();

  const glob = new Glob("environments/**/sync.yaml");
  for await (const file of glob.scan(".")) {
    const contents = await Bun.file(file).text();
    for (const doc of parseAllDocuments(contents)) {
      const resource = doc.toJS();
      const targetPath = resource?.spec?.path;
      if (
        resource?.kind === "Kustomization" &&
        typeof resource?.apiVersion === "string" &&
        resource.apiVersion.startsWith("kustomize.toolkit.fluxcd.io/") &&
        typeof targetPath === "string"
      ) {
        targets.add(path.normalize(targetPath));
      }
    }
  }

  return [...targets].sort();
}

async function buildFluxTargets(
  targets: string[],
  outdir: string,
): Promise<void> {
  const failures: string[] = [];
  for (const target of targets) {
    console.log(`==> kustomize build ${target}`);
    const built = await buildFluxTarget(target, outdir);
    if (!built) {
      failures.push(target);
    }
  }

  if (failures.length > 0) {
    throw new Error(`kustomize build failed for: ${failures.join(", ")}`);
  }
}

async function buildFluxTarget(
  target: string,
  outdir: string,
): Promise<boolean> {
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

if (import.meta.main) {
  await main();
}
