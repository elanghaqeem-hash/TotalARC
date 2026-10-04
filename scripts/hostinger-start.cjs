const { spawnSync } = require('node:child_process');

const nextBin = require.resolve('next/dist/bin/next');
const port = String(process.env.PORT || '3000');
const result = spawnSync(
  process.execPath,
  [nextBin, 'start', '-H', '0.0.0.0', '-p', port],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      TOTAL_ARC_HOSTINGER: '1',
    },
  }
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
