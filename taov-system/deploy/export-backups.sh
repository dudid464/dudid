#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# != 1 || ! -d "$1" ]]; then
    printf 'Usage: %s EXISTING_BACKUP_DIRECTORY\n' "$0" >&2
    exit 2
fi

destination=$(cd -- "$1" && pwd -P)
project=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd "$project"
compose=(docker compose -f compose.production.yaml)

files=$("${compose[@]}" exec -T taov node -e '
    const { readdirSync } = require("node:fs");
    for (const filename of readdirSync("/app/data/backups").sort()) {
        if (/^taov-\d{4}-\d{2}-\d{2}\.enc\.json$/.test(filename)) console.log(filename);
    }
')
if [[ -z "$files" ]]; then
    printf 'No completed TAOV backups found.\n' >&2
    exit 1
fi

temporary=''
trap 'if [[ -n "$temporary" ]]; then rm -f -- "$temporary"; fi' EXIT
while IFS= read -r filename; do
    if [[ ! "$filename" =~ ^taov-[0-9]{4}-[0-9]{2}-[0-9]{2}\.enc\.json$ ]]; then
        printf 'Unexpected backup filename: %s\n' "$filename" >&2
        exit 1
    fi
    target="$destination/$filename"
    if [[ -f "$target" ]]; then continue; fi
    temporary=$(mktemp "$destination/.taov-backup.XXXXXXXX")
    "${compose[@]}" exec -T taov cat "/app/data/backups/$filename" > "$temporary"
    test -s "$temporary"
    if ln -T -- "$temporary" "$target"; then
        printf 'Exported %s\n' "$filename"
    elif [[ ! -f "$target" ]]; then
        exit 1
    fi
    rm -f -- "$temporary"
    temporary=''
done <<< "$files"
