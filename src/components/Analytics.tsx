const UMAMI_ANALYTICS_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_ANALYTICS_WEBSITE_ID;

export default function Analytics() {
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
