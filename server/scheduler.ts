import cron, { type ScheduledTask } from "node-cron";
import { env } from "./env";
import { runHourlyTopicSync } from "./services/news/syncTopic";
import { ensureStarterCatalog } from "./services/starterProvisioning";

let task: ScheduledTask | null = null;

export function startScheduler(): void {
  if (!env.SCHEDULER_ENABLED) {
    return;
  }

  task = cron.schedule(env.HOURLY_SYNC_CRON, async () => {
    try {
      await ensureStarterCatalog();
      await runHourlyTopicSync();
    } catch (error) {
      console.error("[scheduler] hourly sync failed", error);
    }
  });
}

export function stopScheduler(): void {
  task?.stop();
  task = null;
}
