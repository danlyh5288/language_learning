import { spawn } from "node:child_process";
import electronPath from "electron";
import { createServer } from "vite";

const server = await createServer({
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  }
});

await server.listen();
server.printUrls();

const devUrl = server.resolvedUrls?.local?.[0] ?? "http://127.0.0.1:5173/";
const electron = spawn(electronPath, ["."], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: devUrl
  }
});

electron.on("exit", async (code, signal) => {
  await server.close();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    electron.kill(signal);
  });
}
