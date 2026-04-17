# Useful k8s commands

## `kubectl`

> [!NOTE]
> `k` is an alias for `kubectl`, use whichever one is setup on your machine.

| Command                     | Description                                                                                                                       | Example                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `k get pods -A`             | Get all pods across all namespaces                                                                                                |                                                                      |
| `k get namespaces`          | Get all namespaces within cluster                                                                                                 |                                                                      |
| `kubens <namespace>`        | All subsequent `k` commands will be in that namespace. No more `k ... -n blahblah`!                                               | `kubens production && k get pods && k get svc`                       |
| `k get pods -n {namespace}` | Get all pods in a specific namespace                                                                                              |                                                                      |
| `k get svc`                 | Get all `Service` objects. This shows you any service that can receive traffic (internal traffic, external traffic or both)       |                                                                      |
| `k api-resources`           | List all object types in the cluster. You can take `NAME` (or `SHORTNAME`) and do `k get` on it to view available objects         |                                                                      |
| `k describe pod/{pod-name}` | Get the specific details about that pod. That includes configuration, deployment status, issues, etc.                             | `k describe pod/codebloom-af4312`                                    |
| `k describe {type}/{name}`  | You can plug in any type (e.g. `svc`, `ingressroute`) with the name of the object to see details.                                 | `k describe svc/codebloom`                                           |
| `k explain {name}`          | You can plug in any type with the name of the object to see details. You may need `--api-version={apiVersion}` if it is too vague | `k explain ingressroutes --api-version=traefik.io/v1alpha1`          |
| `k explain {name}.{item}`   | You can go deeper into the explanation of nested objects.                                                                         | `k explain ingressroutes.metadata --api-version=traefik.io/v1alpha1` |

## `flux`

| Command                      | Description                                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `flux get kustomizations -A` | Get all flux kustomizations in the cluster. Useful to see whether your changes have been picked up yet or not.              |
| `flux get sources all`       | Get all flux sources in the cluster. Useful to see whether repositories and releases have been picked up / upgraded or not. |
