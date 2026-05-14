import * as net from "node:net";

export class PortInUseError extends Error {
  readonly port: number;

  constructor(port: number) {
    super(`Port ${port} is already in use. Use --port to choose another.`);
    this.name = "PortInUseError";
    this.port = port;
  }
}

export function formatPortError(port: number): string {
  return [
    `Port ${port} is already in use.`,
    `Find the occupying process: lsof -i :${port}`,
    `Start on a different port: agentboard --port <number>`,
  ].join("\n");
}

export function resolvePort(preferred: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();

    probe.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new PortInUseError(preferred));
      } else {
        reject(err);
      }
    });

    probe.listen(preferred, "127.0.0.1", () => {
      probe.close(() => resolve(preferred));
    });
  });
}
