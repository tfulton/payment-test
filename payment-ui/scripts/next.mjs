import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const command = process.argv[2];
const repositoryRoot = path.resolve(import.meta.dirname, "../..");

loadEnvConfig(repositoryRoot, command === "dev");

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextCli, ...process.argv.slice(2)], {
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
