#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$REPO_DIR"

if [[ ! -f .env ]]; then
  echo "ERROR: .env is required" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. "$REPO_DIR/.env"
set +a

if [[ "${IMAGE_AUTO_UPDATE_ENABLED:-false}" != "true" ]]; then
  exit 0
fi

BLOG_IMAGE="${BLOG_IMAGE:-ghcr.io/jung-geun/tablog:latest}"
EMBEDDING_IMAGE="${EMBEDDING_IMAGE:-ghcr.io/jung-geun/tablog-embedding:latest}"
if [[ "$BLOG_IMAGE" != "ghcr.io/jung-geun/tablog:main" || "$EMBEDDING_IMAGE" != "ghcr.io/jung-geun/tablog-embedding:main" ]]; then
  echo "ERROR: automatic updates require BLOG_IMAGE and EMBEDDING_IMAGE to use their :main tags" >&2
  exit 1
fi
export BLOG_IMAGE EMBEDDING_IMAGE
WAIT_SECONDS="${IMAGE_UPDATE_WAIT_SECONDS:-2400}"
if [[ ! "$WAIT_SECONDS" =~ ^[1-9][0-9]{0,3}$ ]] || (( WAIT_SECONDS > 3600 )); then
  echo "ERROR: IMAGE_UPDATE_WAIT_SECONDS must be an integer from 1 to 3600" >&2
  exit 1
fi

LOCK_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/monolog"
mkdir -p "$LOCK_DIR"
chmod 700 "$LOCK_DIR"
exec 9>"$LOCK_DIR/image-update.lock"
flock -n 9 || exit 0

CREDENTIAL_FILE="${GHCR_PULL_CREDENTIALS_FILE:-$HOME/.config/tablog/ghcr-pull.env}"
if [[ ! -f "$CREDENTIAL_FILE" ]]; then
  echo "ERROR: GHCR pull credentials file is missing: $CREDENTIAL_FILE" >&2
  exit 1
fi
CREDENTIAL_MODE="$(stat -c '%a' "$CREDENTIAL_FILE")"
CREDENTIAL_OWNER="$(stat -c '%u' "$CREDENTIAL_FILE")"
if [[ "$CREDENTIAL_OWNER" != "$(id -u)" || ( "$CREDENTIAL_MODE" != "600" && "$CREDENTIAL_MODE" != "400" ) ]]; then
  echo "ERROR: GHCR pull credentials file must be owned by this user with mode 0600 or 0400" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$CREDENTIAL_FILE"
set +a
: "${GHCR_PULL_USERNAME:?GHCR_PULL_USERNAME is required in the GHCR credentials file}"
: "${GHCR_PULL_TOKEN:?GHCR_PULL_TOKEN is required in the GHCR credentials file}"
export GH_TOKEN="$GHCR_PULL_TOKEN"
if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI is required to verify image provenance" >&2
  exit 1
fi

OLD_BLOG_ID=""
OLD_EMBEDDING_ID=""
PULL_STARTED=false
ROLLOUT_COMPLETE=false

DOCKER_CONFIG="$(mktemp -d "${TMPDIR:-/tmp}/tablog-docker-auth.XXXXXX")"
chmod 700 "$DOCKER_CONFIG"
export DOCKER_CONFIG
# shellcheck disable=SC2329
cleanup() {
  if [[ "$PULL_STARTED" == "true" && "$ROLLOUT_COMPLETE" != "true" ]]; then
    [[ -z "$OLD_BLOG_ID" ]] || docker image tag "$OLD_BLOG_ID" "$BLOG_IMAGE" >/dev/null 2>&1 || echo "ERROR: could not restore local blog image tag" >&2
    [[ -z "$OLD_EMBEDDING_ID" ]] || docker image tag "$OLD_EMBEDDING_ID" "$EMBEDDING_IMAGE" >/dev/null 2>&1 || echo "ERROR: could not restore local embedding image tag" >&2
  fi
  rm -rf -- "$DOCKER_CONFIG"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf '%s' "$GHCR_PULL_TOKEN" | docker login ghcr.io --username "$GHCR_PULL_USERNAME" --password-stdin >/dev/null

running_image_id() {
  local service="$1"
  local containers
  containers="$(docker compose ps -q "$service")"
  if [[ -z "$containers" ]]; then
    return 1
  fi
  if [[ "$containers" == *$'\n'* ]]; then
    echo "ERROR: expected one $service container; found multiple replicas" >&2
    return 2
  fi
  docker inspect --format '{{.Image}}' "$containers"
}

OLD_BLOG_ID="$(running_image_id blog)" || { echo "ERROR: blog service must already be running" >&2; exit 1; }
OLD_EMBEDDING_ID="$(running_image_id embedding)" || { echo "ERROR: embedding service must already be running" >&2; exit 1; }

echo "Checking published main images..."
PULL_STARTED=true
docker compose pull blog embedding
BLOG_REVISION="$(docker image inspect "$BLOG_IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
EMBEDDING_REVISION="$(docker image inspect "$EMBEDDING_IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
if [[ ! "$BLOG_REVISION" =~ ^[0-9a-f]{40,64}$ || "$BLOG_REVISION" != "$EMBEDDING_REVISION" ]]; then
  echo "Published web and embedding images do not share one valid source revision; deferring update" >&2
  exit 0
fi
for image in "$BLOG_IMAGE" "$EMBEDDING_IMAGE"; do
  gh attestation verify "oci://$image" \
    --repo jung-geun/tablog \
    --deny-self-hosted-runners \
    --source-digest "$BLOG_REVISION" \
    --source-ref refs/heads/main \
    --signer-workflow jung-geun/tablog/.github/workflows/docker-build.yml
done
for image in "$BLOG_IMAGE" "$EMBEDDING_IMAGE"; do
  platform="$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')"
  if [[ "$platform" != "linux/amd64" ]]; then
    echo "ERROR: expected linux/amd64 image for $image, got $platform" >&2
    exit 1
  fi
done

TARGET_BLOG_ID="$(docker image inspect "$BLOG_IMAGE" --format '{{.Id}}')"
TARGET_EMBEDDING_ID="$(docker image inspect "$EMBEDDING_IMAGE" --format '{{.Id}}')"
FAILED_STATE="$LOCK_DIR/failed-image-ids"
if [[ -f "$FAILED_STATE" ]]; then
  read -r FAILED_BLOG_ID FAILED_EMBEDDING_ID < "$FAILED_STATE" || true
  if [[ "${FAILED_BLOG_ID:-}" == "$TARGET_BLOG_ID" && "${FAILED_EMBEDDING_ID:-}" == "$TARGET_EMBEDDING_ID" ]]; then
    echo "Previously failed image pair is unchanged; waiting for a newer publish" >&2
    exit 0
  fi
fi
if [[ "$OLD_BLOG_ID" == "$TARGET_BLOG_ID" && "$OLD_EMBEDDING_ID" == "$TARGET_EMBEDDING_ID" ]]; then
  rm -f -- "$FAILED_STATE"
  exit 0
fi

echo "Deploying source revision $BLOG_REVISION"
if docker compose up -d --no-build --wait --wait-timeout "$WAIT_SECONDS" blog embedding \
  && curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/health >/dev/null; then
  ROLLOUT_COMPLETE=true
  rm -f -- "$FAILED_STATE"
  echo "Automatic image update completed: $BLOG_REVISION"
  exit 0
fi

printf '%s %s\n' "$TARGET_BLOG_ID" "$TARGET_EMBEDDING_ID" > "$FAILED_STATE.tmp"
mv -f -- "$FAILED_STATE.tmp" "$FAILED_STATE"
echo "Automatic image update failed; restoring previous images" >&2
docker image tag "$OLD_BLOG_ID" "$BLOG_IMAGE"
docker image tag "$OLD_EMBEDDING_ID" "$EMBEDDING_IMAGE"
if docker compose up -d --no-build --wait --wait-timeout "$WAIT_SECONDS" blog embedding \
  && curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/health >/dev/null; then
  echo "Previous images restored and healthy" >&2
else
  echo "ERROR: automatic rollback could not restore a healthy deployment; inspect Docker Compose logs" >&2
fi
exit 1
