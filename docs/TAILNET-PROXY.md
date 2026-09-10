# Tailnet-only proxy (`*.proxy.patinanetwork.org`)

This sets up a way to expose internal services to the tailnet (only) at
`<name>.proxy.patinanetwork.org`, without making them publicly accessible.

## Pieces (all in `base/infrastructure/headscale/`)

- **`coredns/`** - a CoreDNS deployment (`coredns-proxy`, ClusterIP only).
  Answers `*.proxy.patinanetwork.org` by rewriting the query to
  `traefik-internal.infrastructure.svc.cluster.local` and forwarding it to
  the cluster's own DNS, so it always returns Traefik's current ClusterIP -
  no hardcoded IPs needed on this side.
- **`traefik-internal/`** - a second Traefik `HelmRelease` (ClusterIP only,
  plain HTTP), completely separate from the public-facing one in
  `base/infrastructure/traefik`. It uses its own ingressClass
  (`traefik-internal`) and entrypoint name (`web-internal`), so the public
  Traefik instance - which also watches `IngressRoute`s cluster-wide - never
  has a matching entrypoint for these routes and can't accidentally serve
  them publicly.
- **`tailscale-router/`** - a single pod that joins the tailnet as a subnet
  router and advertises a route for the cluster's Service CIDR. This is what
  makes `coredns-proxy` and `traefik-internal` (both ClusterIP, i.e. normally
  cluster-internal only) reachable from the tailnet at all.
- `headscale`'s `config.yaml` now has a split DNS entry sending
  `proxy.patinanetwork.org` queries to `coredns-proxy`'s ClusterIP.

To add a new proxied service later: add an `IngressRoute` (entryPoints:
`web-internal`) next to that service, matching
`Host(\`<name>.proxy.patinanetwork.org\`)`. See
`base/staging/codebloom/ingress-proxy.yaml` for the example
(`stg.codebloom.proxy.patinanetwork.org` -> staging codebloom).

## Manual bootstrap steps (required once, in order)

This was authored without cluster/headscale/sops access, so a few values
can't be filled in or verified here. All are marked `TODO` inline too.

1. **Confirm the cluster's Service CIDR** and update
   `base/infrastructure/headscale/tailscale-router/deployment.yaml`'s
   `TS_ROUTES` if it's not `10.0.0.0/16`:
   ```
   az aks show --resource-group k8s --name k8s-manifests \
     --query networkProfile.serviceCidr -o tsv
   ```

2. **Generate + encrypt the subnet router's preauth key**, per the comment
   in `base/infrastructure/headscale/tailscale-router/secrets.yaml`:
   ```
   kubectl exec -n infrastructure deploy/headscale -- \
     headscale users create infra-services
   kubectl exec -n infrastructure deploy/headscale -- \
     headscale preauthkeys create --user infra-services --reusable --expiration 8760h
   # put the printed key into secrets.yaml, then:
   just encrypt base/infrastructure/headscale/tailscale-router/secrets.yaml
   ```

3. **Merge/deploy**, then approve the advertised route (headscale requires
   manual route approval by default):
   ```
   headscale routes list
   headscale routes enable -r <id of the k8s-proxy-router route>
   ```

4. **Get `coredns-proxy`'s ClusterIP** and put it into
   `base/infrastructure/headscale/config.yaml`'s `dns.nameservers.split`
   entry (replacing the `10.0.0.53` placeholder), then commit so headscale
   picks it up:
   ```
   kubectl get svc coredns-proxy -n infrastructure -o jsonpath='{.spec.clusterIP}'
   ```

## Testing

From a machine already joined to the tailnet:

```
dig stg.codebloom.proxy.patinanetwork.org   # should resolve via coredns-proxy
curl http://stg.codebloom.proxy.patinanetwork.org
```

The second command should hit the staging codebloom service, the same as
`https://stg.codebloom.patinanetwork.org` does publicly - but this path only
works from the tailnet.
