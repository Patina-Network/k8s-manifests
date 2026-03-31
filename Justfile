encrypt file *args:
  sops --encrypt --in-place {{ file }} {{ args }}

decrypt file *args:
  sops --decrypt --in-place {{ file }} {{ args }}

appe app env:
  just encrypt apps/{{ env }}/{{ app }}/secrets.yaml

appd app env:
  just decrypt apps/{{ env }}/{{ app }}/secrets.yaml

reconcile *args:
  flux reconcile ks flux-system --with-source {{ args }}

watch:
  watch "git log -1 && echo '---' && kubectl get pods -A && echo '---' && flux get kustomizations"
