#!/usr/bin/env bash
set -euo pipefail

archive=/tmp/postgres-image.tar.zst
tag=$(awk '$1 == "POSTGRES_TAG:" { print $2 }' .github/workflows/ci.yml)
digest=$(awk '$1 == "POSTGRES_DIGEST:" { print $2 }' .github/workflows/ci.yml)
# ghcr.io serves the same digest as the CLI's default registry, which has rate limited runners.
image="ghcr.io/supabase/postgres:$tag"
memory_for_one_image=6g

stop_docker() {
  sudo systemctl stop docker docker.socket
}

# Docker's folder holds character devices, owners, and overlay attributes, so only a root tar with these flags keeps the image correct.
tar_docker_folder() {
  sudo tar --numeric-owner --xattrs --xattrs-include='*' --zstd "$@"
}

# A new Docker version may not read an older version's folder.
get_key() {
  local recipe_hash
  recipe_hash=$({ echo "$digest"; cat .github/scripts/postgres-image.sh .github/workflows/postgres-image-cache.yml; } | sha256sum | cut -c1-12)
  echo "postgres-image-$tag-docker-$(docker version --format '{{.Server.Version}}')-$recipe_hash"
}

restore_archive_or_leave_folder_empty() {
  if [ -f "$archive" ]; then
    tar_docker_folder -xf "$archive" -C /dockerdata || sudo find /dockerdata -mindepth 1 -delete
  fi
}

image_runs() {
  docker run --rm --pull never --entrypoint postgres "$image" --version > /dev/null 2>&1
}

# A folder that will not run the image falls back to a pull, so a bad entry costs time and does not fail the job.
start_docker_in_memory() {
  stop_docker
  if mountpoint -q /dockerdata; then sudo umount /dockerdata; fi
  sudo mkdir -p /etc/docker /dockerdata
  sudo mount -t tmpfs -o "size=$memory_for_one_image" tmpfs /dockerdata
  # On an empty folder Docker 29 picks the containerd store, which keeps the image outside this memory disk and the archive.
  echo '{"data-root":"/dockerdata","features":{"containerd-snapshotter":false}}' | sudo tee /etc/docker/daemon.json > /dev/null
  restore_archive_or_leave_folder_empty
  if ! { sudo systemctl start docker && image_runs; }; then
    stop_docker
    sudo find /dockerdata -mindepth 1 -delete
    sudo systemctl reset-failed docker
    sudo systemctl start docker
    nohup docker pull -q "$image" > /dev/null 2>&1 &
  fi
}

archive_pulled_image() {
  docker pull -q "$image"
  stop_docker
  tar_docker_folder -cf "$archive" -C /dockerdata image overlay2
}

# A tag is only a name that a retag can move, so compare the digest the registry served, which Docker keeps in its folder.
fail_unless_image_has_pinned_digest() {
  local repo_digests
  repo_digests=$(docker image inspect "$1" --format '{{json .RepoDigests}}')
  if [[ "$repo_digests" != *"@$digest\""* ]]; then
    echo "::error file=.github/workflows/ci.yml::Postgres has digests $repo_digests, but POSTGRES_DIGEST is $digest. After a CLI upgrade, set POSTGRES_DIGEST to the new tag's digest. Otherwise the cache entry holds the wrong image, so delete it with gh cache delete $(get_key)."
    exit 1
  fi
}

# The fallback's pull cannot finish before this docker run, so an archive that does not restore fails here.
prove_archive_restores() {
  start_docker_in_memory
  docker run --rm --pull never --entrypoint postgres "$image" --version
  fail_unless_image_has_pinned_digest "$image"
}

case "${1:-}" in
  key) echo "key=$(get_key)" ;;
  start-docker) start_docker_in_memory ;;
  archive) archive_pulled_image ;;
  prove) prove_archive_restores ;;
  check-running-image) fail_unless_image_has_pinned_digest "$(docker inspect supabase_db_astra --format '{{.Image}}')" ;;
  *) echo "usage: postgres-image.sh key|start-docker|archive|prove|check-running-image" >&2; exit 2 ;;
esac
