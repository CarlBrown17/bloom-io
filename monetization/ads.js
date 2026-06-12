// ============================================================
// ADS — Google AdSense for Games (H5 Games Ads / Ad Placement API).
//
// Web games should use the Ad Placement API (adBreak/adConfig) for
// interstitials and rewarded ads — NOT AdMob (that's native apps only).
// Banner uses a standard AdSense responsive display unit.
// Docs: https://developers.google.com/ad-placement
// ============================================================
import { CONFIG } from '../config.js';
import { Analytics } from './analytics.js';

export const Ads = {
  initialized: false,
  lastInterstitial: 0,
  premiumUser: false,      // set true after Premium purchase → no ads

  init() {
    if (this.initialized) return;
    this.initialized = true;

    window.adsbygoogle = window.adsbygoogle || [];
    // adBreak / adConfig come from the Ad Placement API (loaded with
    // data-ad-frequency-hint in index.html's AdSense tag)
    window.adBreak = window.adBreak || function (o) { window.adsbygoogle.push(o); };
    window.adConfig = window.adConfig || function (o) { window.adsbygoogle.push(o); };

    // Tell Google this page is a game with sound on
    window.adConfig({ preloadAdBreaks: 'on', sound: 'on' });
  },

  /** Persistent responsive banner at the bottom of the viewport. */
  showBannerAd() {
    if (this.premiumUser) return;
    const slot = document.getElementById('ad-banner');
    if (!slot || slot.dataset.loaded) return;
    if (CONFIG.GOOGLE_AD_CLIENT.includes('XXXX')) return;   // not configured yet — skip silently

    slot.innerHTML =
      `<ins class="adsbygoogle" style="display:block;width:min(728px,100vw);height:90px"` +
      ` data-ad-client="${CONFIG.GOOGLE_AD_CLIENT}"` +
      ` data-ad-slot="${CONFIG.BANNER_AD_SLOT}"` +
      ` data-ad-format="horizontal" data-full-width-responsive="true"></ins>`;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      slot.dataset.loaded = '1';
      this.trackAdImpression('banner');
    } catch { /* ad blocker or not approved yet — never break the game */ }
  },

  /** Fullscreen interstitial after death. Frequency-capped to 1/minute. */
  showInterstitialAd() {
    if (this.premiumUser) return;
    const now = Date.now();
    if (now - this.lastInterstitial < CONFIG.INTERSTITIAL_MIN_INTERVAL) return;
    this.lastInterstitial = now;

    const overlay = document.getElementById('ad-overlay');
    window.adBreak({
      type: 'next',                       // "between levels" placement = death/respawn
      name: 'death-interstitial',
      beforeAd: () => { overlay.style.display = 'flex'; },
      afterAd: () => { overlay.style.display = 'none'; },
      adBreakDone: (info) => {
        overlay.style.display = 'none';
        if (info.breakStatus === 'viewed') this.trackAdImpression('interstitial');
      },
    });
    // Safety: if no ad fills within 4s, hide the overlay so the player isn't stuck
    setTimeout(() => { overlay.style.display = 'none'; }, 4000);
  },

  /**
   * Rewarded video: player opts in, watches, gets the reward.
   * @param {(rewarded: boolean) => void} callback receives true only if fully watched
   */
  showRewardedAd(callback) {
    const overlay = document.getElementById('ad-overlay');
    let rewarded = false;

    // If ads aren't configured/approved yet, grant the reward anyway during dev
    if (CONFIG.GOOGLE_AD_CLIENT.includes('XXXX')) { callback(true); return; }

    window.adBreak({
      type: 'reward',
      name: 'respawn-boost',
      beforeReward: (showAdFn) => { showAdFn(); },          // show as soon as ready
      beforeAd: () => { overlay.style.display = 'flex'; },
      adViewed: () => { rewarded = true; this.trackAdImpression('rewarded'); },
      adDismissed: () => { rewarded = false; },
      afterAd: () => { overlay.style.display = 'none'; },
      adBreakDone: () => {
        overlay.style.display = 'none';
        callback(rewarded);
      },
    });
    // Safety net: if the API never responds (blocked), resolve without reward
    setTimeout(() => {
      if (overlay.style.display === 'flex') { overlay.style.display = 'none'; callback(false); }
    }, 45000);
  },

  trackAdImpression(type) { Analytics.track('ad_impression', { type }); },
  trackAdClick(type) { Analytics.track('ad_click', { type }); },

  /** Called by IAP after a Premium purchase: remove all ads. */
  disableAds() {
    this.premiumUser = true;
    const slot = document.getElementById('ad-banner');
    if (slot) slot.innerHTML = '';
  },
};
