import { waitForBackgroundTasks } from "./backgroundTasks";

async function flushAndExit(signal: NodeJS.Signals) {
  console.log(`[${signal}] draining background tasks…`);
  await waitForBackgroundTasks();
  process.exit(0);
}

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.once(signal, () => {
    void flushAndExit(signal as NodeJS.Signals);
  });
});