### Azure authentication commands

# logout and authenticate again
re-auth:
  az logout && just auth

# authenticate then load AKS kubeconfig
auth:
  just install-pre-scripts && az login && kubelogin remove-cache-dir && kubelogin convert-kubeconfig -l azurecli && just get-creds

# load AKS kubeconfig (should be called after authentication)
get-creds:
  az aks get-credentials --resource-group k8s --name k8s-manifests --overwrite-existing --file ./.kube/config

### Secret management
# sops is a library that handles the encryption and decryption of files (primarily used for secrets).
# Our secrets are encrypted & stored inside of secrets.yaml.
# The reason why our secrets are checked into version control is so we can
# programmatically change them, track & diff them (similar to what we do with regular source code).

# Use if you created a new secret file and need to encrypt it with SOPS
# If you are editing a file that has already been encrypted, see `just edit`
encrypt file *args:
  just install-pre-scripts && sops --encrypt --in-place {{ file }} {{ args }}

# Securely edit any secret file that is encrypted with SOPS
# You can change the editor it will call on by changing the $EDITOR environment variable
# 
# you can choose to set it one time for the scope of the command: `EDITOR="nvim" just edit secrets.yaml`
# or you can put `export EDITOR=nvim` inside of your `~/.zshrc`, then restart your terminal & run: `just edit secrets.yaml`
#
# if you would like to use VSCode, `EDITOR="code --wait"` (You may have to follow this first: https://code.visualstudio.com/docs/setup/mac#_launch-vs-code-from-the-command-line)
edit file *args:
  just install-pre-scripts && sops edit {{ file }} {{ args }}

# edit a secrets file in `./base` using shortcuts
# e.g. if i want to edit `./base/production/codebloom/secrets.yaml`
# i would do `just editbase codebloom production`
editbase env app:
  just edit base/{{ env }}/{{ app }}/secrets.yaml

# useful view of everything you may want to see
# latest commit
# ---
# all available pods in cluster
# ---
# all registered flux kustomizations in cluster (incl. revision they are on & current status)
watch:
  watch "git log -1 && echo '---' && kubectl get pods -A && echo '---' && flux get kustomizations"

# Force Flux to reconcile now instead of waiting for the next cycle (requires write permission to cluster)
reconcile *args:
  just install-pre-scripts && flux reconcile ks flux-system --with-source {{ args }}


# Git hooks are installed on almost every command
# so that we don't accidentally add unencrypted secrets to the git history.
install-pre-scripts:
  just install-pre-push && just install-pre-commit

install-pre-commit:
  cp pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit

install-pre-push:
  cp pre-commit .git/hooks/pre-push && chmod +x .git/hooks/pre-push
