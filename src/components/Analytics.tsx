import { useSyncExternalStore } from 'react';

const UMAMI_ANALYTICS_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_ANALYTICS_WEBSITE_ID;

/**
 * Analytics is not configured when the ID is empty or starts with 'change-me-ignore-local'.
 */
export function isAnalyticsConfigured(websiteId: string | undefined): websiteId is string {
  return (
    !!websiteId?.trim() && !websiteId.trim().toLowerCase().startsWith('change-me-ignore-local')
  );
}

const subscribe = () => () => {};

export default function Analytics() {
  // Pages are prerendered at build time, when the Docker image still holds a placeholder ID
  // that is only substituted at container start. Decide in the browser, after hydration,
  // so an empty runtime ID really renders nothing.
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  if (!isClient || !isAnalyticsConfigured(UMAMI_ANALYTICS_WEBSITE_ID)) {
    return null;
  }

  return (
    <>
      <script
        async
        src="https://cloud.umami.is/script.js"
        data-website-id={UMAMI_ANALYTICS_WEBSITE_ID}
      ></script>
    </>
  );
}
