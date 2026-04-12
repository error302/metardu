module.exports = {
  apps: [{
    name: "metardu",
    script: "node_modules/.bin/next",
    args: "start",
    cwd: "/home/mohameddosho20/metardu",
    env: {
      NODE_ENV: "production",
      NODE_OPTIONS: "--max-old-space-size=512"
    },
    max_memory_restart: "600M",
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    watch: false,
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    error_file: "/home/mohameddosho20/.pm2/logs/metardu-error.log",
    out_file: "/home/mohameddosho20/.pm2/logs/metardu-out.log",
    merge_logs: true,
    // Kill the process if it takes more than 30s to start
    listen_timeout: 30000,
    // Graceful shutdown — give Next.js time to finish requests
    kill_timeout: 10000,
    wait_ready: false,
  }]
}
