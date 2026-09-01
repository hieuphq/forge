#!/bin/sh
set -eu

API_URL="${API_URL:-http://localhost:3000}"
escaped_api_url=$(printf '%s' "$API_URL" | sed 's/\\/\\\\/g; s/"/\\"/g')
cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = {
  API_URL: "${escaped_api_url}"
};
EOF
