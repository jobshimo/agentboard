import { describe, it, expect } from "vitest";
import * as net from "node:net";
import { resolvePort, PortInUseError, formatPortError } from "../port.js";

function occupyPort(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(port, "127.0.0.1", () => resolve(server));
    server.once("error", reject);
  });
}

function releasePort(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe("resolvePort", () => {
  it("resolves when the port is free", async () => {
    // Use a high ephemeral port unlikely to be in use during tests
    const port = await resolvePort(57321);
    expect(port).toBe(57321);
  });

  it("throws PortInUseError when the port is occupied", async () => {
    const server = await occupyPort(57322);
    try {
      await expect(resolvePort(57322)).rejects.toBeInstanceOf(PortInUseError);
    } finally {
      await releasePort(server);
    }
  });
});

describe("formatPortError", () => {
  it("includes the port number in the message", () => {
    const msg = formatPortError(7733);
    expect(msg).toContain("7733");
  });

  it("mentions --port flag for override", () => {
    const msg = formatPortError(7733);
    expect(msg).toContain("--port");
  });
});
