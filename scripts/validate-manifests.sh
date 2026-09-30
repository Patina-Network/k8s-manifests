#!/usr/bin/env bash
# Validates every Kubernetes manifest Flux will actually apply.
#
# Flux's kustomize-controller reconciles each `path:` referenced by a
# `kustomize.toolkit.fluxcd.io/Kustomization` (see environments/**/sync.yaml),
# not the `environments/` tree itself -- that tree only wires up the Flux
# Kustomization/HelmRelease/GitRepository/HelmRepository objects. So this
# script discovers every such path and builds/validates it directly, the
# same way Flux would.
#
# Requires: yamllint, kustomize, kubeconform, kube-linter on PATH.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo "==> yamllint"
yamllint -c .yamllint.yml base environments .github/workflows .github/composite

echo "==> discovering Flux Kustomization targets"
mapfile -t targets < <(grep -rhE '^[[:space:]]*path:[[:space:]]*\./' environments --include=sync.yaml | sed 's/.*path:[[:space:]]*//' | sort -u)
echo "found ${#targets[@]} targets"

outdir="$(mktemp -d)"
trap 'rm -rf "$outdir"' EXIT

status=0
for target in "${targets[@]}"; do
  echo "==> kustomize build ${target}"
  dest="$outdir/${target#./}"
  mkdir -p "$dest"
  if ! kustomize build "$target" > "$dest/built.yaml" 2>/tmp/kustomize-build-err; then
    echo "FAIL: kustomize build ${target}"
    cat /tmp/kustomize-build-err
    status=1
  fi
done

# Also validate the Flux wiring layer itself (Kustomization/HelmRelease/
# GitRepository/HelmRepository/CRDs under environments/).
echo "==> kustomize build environments"
mkdir -p "$outdir/environments"
kustomize build environments > "$outdir/environments/built.yaml"

if [ "$status" -ne 0 ]; then
  echo "one or more kustomize builds failed, skipping schema/policy checks"
  exit "$status"
fi

echo "==> kubeconform"
# -ignore-missing-schemas: Flux's CRD manifest (gotk-components.yaml) ships
# CustomResourceDefinition objects that this catalog doesn't carry a
# meta-schema for; treat as skipped, not fatal.
# no -strict: SOPS-encrypted Secrets carry a top-level `sops:` metadata key
# in git that the sops decryption provider strips before the apiserver ever
# sees it, so it's a legitimate false additional-property under strict mode.
#
# Each target is built into its own file under $outdir (mirroring its repo
# path), rather than one combined multi-resource blob, so failures point at
# the actual target instead of an opaque line number in a temp file.
kubeconform -summary -ignore-missing-schemas \
  -schema-location default \
  -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' \
  "$outdir"

echo "==> kube-linter"
kube-linter lint --config .kube-linter.yaml "$outdir"
