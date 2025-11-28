const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
app.use(express.json());

const SITES_DIR = process.env.CADDY_SITES_DIR || '/etc/caddy/sites-enabled';
const VALIDATE_CMD = process.env.CADDY_VALIDATE_CMD || 'caddy validate --config /etc/caddy/Caddyfile';
const RELOAD_CMD = process.env.CADDY_RELOAD_CMD || 'systemctl reload caddy';
const API_KEY = process.env.API_KEY;
const PORT = process.env.API_PORT || 3001;
const LARAVEL_BACKEND_IP = process.env.LARAVEL_BACKEND_IP || '10.0.0.1';

// Simple auth middleware
app.use((req, res, next) => {
  const header = req.headers['authorization'] || '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!API_KEY || token !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Generate the caddy config for Laravel-only host
function generateLaravelOnlyConfig(hostname) {
  return `${hostname} {
    tls {
        on_demand
    }

    @nextjs {
      path /builder /builder/* /_next/* /scripts/* /__nextjs* /_api/*
    }

    handle @nextjs {
      reverse_proxy ${NEXTJS_BACKEND_IP}:3000
    }

    reverse_proxy ${LARAVEL_BACKEND_IP} {
        header_up Host {host}
    }
}
`;
}

function execShell(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        return reject(error);
      }
      resolve({ stdout, stderr });
    });
  });
}

app.put('/sites/:hostname', async (req, res) => {
  const hostname = req.params.hostname.toLowerCase();
  const { mode } = req.body;

  if (!['laravel_only', 'default'].includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode' });
  }

  const filepath = path.join(SITES_DIR, `${hostname}.caddy`);

  let previousContent = null;
  if (fs.existsSync(filepath)) {
    previousContent = fs.readFileSync(filepath, 'utf8');
  }

  try {
    if (mode === 'laravel_only') {
      const tmpPath = filepath + '.tmp';

      // write temp file
      fs.writeFileSync(tmpPath, generateLaravelOnlyConfig(hostname), { mode: 0o775 });

      // atomically replace
      fs.renameSync(tmpPath, filepath);

      // make sure perms are right (group-readable for caddy)
      fs.chmodSync(filepath, 0o775);
    } else if (mode === 'default') {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    }
  } catch (err) {
    console.error('File write/delete failed:', err);
    
    if (previousContent !== null) {
      fs.writeFileSync(filepath, previousContent, { mode: 0o775 });
    }
    
    return res.status(500).json({
      error: 'file_update_failed',
      details: err.message,
    });
  }

  // from here on, the file *exists* or is intentionally removed,
  // so now validate + reload
  try {
    await execShell('caddy validate --config /etc/caddy/Caddyfile');
    await execShell('systemctl reload caddy');
  } catch (err) {
    console.error('Caddy reload failed:', err.stderr || err.message);

    // optional: rollback file change here

    return res.status(500).json({
      error: 'caddy_update_failed',
      details: err.stderr || err.message,
    });
  }

  return res.json({ status: 'ok', hostname, mode });
});

app.listen(PORT, () => {
  console.log(`Caddy site manager listening on port ${PORT}`);
});
