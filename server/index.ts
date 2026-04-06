import { createApp } from "./app";
import { runStartupBootstrap } from "./bootstrap";
import { env } from "./env";
import { startScheduler } from "./scheduler";

async function main() {
  await runStartupBootstrap();

  const app = createApp();

  app.listen(env.PORT, () => {
    console.log(`[newsfilter] api listening on :${env.PORT}`);
  });

  startScheduler();
}

main().catch((error) => {
  console.error("[newsfilter] startup failed", error);
  process.exit(1);
});