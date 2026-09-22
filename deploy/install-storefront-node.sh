#!/usr/bin/env bash
#
# Install Node 22 for the deploy user only, for the storefront.
#
# Run ON THE VPS as `tayyab`. No sudo, and nothing outside ~/.local changes:
#
#     scp deploy/install-storefront-node.sh personalVps:/tmp/
#     ssh personalVps 'bash /tmp/install-storefront-node.sh'
#
# Why not upgrade /usr/bin/node: it is the apt-packaged Node 18 that other
# services on this shared box run on. The storefront gets its own runtime,
# matching the Node 22 that CI builds and tests it with.
#
# Result: ~/.local/node22 -> ~/.local/node-v22.x.y-linux-x64. Both the systemd
# unit (deploy/paknutrition-storefront.service) and the deploy workflow use
# ~/.local/node22/bin, so re-running this later upgrades both at once by
# moving the symlink. Idempotent; the download is checked against the
# SHA-256 that nodejs.org publishes before anything is extracted.

set -euo pipefail

BASE_URL="https://nodejs.org/dist/latest-v22.x"
PREFIX="${HOME}/.local"
LINK="${PREFIX}/node22"

case "$(uname -m)" in
    x86_64)  ARCH=x64 ;;
    aarch64) ARCH=arm64 ;;
    *) echo "Unsupported architecture: $(uname -m)"; exit 1 ;;
esac

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

curl -fsSL "${BASE_URL}/SHASUMS256.txt" -o "${WORK}/SHASUMS256.txt"
TARBALL="$(grep -oE "node-v22\.[0-9]+\.[0-9]+-linux-${ARCH}\.tar\.xz" "${WORK}/SHASUMS256.txt" | head -1)"
[ -n "$TARBALL" ] || { echo "Could not find a linux-${ARCH} tarball in SHASUMS256.txt"; exit 1; }
DIR="${PREFIX}/${TARBALL%.tar.xz}"

if [ -x "${DIR}/bin/node" ]; then
    echo "Already installed: ${DIR}"
else
    echo "Downloading ${TARBALL}"
    curl -fsSL "${BASE_URL}/${TARBALL}" -o "${WORK}/${TARBALL}"
    (cd "$WORK" && grep " ${TARBALL}\$" SHASUMS256.txt | sha256sum -c -)
    mkdir -p "$PREFIX"
    tar -xJf "${WORK}/${TARBALL}" -C "$PREFIX"
fi

ln -sfn "$DIR" "$LINK"

echo "node: $("${LINK}/bin/node" --version)  npm: $("${LINK}/bin/npm" --version)  at ${LINK}/bin"
echo "System node untouched: $(/usr/bin/node --version 2>/dev/null || echo 'none')"
