re-auth:
  az logout && just auth

auth:
  just install-pre-scripts && az login && kubelogin remove-cache-dir && kubelogin convert-kubeconfig -l azurecli && just get-creds

get-creds:
  az aks get-credentials --resource-group k8s --name k8s-manifests --overwrite-existing --file ./.kube/config

encrypt file *args:
  just install-pre-scripts && sops --encrypt --in-place {{ file }} {{ args }}

decrypt file *args:
  just install-pre-scripts && sops --decrypt --in-place {{ file }} {{ args }}

e file *args:
  just encrypt {{ file }} {{ args }}

d file *args:
  just decrypt {{ file }} {{ args }}

appe app env:
  just basee {{ app }} {{ env }}

appd app env:
  just based {{ app }} {{ env }}

basee app env:
  just encrypt base/{{ env }}/{{ app }}/secrets.yaml

based app env:
  just decrypt base/{{ env }}/{{ app }}/secrets.yaml

reconcile *args:
  flux reconcile ks flux-system --with-source {{ args }}

install-pre-scripts:
  just install-pre-push && just install-pre-commit

install-pre-commit:
  cp pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

install-pre-push:
  cp pre-commit .git/hooks/pre-push && chmod +x .git/hooks/pre-push

watch:
  watch "git log -1 && echo '---' && kubectl get pods -A && echo '---' && flux get kustomizations"
