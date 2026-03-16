import { rebuildSourceEvents, runIngestion } from "./pipeline/ingest.js";
import { TimelineDatabase } from "./db/sqlite.js";
import { config } from "./config.js";
import { exportPages } from "./static/export-pages.js";

const parseArgs = () => {
  const [, , command, maybeValue] = process.argv;
  if (command === "refresh") {
    const explicit = process.argv.find((arg) => arg.startsWith("--vendor="));
    const vendor = explicit
      ? explicit.split("=", 2)[1]
      : maybeValue && maybeValue !== "--vendor" && maybeValue !== undefined
      ? maybeValue
      : undefined;
    return { command: "refresh" as const, vendor };
  }
  if (command === "backfill") {
    const explicit = process.argv.find((arg) => arg.startsWith("--since="));
    const since = explicit
      ? explicit.split("=", 2)[1]
      : maybeValue && maybeValue !== "--since" && maybeValue !== undefined
      ? maybeValue
      : undefined;
    return { command: "backfill" as const, since };
  }
  if (command === "rebuild") {
    const explicit = process.argv.find((arg) => arg.startsWith("--source="));
    const source = explicit
      ? explicit.split("=", 2)[1]
      : maybeValue && maybeValue !== "--source" && maybeValue !== undefined
      ? maybeValue
      : undefined;
    return { command: "rebuild" as const, source };
  }
  if (command === "export-pages") {
    const explicit = process.argv.find((arg) => arg.startsWith("--out-dir="));
    const outDir = explicit
      ? explicit.split("=", 2)[1]
      : maybeValue && maybeValue !== "--out-dir" && maybeValue !== undefined
      ? maybeValue
      : undefined;
    return { command: "export-pages" as const, outDir };
  }
  if (command === "--help" || command === "-h") {
    return { command: "help" as const };
  }
  return { command: "help" as const };
};

const usage = () => `
Usage:
  node dist/cli.js refresh [--vendor=openai|anthropic|google]
  node dist/cli.js backfill --since=YYYY-MM-DD
  node dist/cli.js rebuild --source=SOURCE_ID
  node dist/cli.js export-pages [--out-dir=docs]
`;

const run = async () => {
  const args = parseArgs();
  if (args.command === "help") {
    console.log(usage());
    return;
  }
  if (args.command === "refresh") {
    const result = await runIngestion({ vendor: args.vendor as "openai" | "anthropic" | "google" | undefined });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (args.command === "backfill") {
    const since = args.since ?? process.env.BACKFILL_SINCE ?? "2020-01-01";
    const result = await runIngestion({ backfillSince: since });
    console.log(JSON.stringify({ ...result, since }, null, 2));
    return;
  }
  if (args.command === "rebuild") {
    if (!args.source) {
      throw new Error("Missing required --source=SOURCE_ID");
    }
    const result = await rebuildSourceEvents(args.source);
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (args.command === "export-pages") {
    const db = new TimelineDatabase(config.databasePath);
    const result = exportPages({ db, outDir: args.outDir });
    console.log(JSON.stringify(result, null, 2));
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
