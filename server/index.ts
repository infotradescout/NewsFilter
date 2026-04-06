import { createApp } from "./app";
import { runStartupBootstrap } from "./bootstrap";
import { env } from "./env";
import { startScheduler } from "./scheduler";

async function main() {
  await runStartupBootstrap();

  const app = createApp();

  app.listen(env.PORT, () => {
    console.log(`[marketfilter] api listening on :${env.PORT}`);
  });

  startScheduler();
}

main().catch((error) => {
  console.error("[marketfilter] startup failed", error);
  process.exit(1);
});
