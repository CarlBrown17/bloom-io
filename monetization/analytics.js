// ============================================================
// ANALYTICS — GA4 (optional) + Supabase analytics_events table.
// Tracks: sessions, blooms, deaths, max biomass/territory,
// ad impressions/clicks, purchases. All fire-and-forget:
// analytics failures can NEVER affect gameplay.
// ============================================================
import { CONFIG } from '../config.js';
import { logAnalyticsEvent } from '../network/supabase.js';

export const Analytics = {
  sessionStart: 0,
  counters: { blooms: 0, deaths: 0, maxBiomass: 0, maxTerritory: 0, adImpressions: 0 },
  userId: null,

  init() {
    this.sessionStart = Date.now();

    // ---- GA4 (only if a measurement ID is configured) ----
    if (CONFIG.GA_MEASUREMENT_ID) {
      const s = document.createElement('script');
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${CONFIG.GA_MEASUREMENT_ID}`;
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', CONFIG.GA_MEASUREMENT_ID);
    }

    // ---- Session duration on tab close ----
    window.addEventListener('beforeunload', () => {
      this.track('session_end', {
        durationSeconds: Math.round((Date.now() - this.sessionStart) / 1000),
        ...this.counters,
      });
    });
  },

  /**
   * Track an event everywhere at once.
   * @param {string} event snake_case event name
   * @param {object} payload small JSON payload
   */
  track(event, payload = {}) {
    // Internal counters for the session summary
    if (event === 'bloom') this.counters.blooms++;
    if (event === 'death') {
      this.counters.deaths++;
      this.counters.maxBiomass = Math.max(this.counters.maxBiomass, payload.biomass || 0);
      this.counters.maxTerritory = Math.max(this.counters.maxTerritory, payload.territory || 0);
    }
    if (event === 'ad_impression') this.counters.adImpressions++;

    // GA4
    try { if (window.gtag) window.gtag('event', event, payload); } catch { /* noop */ }

    // Supabase (DAU/retention queries run on this table — see sql-setup.sql)
    logAnalyticsEvent(this.userId, event, payload);
  },
};
