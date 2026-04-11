# `k8s-manifests`

## How to setup Flux on a new cluster

1. Update `./environments/flux-system/gotk-sync.yaml` to point to your public repository link.

1. Authenticate into your cluster (test with `k get pods` to ensure that authentication succeeded)

1. Run `kubectl apply -k ./environments/flux-system` to kick off Flux

## How to output and view Helm templates

```bash
helm template <name-inside-of-Chart-yaml> ./environments/path/to/folder/where/helm/Chart/yaml/lives

# e.g.
helm template github-repositories ./environments/infrastructure/crossplane/github/repositories
```
