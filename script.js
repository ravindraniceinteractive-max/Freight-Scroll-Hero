/**
 * =============================================================
 * FREIGHT SCROLL HERO CONTROLLER
 * Continuous camera climb aerial video scrubber
 * =============================================================
 */

(function() {
  'use strict';

  const track = document.getElementById('track');
  const video = document.getElementById('heroVideo');
  const lastBlock = document.getElementById('lastBlock');

  // Media URLs
  const url1080 = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/e02bb27f-80d8-445f-a03e-1b609dac4261.mp4';
  const url720 = 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/e8eb434f-d097-4b1b-b9e6-c8b46fa43040.mp4';

  const isLowBandwidth = (window.innerWidth <= 900) || (navigator.connection && navigator.connection.saveData);
  const chosenVideoUrl = isLowBandwidth ? url720 : url1080;

  // Rule: the video is never played, looped or faded. It is only scrubbed.
  video.pause();
  video.src = chosenVideoUrl;
  video.load();

  // Preload video as an in-memory Blob for instant, zero-latency 60fps scrubbing
  fetch(chosenVideoUrl)
    .then(function(res) {
      if (!res.ok) throw new Error('Network response was not ok');
      return res.blob();
    })
    .then(function(blob) {
      const blobUrl = URL.createObjectURL(blob);
      const currentTime = video.currentTime;
      video.src = blobUrl;
      video.currentTime = currentTime;
    })
    .catch(function() {
      // Direct CloudFront URL remains active as reliable fallback
    });

  let curTime = 0;
  let targetTime = 0;
  let cachedLayout = {
    end: 1,
    knee: 0.5,
    trackTop: 0,
    lastBlockBottom: 0,
    viewport: window.innerHeight
  };

  /**
   * Measure track dimensions & configure total track height
   * Formula:
   * end = lastBlock.bottom + 0.75 * viewport
   * track height = end + viewport
   */
  function updateLayout() {
    const viewport = window.innerHeight;
    const isPortrait = window.innerWidth <= 609 || (window.innerHeight > window.innerWidth);
    const uPx = isPortrait
      ? Math.min(window.innerWidth / 390, 1.6)
      : Math.min(window.innerHeight / 800, window.innerWidth / 716);
    document.documentElement.style.setProperty('--u', uPx + 'px');

    const trackTop = track.getBoundingClientRect().top + window.scrollY;
    const lastBlockRect = lastBlock.getBoundingClientRect();
    const lastBlockBottom = (lastBlockRect.bottom + window.scrollY) - trackTop;

    const end = Math.max(1, lastBlockBottom + 0.75 * viewport);
    const knee = Math.max(0.01, Math.min(0.99, lastBlockBottom / end));

    track.style.height = (end + viewport) + 'px';

    cachedLayout = {
      end: end,
      knee: knee,
      trackTop: trackTop,
      lastBlockBottom: lastBlockBottom,
      viewport: viewport
    };

    return cachedLayout;
  }

  /**
   * Two-part mapping from scroll progress p:
   * While p < knee: clip progress = p / knee * 0.46
   * After that: runs from 0.46 to 1.0
   */
  function calculateClipProgress(p, knee) {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    if (p < knee) {
      return (p / knee) * 0.46;
    } else {
      return 0.46 + ((p - knee) / (1 - knee)) * (1 - 0.46);
    }
  }

  function calculateClipTimeFromScroll(scrollY) {
    const { end, knee, trackTop } = cachedLayout;
    const p = Math.max(0, Math.min(1, (scrollY - trackTop) / end));
    const clipProgress = calculateClipProgress(p, knee);
    const dur = (video.duration && !isNaN(video.duration) && video.duration > 0) ? video.duration : 5.04;
    return clipProgress * (dur - 1 / 48);
  }

  function updateTargetTime() {
    targetTime = calculateClipTimeFromScroll(window.scrollY);
  }

  /**
   * Smoothing: each frame, cur += (target - cur) * 0.22.
   * Set currentTime only when the video isn't already seeking and the difference is > 1/60 s.
   */
  function scrubStep() {
    curTime += (targetTime - curTime) * 0.22;

    if (video.readyState >= 1 && !video.seeking && Math.abs(curTime - video.currentTime) > (1 / 60)) {
      try {
        if (typeof video.fastSeek === 'function') {
          video.fastSeek(curTime);
        } else {
          video.currentTime = curTime;
        }
      } catch (e) {}
    }
  }

  // Re-seek on 'seeked' if lag exists
  video.addEventListener('seeked', function() {
    if (video.readyState >= 1 && Math.abs(curTime - video.currentTime) > (1 / 60)) {
      try {
        if (typeof video.fastSeek === 'function') {
          video.fastSeek(curTime);
        } else {
          video.currentTime = curTime;
        }
      } catch (e) {}
    }
  });

  function animationTick() {
    updateTargetTime();
    scrubStep();
    requestAnimationFrame(animationTick);
  }

  // Listeners
  window.addEventListener('scroll', updateTargetTime, { passive: true });
  window.addEventListener('resize', updateLayout);
  window.addEventListener('orientationchange', updateLayout);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function() {
      updateLayout();
      updateTargetTime();
    });
  }

  video.addEventListener('loadedmetadata', function() {
    video.pause();
    updateLayout();
    updateTargetTime();
    curTime = targetTime;
    try {
      video.currentTime = curTime;
    } catch (e) {}
  });

  // Run on DOM ready
  updateLayout();
  updateTargetTime();
  requestAnimationFrame(animationTick);

  /* -------------------------------------------------------------
     Cubic-Bezier Solver for Recorder Mode
     cubic-bezier(0.45, 0.05, 0.55, 0.95)
     ------------------------------------------------------------- */
  function createCubicBezier(p1x, p1y, p2x, p2y) {
    return function(t) {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      let s = t;
      for (let i = 0; i < 8; i++) {
        const currentX = 3 * (1 - s) * (1 - s) * s * p1x + 3 * (1 - s) * s * s * p2x + s * s * s;
        const currentSlope = 3 * (1 - s) * (1 - s) * p1x + 6 * (1 - s) * s * (p2x - p1x) + 3 * s * s * (1 - p2x);
        const diff = currentX - t;
        if (Math.abs(diff) < 1e-6) break;
        if (Math.abs(currentSlope) > 1e-6) {
          s -= diff / currentSlope;
        } else {
          break;
        }
      }
      s = Math.max(0, Math.min(1, s));
      return 3 * (1 - s) * (1 - s) * s * p1y + 3 * (1 - s) * s * s * p2y + s * s * s;
    };
  }

  const recorderEase = createCubicBezier(0.45, 0.05, 0.55, 0.95);

  /**
   * Recorder Mode helper: window.__recTime(video, t)
   * Scrolls the page to that progress and returns the matching clip time.
   * Deterministic for frame-by-frame recorders.
   */
  window.__recTime = function(targetVid, t) {
    let vid = video;
    let timeInSec = t;

    // Support both signatures: (video, t) or (t)
    if (typeof targetVid === 'number') {
      timeInSec = targetVid;
    } else if (targetVid && targetVid.tagName === 'VIDEO') {
      vid = targetVid;
    }

    // Support milliseconds input
    if (timeInSec > 6.5) {
      timeInSec = timeInSec / 1000;
    }

    const clampedT = Math.max(0, Math.min(6.5, timeInSec));
    const normT = clampedT / 6.5;

    let progress = 0;
    if (normT <= 0.03) {
      progress = 0;
    } else if (normT >= 0.94) {
      progress = 1;
    } else {
      const ratio = (normT - 0.03) / (0.94 - 0.03);
      progress = recorderEase(ratio);
    }

    updateLayout();
    const { end, knee, trackTop, viewport } = cachedLayout;
    const maxScrollPast = end + 0.9 * viewport;
    const targetScrollY = trackTop + progress * maxScrollPast;

    window.scrollTo(0, targetScrollY);

    const p = Math.max(0, Math.min(1, (targetScrollY - trackTop) / end));
    const clipProgress = calculateClipProgress(p, knee);
    const dur = (vid.duration && !isNaN(vid.duration) && vid.duration > 0) ? vid.duration : 5.04;
    const clipTime = clipProgress * (dur - 1 / 48);

    // Immediate deterministic positioning
    curTime = clipTime;
    targetTime = clipTime;
    try {
      vid.currentTime = clipTime;
    } catch (e) {}

    return clipTime;
  };

  /**
   * Live Recorder Mode (?rec=1):
   * A 6.5 s Web Animation drives the progress:
   * hold to 3%, one even ease (cubic-bezier .45,.05,.55,.95) to 94%, then hold.
   * Runs past the end of the track by 0.9 viewport so the testimonial section scrolls in.
   */
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('rec') === '1') {
    window.addEventListener('load', function() {
      updateLayout();
      const { end, trackTop, viewport } = cachedLayout;
      const maxScrollPast = end + 0.9 * viewport;

      const animDriver = document.createElement('div');
      animDriver.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.001;pointer-events:none;z-index:-999;';
      document.body.appendChild(animDriver);

      const webAnimation = animDriver.animate([
        { transform: 'translateY(0px)', offset: 0 },
        { transform: 'translateY(0px)', offset: 0.03, easing: 'cubic-bezier(0.45, 0.05, 0.55, 0.95)' },
        { transform: 'translateY(' + maxScrollPast + 'px)', offset: 0.94 },
        { transform: 'translateY(' + maxScrollPast + 'px)', offset: 1.0 }
      ], {
        duration: 6500,
        fill: 'forwards'
      });

      function syncAnimationScroll() {
        const tMs = webAnimation.currentTime || 0;
        window.__recTime(video, tMs / 1000);
        if (webAnimation.playState !== 'finished') {
          requestAnimationFrame(syncAnimationScroll);
        }
      }
      requestAnimationFrame(syncAnimationScroll);
    });
  }

})();
