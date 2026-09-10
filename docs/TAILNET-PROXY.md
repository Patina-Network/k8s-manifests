# Tailnet-only proxy (`*.proxy.patinanetwork.org`)

This sets up a way to expose internal services to the tailnet (only) at
`<name>.proxy.patinanetwork.org`, without making them publicly accessible.

> This is the **sidecar** variant: `coredns-proxy` and `traefik-internal`
> each join the tailnet directly as their own node (a `tailscale` sidecar
> container in the same pod). Compare against the `claude/headscale-traefik-coredns-beidwo`
> branch, which instead used a single subnet-router pod advertising the
> whole cluster Service CIDR into the tailnet. This version has a narrower
> blast radius (only these two pods' tailnet IPs are reachable, not every
> ClusterIP service in the cluster) at the cost of a sidecar (NET_ADMIN,
> `/dev/net/tun`, a state PVC) on each of the two deployments instead of
> one shared router pod.

## Pieces (all in `base/infrastructure/headscale/`)

- **`coredns/`** - a CoreDNS deployment (`coredns-proxy`). Answers
  `*.proxy.patinanetwork.org` with a static A record for
  `traefik-internal`'s tailnet IP (via the `template` plugin - see
  `coredns/Corefile`). Single replica: its `tailscale` sidecar carries a
  persistent tailnet identity (state on a PVC), so it isn't horizontally
  scalable the way a normal stateless CoreDNS would be.
- **`traefik-internal/`** - a second Traefik `HelmRelease`, completely
  separate from the public-facing one in `base/infrastructure/traefik`. It
  uses its own ingressClass (`traefik-internal`) and entrypoint name
  (`web-internal`), so the public Traefik instance - which also watches
  `IngressRoute`s cluster-wide - never has a matching entrypoint for these
  routes and can't accidentally serve them publicly. It listens on `:80`
  directly (via `NET_BIND_SERVICE`, since tailnet traffic bypasses the k8s
  Service and its usual 8000->80 port translation).
- **`tailscale-authkey/`** - one shared preauth-key `Secret`, used by both
  sidecars above to join the tailnet as `infra-services`-owned nodes.
- `headscale`'s `config.yaml` has a split DNS entry sending
  `proxy.patinanetwork.org` queries to `coredns-proxy`'s tailnet IP.

Both `coredns-proxy` and `traefik-internal` still also have a normal
ClusterIP `Service`/HelmRelease service for in-cluster traffic and
debugging - that path is untouched. The tailnet path goes straight to each
pod's own tailscale interface, not through those Services.

To add a new proxied service later: add an `IngressRoute` (entryPoints:
`web-internal`) next to that service, matching
`Host(\`<name>.proxy.patinanetwork.org\`)`. See
`base/staging/codebloom/ingress-proxy.yaml` for the example
(`stg.codebloom.proxy.patinanetwork.org` -> staging codebloom).

## Manual bootstrap steps (required once, in order)

This was authored without cluster/headscale/sops access, so a few values
can't be filled in or verified here. All are marked `TODO` inline too.

1. **Generate + encrypt the shared preauth key**, per the comment in
   `base/infrastructure/headscale/tailscale-authkey/secrets.yaml`:
   ```
   kubectl exec -n infrastructure deploy/headscale -- \
     headscale users create infra-services
   kubectl exec -n infrastructure deploy/headscale -- \
     headscale preauthkeys create --user infra-services --reusable --expiration 8760h
   # put the printed key into secrets.yaml, then:
   just encrypt base/infrastructure/headscale/tailscale-authkey/secrets.yaml
   ```

2. **Merge/deploy.** Both sidecars will register themselves as new nodes on
   first start - no manual route approval needed this time (no subnet
   routes are advertised at all in this variant).

3. **Get `traefik-internal`'s tailnet IP** and put it into
   `base/infrastructure/headscale/coredns/Corefile`'s `answer` line
   (replacing the `100.64.0.99` placeholder):
   ```
   headscale nodes list   # look for hostname "traefik-internal"
   ```

4. **Get `coredns-proxy`'s tailnet IP** and put it into
   `base/infrastructure/headscale/config.yaml`'s `dns.nameservers.split`
   entry (replacing the `100.64.0.98` placeholder), then commit so headscale
   picks it up:
   ```
   headscale nodes list   # look for hostname "coredns-proxy"
   ```

Steps 3 and 4 are each one-time values: once a sidecar's state PVC exists,
its tailnet identity (and therefore its IP) is stable across restarts and
redeploys.

## Testing

From a machine already joined to the tailnet:

```
dig stg.codebloom.proxy.patinanetwork.org   # should resolve via coredns-proxy
curl http://stg.codebloom.proxy.patinanetwork.org
```

The second command should hit the staging codebloom service, the same as
`https://stg.codebloom.patinanetwork.org` does publicly - but this path only
works from the tailnet.
