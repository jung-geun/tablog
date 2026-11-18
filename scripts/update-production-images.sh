#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export PATH

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
WAIT_SECONDS="${IMAGE_UPDATE_WAIT_SECONDS:-3600}"
if [[ ! "$WAIT_SECONDS" =~ ^[1-9][0-9]{0,3}$ ]] || (( WAIT_SECONDS > 3600 )); then
  echo "ERROR: IMAGE_UPDATE_WAIT_SECONDS must be an integer from 1 to 3600" >&2
  exit 1
fi

LOCK_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/monolog"
mkdir -p "$LOCK_DIR"
chmod 700 "$LOCK_DIR"
if [[ "${1:-}" != "--lock-held" ]]; then
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$LOCK_DIR/image-update.lock"
    flock -n 9 || exit 0
  elif command -v lockf >/dev/null 2>&1; then
    exec lockf -k -t 0 "$LOCK_DIR/image-update.lock" /bin/bash "$0" --lock-held
  else
    echo "ERROR: flock or lockf is required for the update lock" >&2
    exit 1
  fi
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

SERVICES=(blog)
HAS_EMBEDDING=false
if docker compose config --services | grep -qx embedding; then
  SERVICES+=(embedding)
  HAS_EMBEDDING=true
fi
OLD_BLOG_ID="$(running_image_id blog)" || { echo "ERROR: blog service must already be running" >&2; exit 1; }
OLD_EMBEDDING_ID=""
if [[ "$HAS_EMBEDDING" == "true" ]]; then
  OLD_EMBEDDING_ID="$(running_image_id embedding)" || { echo "ERROR: embedding service must already be running" >&2; exit 1; }
fi

echo "Checking published main images..."
PULL_STARTED=true
docker compose pull "${SERVICES[@]}"
BLOG_REVISION="$(docker image inspect "$BLOG_IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
if [[ ! "$BLOG_REVISION" =~ ^[0-9a-f]{40,64}$ ]]; then
  echo "Published blog image has no valid source revision; deferring update" >&2
  exit 0
fi
if [[ "$HAS_EMBEDDING" == "true" ]]; then
  EMBEDDING_REVISION="$(docker image inspect "$EMBEDDING_IMAGE" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
  if [[ "$BLOG_REVISION" != "$EMBEDDING_REVISION" ]]; then
    echo "Published web and embedding images do not share one source revision; deferring update" >&2
    exit 0
  fi
fi
IMAGES=("$BLOG_IMAGE")
if [[ "$HAS_EMBEDDING" == "true" ]]; then IMAGES+=("$EMBEDDING_IMAGE"); fi
for image in "${IMAGES[@]}"; do
  platform="$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')"
  if [[ "$platform" != "linux/amd64" ]]; then
    echo "ERROR: expected linux/amd64 image for $image, got $platform" >&2
    exit 1
  fi
done

TARGET_BLOG_ID="$(docker image inspect "$BLOG_IMAGE" --format '{{.Id}}')"
TARGET_EMBEDDING_ID=""
if [[ "$HAS_EMBEDDING" == "true" ]]; then
  TARGET_EMBEDDING_ID="$(docker image inspect "$EMBEDDING_IMAGE" --format '{{.Id}}')"
fi
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
# Public GHCR removes pull credentials; require a successful public main-branch
# build for the same source revision before deploying its mutable image tags.
RUNS_JSON="$(curl --fail --silent --show-error --max-time 20 \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "https://api.github.com/repos/jung-geun/tablog/actions/workflows/docker-build.yml/runs?head_sha=${BLOG_REVISION}&event=push&per_page=100")"
if ! python3 -c 'import json,sys; sha=sys.argv[1]; runs=json.load(sys.stdin).get("workflow_runs",[]); ok=any(r.get("head_sha")==sha and r.get("head_branch")=="main" and r.get("event")=="push" and r.get("status")=="completed" and r.get("conclusion")=="success" for r in runs); sys.exit(0 if ok else 1)' "$BLOG_REVISION" <<< "$RUNS_JSON"; then
  echo "No successful public main-branch Docker Build and Push run for revision $BLOG_REVISION" >&2
  exit 1
fi

echo "Deploying source revision $BLOG_REVISION"
if docker compose up -d --no-build --wait --wait-timeout "$WAIT_SECONDS" "${SERVICES[@]}" \
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
if [[ -n "$OLD_EMBEDDING_ID" ]]; then
  docker image tag "$OLD_EMBEDDING_ID" "$EMBEDDING_IMAGE"
fi
if docker compose up -d --no-build --wait --wait-timeout "$WAIT_SECONDS" "${SERVICES[@]}" \
  && curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3000/health >/dev/null; then
  echo "Previous images restored and healthy" >&2
else
  echo "ERROR: automatic rollback could not restore a healthy deployment; inspect Docker Compose logs" >&2
fi
exit 1
