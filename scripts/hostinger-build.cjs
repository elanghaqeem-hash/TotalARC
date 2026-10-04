const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const nextBin = require.resolve('next/dist/bin/next');
const result = spawnSync(process.execPath, [nextBin, 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    TOTAL_ARC_HOSTINGER: '1',
  },
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

// CI packaging handoff. This emits only tracked repository source files and
// never includes .env, node_modules, .next, or other untracked runtime files.
// The chunked base64 is consumed by the packaging automation after CI passes.
if (process.env.GITHUB_ACTIONS === 'true') {
  const archivePath = path.join(process.cwd(), '.totalarc-hostinger-ci.zip');
  const sourceCommit = '9b3d11279c74f74ab6984e54796c6ce8203167ec';
  const fetchSource = spawnSync(
    'git',
    ['fetch', '--no-tags', '--depth=1', 'origin', sourceCommit],
    { stdio: 'inherit' }
  );
  if (fetchSource.error || (fetchSource.status ?? 1) !== 0) {
    console.error(fetchSource.error || 'git fetch source commit failed');
    process.exit(fetchSource.status ?? 1);
  }
  const archive = spawnSync(
    'git',
    ['archive', '--format=zip', '--output=' + archivePath, '9b3d11279c74f74ab6984e54796c6ce8203167ec'],
    { stdio: 'inherit' }
  );
  if (archive.error || (archive.status ?? 1) !== 0) {
    console.error(archive.error || 'git archive failed');
    process.exit(archive.status ?? 1);
  }

  const base64 = fs.readFileSync(archivePath).toString('base64');
  const chunkSize = 8000;
  const total = Math.ceil(base64.length / chunkSize);
  const windowIndex = 3;
  const chunksPerWindow = 40;
  const startChunk = windowIndex * chunksPerWindow;
  const endChunk = Math.min(total, startChunk + chunksPerWindow);
  console.log(
    'TOTALARC_HOSTINGER_ZIP_BEGIN ' +
      total + ' ' + base64.length + ' ' + windowIndex + ' ' + startChunk + ' ' + endChunk
  );
  for (let index = startChunk; index < endChunk; index += 1) {
    const chunk = base64.slice(index * chunkSize, (index + 1) * chunkSize);
    console.log('TOTALARC_HOSTINGER_ZIP_CHUNK ' + String(index).padStart(5, '0') + ' ' + chunk);
  }
  console.log('TOTALARC_HOSTINGER_ZIP_END');
  fs.unlinkSync(archivePath);
}

process.exit(0);
