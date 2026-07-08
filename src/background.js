// Nile background — one job: clicking the toolbar button opens the options page.
// Works unchanged as an MV3 service worker and an MV2 event page (feature-detect
// action vs browserAction).
(function () {
  "use strict";
  var action = (typeof chrome !== "undefined") && (chrome.action || chrome.browserAction);
  if (!action || !action.onClicked) return;
  action.onClicked.addListener(function () {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    else window.open(chrome.runtime.getURL("options/options.html"));
  });
})();
