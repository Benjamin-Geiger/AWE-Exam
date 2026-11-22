import cors from "cors";
import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 4200);
let expeditionNumber = 16;
// Store pending and completed results to prevent duplicate rewards
const expeditionRequests = new Map();

const outcomes = {
  "crystal-cave": { rewards: { stone: 8, tools: 1 }, message: "The scout found a crystal seam and an abandoned mason's tool." },
  "old-mine": { rewards: { stone: 12, wood: 2 }, message: "The old mine still holds good stone and usable supports." },
};

app.use(cors()); app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "dwarfhold" }));

app.post("/api/expeditions", (req, res) => {
  // simulated latency
  const latency = Math.max(0, Math.min(5000, Number(req.query.latency ?? process.env.API_LATENCY ?? 2000)));
  const { requestId, dwarfId, destination } = req.body ?? {};

  if (typeof requestId !== "string" || !requestId || typeof dwarfId !== "string" || typeof destination !== "string") {
    return res.status(400).json({ error: "requestId, dwarfId, and destination are required" });
  }

  // Reuse the original result for a duplicate request
  const existing = expeditionRequests.get(requestId);
  if (existing) {
    if (existing.dwarfId !== dwarfId || existing.destination !== destination) {
      return res.status(409).json({ error: "Request ID already used for another expedition" });
    }
    return existing.result.then(({ status, body }) => res.status(status).json(body));
  }

  const result = new Promise((resolve) => {
    setTimeout(() => {
      if (req.query.fail === "true" || destination === "blocked-pass") {
        return resolve({ status: 503, body: { error: "Rockfall has sealed the route. The company heard no signal." } });
      }

      const outcome = outcomes[destination];

      if (!outcome) return resolve({ status: 404, body: { error: "That destination is not on the hold map" } });

      expeditionNumber += 1;
      resolve({ status: 200, body: { expeditionId: `exp-${expeditionNumber}`, status: "completed", ...outcome } });
    }, latency);
  });
  // Register before the delay so concurrent requests share this result
  expeditionRequests.set(requestId, { dwarfId, destination, result });
  result.then(({ status, body }) => {
    if (status !== 200) expeditionRequests.delete(requestId);
    res.status(status).json(body);
  });
});

app.listen(port, () => console.log(`Dwarfhold API listening on http://localhost:${port}`));
