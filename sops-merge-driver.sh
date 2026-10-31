#!/usr/bin/env bash
set -euo pipefail
umask 077

# Git merge driver arguments:
# %O = ancestor
# %A = ours (output must be written here)
# %B = theirs
# %P = repository-relative filename

if [[ $# -ne 4 ]]; then
  echo "Usage: $0 BASE OURS THEIRS PATH" >&2
  exit 2
fi

ANCESTOR="$1"
OURS="$2"
THEIRS="$3"
FILEPATH="$4"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Decrypt all three versions explicitly as YAML.
sops decrypt --input-type yaml --output-type yaml \
  "$ANCESTOR" >"$TMP/base.yaml" || {
  echo "Failed to decrypt ancestor: $FILEPATH" >&2
  exit 2
}

sops decrypt --input-type yaml --output-type yaml \
  "$OURS" >"$TMP/ours.yaml" || {
  echo "Failed to decrypt ours: $FILEPATH" >&2
  exit 2
}

sops decrypt --input-type yaml --output-type yaml \
  "$THEIRS" >"$TMP/theirs.yaml" || {
  echo "Failed to decrypt theirs: $FILEPATH" >&2
  exit 2
}

# Three-way plaintext merge.
set +e
git merge-file \
  "$TMP/ours.yaml" \
  "$TMP/base.yaml" \
  "$TMP/theirs.yaml"
STATUS=$?
set -e

if [[ "$STATUS" -eq 1 ]]; then
  echo "SOPS merge conflict: $FILEPATH" >&2
  exit 1
elif [[ "$STATUS" -ne 0 ]]; then
  echo "git merge-file failed: $STATUS" >&2
  exit "$STATUS"
fi

# Re-encrypt using the repository's SOPS configuration.
sops encrypt \
  --input-type yaml \
  --output-type yaml \
  --filename-override "$FILEPATH" \
  "$TMP/ours.yaml" >"$TMP/encrypted.yaml"

# Replace Git's output only after successful encryption.
cat "$TMP/encrypted.yaml" >"$OURS"

echo "SOPS merge successful: $FILEPATH" >&2
exit 0
