import { writeFileSync } from "node:fs";

const behavior = process.env.CIMILOOP_FAKE_BEHAVIOR ?? "exit0";
const resultPath = process.env.CIMILOOP_RESULT_PATH;

if (behavior === "hang") {
  setInterval(() => undefined, 60_000);
} else if (behavior === "invalid") {
  process.stdout.write("not-json\n");
  if (resultPath) writeFileSync(resultPath, "not-json\n");
  process.exit(0);
} else {
  process.stdout.write("fake-runtime ok\n");
  if (process.env.CIMILOOP_SECRET) {
    process.stdout.write(`secret=${process.env.CIMILOOP_SECRET}\n`);
  }
  if (resultPath) writeFileSync(resultPath, JSON.stringify({ kind: "process_finished" }));
  process.exit(0);
}
