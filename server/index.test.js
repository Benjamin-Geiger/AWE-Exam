import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const serverPath = fileURLToPath(new URL("./index.js", import.meta.url));
let serverProcess;
let baseUrl;

async function getAvailablePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function postExpedition(body, query = "") {
  return fetch(`${baseUrl}/api/expeditions${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("expedition request idempotency", () => {
  beforeAll(async () => {
    const port = await getAvailablePort();
    baseUrl = `http://127.0.0.1:${port}`;
    serverProcess = spawn(process.execPath, [serverPath], {
      env: { ...process.env, PORT: String(port) },
      stdio: "ignore",
    });

    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (serverProcess.exitCode !== null) {
        throw new Error("Expedition server exited before starting");
      }
      try {
        const response = await fetch(`${baseUrl}/api/health`);
        if (response.ok) return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    throw new Error("Expedition server did not start");
  }, 10_000);

  afterAll(async () => {
    if (!serverProcess || serverProcess.exitCode !== null) return;
    serverProcess.kill();
    await new Promise((resolve) => serverProcess.once("exit", resolve));
  });

  it("returns one result for concurrent and repeated requests", async () => {
    const request = {
      requestId: "duplicate-request",
      dwarfId: "dwarf-1",
      destination: "crystal-cave",
    };

    const [firstResponse, duplicateResponse] = await Promise.all([
      postExpedition(request, "?latency=100"),
      postExpedition(request, "?latency=0"),
    ]);
    const first = await firstResponse.json();
    const duplicate = await duplicateResponse.json();
    const repeatedResponse = await postExpedition(request, "?latency=0");
    const repeated = await repeatedResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(duplicateResponse.status).toBe(200);
    expect(duplicate).toEqual(first);
    expect(repeated).toEqual(first);
  });

  it("rejects using a request ID for different expedition details", async () => {
    const request = {
      requestId: "conflicting-request",
      dwarfId: "dwarf-1",
      destination: "crystal-cave",
    };
    await postExpedition(request, "?latency=0");

    const response = await postExpedition(
      { ...request, destination: "old-mine" },
      "?latency=0",
    );

    expect(response.status).toBe(409);
  });

  it("allows a failed request to retry with the same ID", async () => {
    const request = {
      requestId: "retry-request",
      dwarfId: "dwarf-2",
      destination: "crystal-cave",
    };
    const failed = await postExpedition(request, "?fail=true&latency=0");
    const retried = await postExpedition(request, "?latency=0");
    const result = await retried.json();

    expect(failed.status).toBe(503);
    expect(retried.status).toBe(200);
    expect(result.rewards).toEqual({ stone: 8, tools: 1 });
  });
});
