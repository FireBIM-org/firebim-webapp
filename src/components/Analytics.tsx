const UMAMI_ANALYTICS_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_ANALYTICS_WEBSITE_ID;

export default function Analytics() {
  // If starts with 'change-me-ignore-local', analytics is not configured and we should not render the script tag
  if (
    UMAMI_ANALYTICS_WEBSITE_ID &&
    UMAMI_ANALYTICS_WEBSITE_ID.toLowerCase().startsWith('change-me-ignore-local')
  ) {
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
