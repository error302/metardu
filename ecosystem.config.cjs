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
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: __dirname,
      instances: 2,
      exec_mode: 'cluster',
      node_args: '--max-old-space-size=1536',
      max_memory_restart: '2G',
      env: { NODE_ENV: 'production' },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      listen_timeout: 10000,
      kill_timeout: 5000,
      wait_ready: true,
      watch: false,
    },
    {
      name: 'metardu-worker',
      script: 'scripts/worker.py',
      cwd: __dirname,
      interpreter: 'python3',
      instances: 1,
      autorestart: true,
      max_restarts: 5,
      restart_delay: 10000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      merge_logs: true,
      env: { NODE_ENV: 'production' },
    },
  ],
  deploy: {
    production: {
      user: 'mohameddosho20',
      host: '34.170.248.156',
      ref: 'origin/main',
      repo: 'git@github.com:error302/metardu.git',
      path: '/home/mohameddosho20/metardu',
      'pre-deploy-local': '',
      'post-deploy': `
        npm install --production
        npm run build
        pm2 reload ecosystem.config.cjs --env production
      `,
      'pre-setup': '',
    },
  },
}
