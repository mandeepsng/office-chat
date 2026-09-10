// PM2 process config for the OfficeChat server.
//
// Handles every "server band ho gaya" case:
//   - Crash / uncaught error  -> auto-restart (with smart backoff)
//   - Memory leak             -> restart when it crosses max_memory_restart
//   - VPS reboot              -> comes back if `pm2 save` + `pm2 startup` were run
//
// Start:    pm2 start deploy/ecosystem.config.cjs
// Reload:   pm2 reload deploy/ecosystem.config.cjs
// (deploy.sh does this for you.)

const path = require("path");

module.exports = {
  apps: [
    {
      name: "officechat",

      // Run the server via pnpm so it uses the workspace + loads apps/server/.env
      // (pnpm runs the script with cwd = apps/server, which dotenv needs).
      script: "pnpm",
      args: "--filter @office-chat/server start",
      interpreter: "none", // pnpm is a binary, don't run it through node
      cwd: path.join(__dirname, ".."), // repo root

      // --- Crash handling ---
      autorestart: true, // restart if the process exits unexpectedly
      // Smart backoff on crash loops: 1st restart after 2s, then 4s, 8s...
      // up to ~15s. Prevents hammering a broken server while still recovering.
      exp_backoff_restart_delay: 2000,
      min_uptime: "10s", // must stay up 10s to count as a "good" start
      max_restarts: 20, // within a short window; backoff makes this generous

      // --- Memory guard ---
      // If a leak pushes RSS past this, PM2 restarts the process cleanly.
      max_memory_restart: "300M",

      // --- Logs ---
      time: true, // prefix every log line with a timestamp

      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
