(() => {
  "use strict";

  // Whole-word matching keeps short keywords like MV from matching DMV.
  const musicPattern = /\b(?:lyrics?|music\s+video|official\s+audio|m\s*\/\s*v|mv|fmv|amv|songs?|ost|soundtrack|remix|cover|slowed|reverb)\b/i;
  const cardSelector = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "yt-lockup-view-model"
  ].join(",");
  const titleSelector = [
    "#video-title", "#video-title-link",
    ".yt-lockup-metadata-view-model__title",
    ".yt-lockup-metadata-view-model-wiz__title",
    ".ytLockupMetadataViewModelTitle",
    "h3 a[href*='/watch']", "h3[title]"
  ].join(",");
  const hiddenClass = "yt-song-blocker-hidden";
  let enabled = false;
  let scheduled = false;
  let counts = { cards: 0, titles: 0, matched: 0, hidden: 0 };
  let playbackBlocked = false;
  let navigating = false;
  const notice = document.createElement("div");
  notice.setAttribute("role", "status");
  notice.style.cssText = "position:absolute;inset:0;z-index:10000;display:grid;place-content:center;text-align:center;background:#171717;color:white;font:600 20px system-ui;padding:24px;";
  notice.textContent = "Song blocked by YT Song Blocker. Turn blocking off in the extension popup to watch.";

  // Our own class lets us restore cards without changing YouTube's styles.
  const style = document.createElement("style");
  style.textContent = `.${hiddenClass} { display: none !important; }`;
  document.documentElement.append(style);

  function checkPlayback() {
    const videoId = new URL(location.href).searchParams.get("v");
    const watchPage = document.querySelector("ytd-watch-flexy");
    // Ignore the previous video's title while YouTube switches pages.
    const currentPage = location.pathname === "/watch" && videoId && !navigating &&
      (!watchPage?.getAttribute("video-id") || watchPage.getAttribute("video-id") === videoId);
    const title = currentPage
      ? document.querySelector("ytd-watch-metadata h1, #above-the-fold #title h1, h1.ytd-video-primary-info-renderer")?.textContent || ""
      : "";
    playbackBlocked = Boolean(enabled && musicPattern.test(title.normalize("NFKC")));
    const player = currentPage ? document.querySelector("#movie_player") : null;
    if (playbackBlocked && player) {
      if (notice.parentElement !== player) player.append(notice);
      player.querySelectorAll("video").forEach((video) => video.pause());
    } else {
      if (notice.parentElement) notice.remove();
    }
  }

  // Pause again if YouTube autoplay, the keyboard, or another control resumes it.
  function stopBlockedPlayback(event) {
    checkPlayback();
    if (playbackBlocked && event.target.matches?.("video") &&
        event.target.closest("#movie_player")) event.target.pause();
  }
  document.addEventListener("play", stopBlockedPlayback, true);
  document.addEventListener("playing", stopBlockedPlayback, true);

  function scanCards() {
    scheduled = false;
    counts = { cards: 0, titles: 0, matched: 0, hidden: 0 };
    document.querySelectorAll(cardSelector).forEach((card) => {
      // Hide the outer grid/search card, including its spacing, when lockups nest inside it.
      if (card.parentElement?.closest(cardSelector)) {
        card.classList.remove(hiddenClass);
        return;
      }
      const titleElement = card.querySelector(titleSelector);
      const title = titleElement?.getAttribute("title") || titleElement?.textContent || "";
      const matched = musicPattern.test(title.normalize("NFKC"));
      counts.cards++;
      if (title.trim()) counts.titles++;
      if (matched) counts.matched++;
      if (enabled && matched) counts.hidden++;
      card.classList.toggle(hiddenClass, enabled && matched);
    });
    checkPlayback();
  }

  // Batch page updates so an infinite-scroll burst triggers just one scan.
  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(scanCards, 100);
  }

  const observer = new MutationObserver((changes) => {
    if (changes.some((change) =>
      change.type !== "attributes" || change.attributeName !== "class"
    )) scheduleScan();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["title", "class"]
  });

  chrome.storage.local.get({ enabled: true }, (settings) => {
    if (chrome.runtime.lastError) {
      console.warn("YT Song Blocker could not read its setting.");
      return;
    }
    enabled = settings.enabled;
    scheduleScan();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.enabled) {
      enabled = changes.enabled.newValue ?? true;
      scheduleScan();
    }
  });

  // YouTube navigates between pages without doing a full browser reload.
  document.addEventListener("yt-navigate-start", () => {
    navigating = true;
    checkPlayback();
  });
  document.addEventListener("yt-navigate-finish", () => {
    navigating = false;
    scheduleScan();
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type !== "song-blocker-status") return;
    scanCards();
    respond({ enabled, playbackBlocked, ...counts });
  });
})();
