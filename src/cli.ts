import { runIngestion } from "./pipeline/ingest.js";

const parseArgs = () => {
  const [, , command, maybeSince] = process.argv;
  if (command === "refresh") return { command: "refresh" as const };
  if (command === "backfill") {
    const explicit = process.argv.find((arg) => arg.startsWith("--since="));
    const since = explicit
      ? explicit.split("=", 2)[1]
      : maybeSince && maybeSince !== "--since" && maybeSince !== undefined
      ? maybeSince
      : undefined;
    return { command: "backfill" as const, since };
  }
  if (command === "--help" || command === "-h") {
    return { command: "help" as const };
  }
  return { command: "help" as const };
};

const usage = () => `
Usage:
  node dist/cli.js refresh
  node dist/cli.js backfill --since=YYYY-MM-DD
`;

const run = async () => {
  const args = parseArgs();
  if (args.command === "help") {
    console.log(usage());
    return;
  }
  if (args.command === "refresh") {
    const result = await runIngestion();
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (args.command === "backfill") {
    const since = args.since ?? process.env.BACKFILL_SINCE ?? "2020-01-01";
    const result = await runIngestion({ backfillSince: since });
    console.log(JSON.stringify({ ...result, since }, null, 2));
    return;
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
