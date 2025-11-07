# Klasio Caddy API

A lightweight API used for site configuration in Caddy. This creates a site-specific server file that would override the default routing present in the `Caddyfile`.

### Example Use

```curl
curl -X PUT http://127.0.0.1:3001/sites/example.klasio.com \
  -H "Authorization: Bearer your-super-secret-token" \
  -H "Content-Type: application/json" \
  -d '{"mode":"laravel_only"}'
```

### Installation

1. Checkout the repository in your Caddy server as root:
  ```
  cd /opt
  git clone git@github.com:klasio/caddy-api.git
  ```

2. Install dependencies:
  ```
  npm ci && npm run build
  ```

3. Create service at `/etc/systemd/system/caddy-api.service`:
  ```
  [Unit]
Description=Caddy Site Manager API
After=network.target

[Service]
User=root
Group=root
Environment=NODE_ENV=production
Environment=CADDY_SITES_DIR=/etc/caddy/sites-enabled
Environment=CADDY_VALIDATE_CMD=caddy validate --config /etc/caddy/Caddyfile
Environment=CADDY_RELOAD_CMD=systemctl reload caddy
Environment=API_PORT=3001
Environment=API_KEY=your-super-secret-token
ExecStart=/usr/bin/node /opt/caddy-api/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

4. Reload & Enable:
  ```
  sudo systemctl daemon-reload
  sudo systemctl enable --now caddy-api
  ```
