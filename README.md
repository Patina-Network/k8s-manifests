# `k8s-manifests`

## Pre-requisites

```bash
# automatically loads environment variables from the project
brew install direnv
# command line runner - interfaces with Justfile
brew install just
# kubernetes
brew install kubectl
# azure cli
brew install az
# required for kubectl RBAC
brew install Azure/kubelogin/kubelogin
```

## Get Started

Run `just auth` in order to authenticate and retrieve credentials for the cluster. Then, simply run `kubectl get pods -A` to verify that you have access.

All users in `@Patina-Network/developers` should automatically have read-only access to the cluster. If you:

- do not have read-only access
- require a manual write operation to occur (that Flux cannot or is failing to do)

then reach out to a `@Patina-Network/infra` member.

### How to setup Flux on a new cluster

1. Update `./environments/flux-system/gotk-sync.yaml` to point to your public repository link.

1. Authenticate into your cluster (test with `k get pods` to ensure that authentication succeeded)

1. Run `kubectl apply -k ./environments/flux-system` to kick off Flux.

> [!NOTE]
> Applying `flux-system` will fail. Watch the pods and ensure that the Flux controllers are up and online first, then run the same command again.

> [!NOTE]
> `kustomize-controller` requires access to secrets, which is tied to a service account + RBAC.
> Go to `./environments/flux-system/patches/kustomize-controller-service-account.yaml` and follow the instructions in there to get
> & update the new client ID

> [!NOTE]
> Flux may get stuck due to the fact that Flux isn't smart enough to install CRDs first (see [here](https://github.com/fluxcd/helm-controller/issues/387)).
> You should run `kubectl apply -k environments/infrastructure` to install all CRDs. This may also provision some resources but Flux should take over and handle
> drift after that.

### How to output and view Helm templates

```bash
helm template <name-inside-of-Chart-yaml> ./environments/path/to/folder/where/helm/Chart/yaml/lives

# e.g.
helm template github-repositories ./environments/infrastructure/crossplane/github/repositories
```
