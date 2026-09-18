const { spawnSync } = require("node:child_process");

const marker = "TOTALARC_OPENNEXT_CHILD_BUILD";
const isOpenNextChild = process.env[marker] === "1";
const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const args = isOpenNextChild
  ? ["next", "build"]
  : ["opennextjs-cloudflare", "build"];

const env = { ...process.env };
if (!isOpenNextChild) {
  env[marker] = "1";
}

const result = spawnSync(executable, args, {
  stdio: "inherit",
  env,
  shell: false,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
