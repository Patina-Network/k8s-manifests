import { Glob } from "bun";
import path from "node:path";
import { parseAllDocuments } from "yaml";

/** A Flux `Kustomization` declared in an `environments/**\/sync.yaml`. */
export type FluxTarget = {
  name: string;
  path: string;
  targetNamespace?: string;
};

/** Returns every Flux `Kustomization` declared under `<root>/environments`, sorted by name. */
export async function discoverFluxTargets(root = "."): Promise<FluxTarget[]> {
  const glob = new Glob("environments/**/sync.yaml");
  const files = await Array.fromAsync(glob.scan({ cwd: root }));

  const contents = await Promise.all(
    files.map((file) => Bun.file(path.join(root, file)).text()),
  );

  const targets: FluxTarget[] = [];
  for (const content of contents) {
    for (const doc of parseAllDocuments(content)) {
      const resource = doc.toJS();
      const name = resource?.metadata?.name;
      const targetPath = resource?.spec?.path;
      const targetNamespace = resource?.spec?.targetNamespace;
      if (
        resource?.kind === "Kustomization" &&
        typeof resource?.apiVersion === "string" &&
        resource.apiVersion.startsWith("kustomize.toolkit.fluxcd.io/") &&
        typeof name === "string" &&
        typeof targetPath === "string"
      ) {
        targets.push({
          name,
          path: path.normalize(targetPath),
          ...(typeof targetNamespace === "string" ? { targetNamespace } : {}),
        });
      }
    }
  }

  return targets.sort((a, b) => a.name.localeCompare(b.name));
}
