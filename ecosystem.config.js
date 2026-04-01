module.exports = {
  apps: [
    {
      name: "his-monitoring-files",
      script: "server.js",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 20,
      time: true
    }
  ]
};

