#!/usr/bin/env bash
set -euo pipefail

archive=/tmp/postgres-image.tar.zst
tag=$(awk '$1 == "POSTGRES_TAG:" { print $2 }' .github/workflows/ci.yml)
image="ghcr.io/supabase/postgres:$tag"
memory_for_one_image=6g

stop_docker() {
  sudo systemctl stop docker docker.socket
}

# Docker's folder holds character devices, owners, and overlay attributes, so only a root tar with these flags keeps the image correct.
tar_docker_folder() {
  sudo tar --numeric-owner --xattrs --xattrs-include='*' --zstd "$@"
}

# A new Docker version misses the cache, because it may not read an older version's folder.
print_key() {
  echo "key=postgres-image-$tag-docker-$(docker version --format '{{.Server.Version}}')"
}

restore_archive_or_leave_folder_empty() {
  if [ -f "$archive" ]; then
    tar_docker_folder -xf "$archive" -C /dockerdata || sudo find /dockerdata -mindepth 1 -delete
  fi
}

# ghcr.io serves the same digest as the CLI's default registry, which has rate limited runners.
start_pull_unless_image_is_present() {
  if ! docker image inspect "$image" > /dev/null 2>&1; then
    nohup docker pull -q "$image" > /dev/null 2>&1 &
  fi
}

start_docker_in_memory() {
  stop_docker
  if mountpoint -q /dockerdata; then sudo umount /dockerdata; fi
  sudo mkdir -p /etc/docker /dockerdata
  sudo mount -t tmpfs -o "size=$memory_for_one_image" tmpfs /dockerdata
  echo '{"data-root":"/dockerdata"}' | sudo tee /etc/docker/daemon.json > /dev/null
  restore_archive_or_leave_folder_empty
  sudo systemctl start docker
  start_pull_unless_image_is_present
}

archive_pulled_image() {
  docker pull -q "$image"
  stop_docker
  tar_docker_folder -cf "$archive" -C /dockerdata image overlay2
}

prove_archive_restores() {
  start_docker_in_memory
  docker run --rm --pull never --entrypoint postgres "$image" --version
}

case "${1:-}" in
  key) print_key ;;
  start-docker) start_docker_in_memory ;;
  archive) archive_pulled_image ;;
  prove) prove_archive_restores ;;
  *) echo "usage: postgres-image.sh key|start-docker|archive|prove" >&2; exit 2 ;;
esac
