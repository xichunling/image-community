module.exports = {
  apps: [{
    name: 'image-community',
    cwd: './backend',
    script: 'npx',
    args: 'tsx src/index.ts',
    kill_timeout: 8000,
    wait_ready: false,
    listen_timeout: 5000,
    env: {
      NODE_ENV: 'production',
    },
  }],
}
