module.exports = {
  apps: [
    {
      name: 'slopmark',
      script: './src/server.mjs',
      node_args: '--no-warnings',
      cwd: __dirname,
      max_memory_restart: '200M',
    },
  ],
};
