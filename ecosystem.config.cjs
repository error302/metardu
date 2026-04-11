module.exports = {
  apps: [{
    name: "metardu",
    script: "npm",
    args: "start",
    cwd: "/home/mohameddosho20/metardu",
    env: {
      NODE_ENV: "production",
      NODE_OPTIONS: "--max-old-space-size=256"
    },
    max_memory_restart: "300M",
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    watch: false,
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    error_file: "/home/mohameddosho20/.pm2/logs/metardu-error.log",
    out_file: "/home/mohameddosho20/.pm2/logs/metardu-out.log",
    merge_logs: true,
  }]
}
