#!/usr/bin/env bash
set -uo pipefail
script=.github/scripts/postgres-image.sh
archive=/tmp/postgres-image.tar.zst
good=/tmp/good.tar.zst
image="ghcr.io/supabase/postgres:$(awk '$1 == "POSTGRES_TAG:" { print $2 }' .github/workflows/ci.yml)"

pack() {
  sudo tar --numeric-owner --xattrs --xattrs-include='*' --zstd -cf "$archive" -C /dockerdata image overlay2
}
state() {
  echo "RESULT $1: rc=$2 daemon=$(docker info --format '{{.ServerVersion}} {{.Driver}} {{.DockerRootDir}}' 2>&1 | tail -1) pulls=$(pgrep -fc 'docker pull') images=$(docker image ls -q | wc -l) store=$(sudo du -sh /dockerdata | cut -f1) mounts=$(mount | grep -c /dockerdata/)"
}

remove_postgres_binary() {
  sudo find /dockerdata/overlay2 -path '*/diff/*' \( -type f -o -type l \) -name postgres -print -delete
  pack
}

read_old_folder() {
  echo "runner docker $(docker version --format '{{.Server.Version}}') on $(lsb_release -ds), archive bytes $(stat -c %s "$archive")"
  sudo cp "$archive" "$good"
  "$script" prove
  state old-folder-prove $?
  docker image inspect "$image" --format 'RESULT old-folder image: Id={{.Id}} digests={{.RepoDigests}}'
  docker run -d --name pgtest --pull never -e POSTGRES_PASSWORD=x "$image" > /dev/null
  for _ in $(seq 1 30); do
    docker exec pgtest pg_isready -q -U postgres && break
    sleep 2
  done
  docker exec pgtest psql -U postgres -Atc 'select version()' | cut -c1-40
  echo "RESULT old-folder postgres-serves: rc=$?"
  docker rm -f pgtest > /dev/null
}

daemon_will_not_start() {
  sudo systemctl stop docker docker.socket
  echo '{' | sudo tee /dockerdata/image/overlay2/repositories.json > /dev/null
  pack
  "$script" prove
  state invalid-repositories-json-on-26 $?
  sudo pkill -f 'docker pull'
}

binary_missing() {
  sudo cp "$good" "$archive"
  "$script" start-docker
  state good-restored-before-plant $?
  sudo systemctl stop docker docker.socket
  remove_postgres_binary
  "$script" prove
  state postgres-binary-missing-on-26 $?
  sudo pkill -f 'docker pull'
}

"$@"
