#!/usr/bin/env node
/**
 * Local unary ping against AgentService.
 * Starts an in-process gateway on GRPC_PORT (default 50061 to avoid clashing
 * with a long-running 50051), registers planning-agent, calls GetStatus + ExecuteTask.
 */

const path = require("path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const gRPCGateway = require("../agents/grpc-gateway");
const RuntimeAgent = require("../agents/runtime-agent");

const HOST = process.env.GRPC_HOST || "127.0.0.1";
const PORT = parseInt(process.env.GRPC_TEST_PORT || "50061", 10);
const PROTO = path.join(__dirname, "../proto/agent-service.proto");

async function main() {
  const gateway = new gRPCGateway({
    host: HOST,
    port: PORT,
    protoPath: PROTO,
  });

  gateway.registerAgent(
    "planning-agent",
    new RuntimeAgent({
      id: "planning-agent",
      role: "planner",
      type: "Planning",
    }),
  );

  await gateway.startServer();

  const def = protoLoader.loadSync(PROTO, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(def);
  const client = new proto.agentservice.AgentService(
    `${HOST}:${PORT}`,
    grpc.ChannelCredentials.createInsecure(),
  );

  const status = await new Promise((resolve, reject) => {
    client.getStatus({ agentId: "planning-agent" }, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });

  const executed = await new Promise((resolve, reject) => {
    client.executeTask(
      {
        agentId: "planning-agent",
        taskId: "sweep-001",
        taskType: "ping",
        payload: Buffer.from("canonical-sweep"),
      },
      (err, res) => {
        if (err) reject(err);
        else resolve(res);
      },
    );
  });

  console.log(
    JSON.stringify(
      {
        ok: status.status === "active" && executed.success === true,
        status,
        executed: {
          success: executed.success,
          taskId: executed.taskId,
          latency: executed.latency,
        },
      },
      null,
      2,
    ),
  );

  await gateway.shutdown();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
