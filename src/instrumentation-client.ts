import { initMonitoring } from "@/lib/monitoring";

initMonitoring(process.env.NEXT_PUBLIC_SENTRY_DSN);

export { onRouterTransitionStart } from "@/lib/monitoring";
