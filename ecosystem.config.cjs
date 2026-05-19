const fs = require('fs');
const path = require('path');

// Manually parse .env.local if present to supply variables to the standalone Next.js server
const envPath = path.resolve(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)?$/);
    if (match) {
      const key = match[1];
      let value = (match[2] || '').trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value;
    }
  });
}

module.exports = {
  apps: [
    {
      name: 'metardu',
      script: '.next/standalone/server.js',
      cwd: '/home/mohameddosho20/metardu',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        NODE_OPTIONS: '--max-old-space-size=1536',
        ...process.env,
      },
      max_memory_restart: '2G',
      watch: false,
      autorestart: true,
      restart_delay: 3000,
      min_uptime: '10s',
      max_restarts: 5,
      exp_backoff_restart_delay: 100,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: '/home/mohameddosho20/.pm2/logs/metardu-out.log',
      error_file: '/home/mohameddosho20/.pm2/logs/metardu-error.log',
      merge_logs: true,
      listen_timeout: 30000,
      kill_timeout: 10000,
      wait_ready: false,
    },
  ],
}
