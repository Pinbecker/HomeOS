#!/bin/sh
set -eu

output_dir=/data/files/tv-guide
output_file="$output_dir/freeview.xml"
temporary_file="$output_dir/freeview.xml.pending"
config_file=/etc/homeos/tv_grab_uk_freeview.conf
refresh_seconds="${TV_GRAB_REFRESH_SECONDS:-21600}"

mkdir -p "$output_dir"

refresh_guide() {
  echo "Refreshing seven-day Freeview guide"

  if tv_grab_uk_freeview \
    --config-file "$config_file" \
    --days 7 \
    --fast \
    --output "$temporary_file" \
    --quiet \
    && grep -q '<channel ' "$temporary_file" \
    && grep -q '<programme ' "$temporary_file"; then
    mv "$temporary_file" "$output_file"
    echo "Freeview guide refreshed at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    return 0
  fi

  echo "Freeview guide refresh failed; preserving the last good snapshot" >&2
  rm -f "$temporary_file"
  return 1
}

while true; do
  refresh_guide || true
  sleep "$refresh_seconds"
done
