"use strict";

const toggle = document.getElementById("enabled");
const status = document.getElementById("status");
const diagnostics = document.getElementById("diagnostics");

function checkTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError || !tabs[0]?.id) {
      diagnostics.textContent = "Could not find your active tab.";
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, { type: "song-blocker-status" }, (result) => {
      if (chrome.runtime.lastError || !result) {
        diagnostics.textContent = "Filter is not connected. Open YouTube and refresh the page. Also check this extension's site access is allowed on YouTube.";
        return;
      }
      diagnostics.textContent = result.titles === 0
        ? `Filter connected, but no titles found (${result.cards} cards). Scroll to some videos and check again.`
        : `Filter connected: ${result.titles} titles found, ${result.matched} music matches, ${result.hidden} hidden.`;
    });
  });
}
document.getElementById("check").addEventListener("click", checkTab);
checkTab();

function showStatus(enabled) {
  status.textContent = enabled ? "Blocking is on." : "Blocking is off. Videos are visible again.";
}

chrome.storage.local.get({ enabled: true }, (settings) => {
  if (chrome.runtime.lastError) {
    status.textContent = "Could not load your setting. Reopen the popup to retry.";
    return;
  }
  toggle.checked = settings.enabled;
  toggle.disabled = false;
  showStatus(settings.enabled);
});

toggle.addEventListener("change", () => {
  const enabled = toggle.checked;
  toggle.disabled = true;
  chrome.storage.local.set({ enabled }, () => {
    toggle.disabled = false;
    if (chrome.runtime.lastError) {
      toggle.checked = !enabled;
      status.textContent = "Could not save your setting. Try again.";
      return;
    }
    showStatus(enabled);
    setTimeout(checkTab, 250);
  });
});
