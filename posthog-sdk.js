(function() {
  // Find the script tag that loaded this SDK
  const sdkScript = document.currentScript || document.querySelector('script[data-posthog-key]');
  if (!sdkScript) {
    console.error('PostHog SDK: Could not find its own script tag. Ensure it has a data-posthog-key attribute.');
    return;
  }

  // Dynamically get all configuration from the script tag's attributes
  const config = {
    posthogKey: sdkScript.dataset.posthogKey,
    posthogHost: sdkScript.dataset.posthogHost || 'https://app.posthog.com',
    mongoLogApi: sdkScript.dataset.mongoApiEndpoint // URL for YOUR logging server
  };

  if (!config.posthogKey || !config.mongoLogApi) {
    console.error('PostHog SDK: Missing required data attributes. data-posthog-key and data-mongo-api-endpoint are required.');
    return;
  }

  // Load the official PostHog.js library snippet
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]);t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",p=["capture","register","register_once","unregister","identify","alias","reset","opt_out_capturing","has_opted_out_capturing","opt_in_capturing","isFeatureEnabled","onFeatureFlags","getFeatureFlag","getFeatureFlagPayload","reloadFeatureFlags","updateEarlyAccessFeatureEnrollment","getEarlyAccessFeatures","on","off"],o=0;o<p.length;o++)g(u,p[o]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  // Load Bowser.js for user-agent parsing, directly from a CDN
  const bowserScript = document.createElement('script');
  bowserScript.src = 'https://cdn.jsdelivr.net/npm/bowser@2.11.0/es5.min.js';
  bowserScript.async = true;
  document.head.appendChild(bowserScript);

  // Chain the loading: Initialize PostHog only AFTER Bowser has loaded.
  bowserScript.onload = function() {
    posthog.init(config.posthogKey, {
      api_host: config.posthogHost,
      // The loaded callback ensures PostHog is fully ready before we use it.
      loaded: function(posthog_instance) {
        // Now that PostHog is ready, set up the _onCapture callback.
        posthog_instance._onCapture = (eventName, eventData) => {
          console.log(`[PostHog SDK] Intercepted event: "${eventName}"`);
          
          try {
            // Bowser is guaranteed to be defined here.
            const parser = Bowser.getParser(window.navigator.userAgent);
            const browser = parser.getBrowser();
            const os = parser.getOS();
            const platform = parser.getPlatform();

            const enrichedEvent = {
              event: eventName,
              properties: {
                ...eventData.properties,
                $current_url: window.location.href,
                $host: window.location.host,
                $pathname: window.location.pathname,
                $browser: browser.name || 'Unknown',
                $os: os.name || 'Unknown',
                $device_type: platform.type || 'desktop',
                $screen_height: window.screen.height,
                $screen_width: window.screen.width,
                distinct_id: posthog_instance.get_distinct_id(),
                $session_id: posthog_instance.get_session_id(),
              },
              timestamp: new Date().toISOString(),
            };

            // Log the enriched event to your MongoDB logging server
            fetch(config.mongoLogApi, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(enrichedEvent),
              keepalive: true
            }).catch(error => {
              console.error('PostHog SDK: Error logging event to MongoDB:', error);
            });

          } catch (error) {
            console.error('PostHog SDK: Error in _onCapture enrichment:', error);
          }
          
          // Always return the original eventData to be sent to PostHog Cloud
          return eventData;
        };
      }
    });
  };
})();
