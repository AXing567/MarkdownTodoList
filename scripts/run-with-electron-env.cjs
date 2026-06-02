const { spawn } = require("node:child_process");

const [, , command, ...args] = process.argv;

if (!command) {
  console.error("Missing command.");
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(command, args, {
  env,
  shell: true,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
