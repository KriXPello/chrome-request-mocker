import { sitePermissionPattern } from "../../site-access.js";
import { notifySiteAccess } from "../runtime-config.js";

export function initializeSiteAccess() {
  const panel = document.querySelector("#current-site-access");
  const name = document.querySelector("#current-site-name");
  const status = document.querySelector("#current-site-status");
  const note = document.querySelector("#current-site-note");
  const grantButton = document.querySelector("#grant-current-site");
  const reloadButton = document.querySelector("#reload-current-site");
  let site = null;
  let accessGranted = false;
  let interceptorInstalled = false;
  let actionInProgress = false;
  let refreshVersion = 0;

  grantButton.addEventListener("click", grantAccess);
  reloadButton.addEventListener("click", reloadPage);
  chrome.permissions.onAdded.addListener(refreshAccess);
  chrome.permissions.onRemoved.addListener(refreshAccess);
  refreshAccess();

  function refreshAccess() {
    loadAccess().catch((error) => showNote(error.message, true));
  }

  async function loadAccess() {
    const version = ++refreshVersion;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let currentSite = null;
    if (tab?.id !== undefined && tab.url) {
      try {
        currentSite = { tabId: tab.id, pattern: sitePermissionPattern(tab.url), origin: new URL(tab.url).origin };
      } catch {
        // Browser pages and other non-HTTP(S) documents cannot be granted site access here.
      }
    }
    let granted = false;
    if (currentSite) granted = await chrome.permissions.contains({ origins: [currentSite.pattern] });
    let installed = false;
    if (currentSite && granted) {
      try {
        const result = await chrome.tabs.sendMessage(currentSite.tabId, { type: "GET_INTERCEPTION_STATUS" }, { frameId: 0 });
        installed = result?.installed === true;
      } catch {
        // A page opened before permission was granted has no bridge and needs a reload.
      }
    }
    if (version !== refreshVersion) return;
    site = currentSite;
    accessGranted = granted;
    interceptorInstalled = installed;
    panel.hidden = accessGranted && interceptorInstalled;
    if (site) {
      name.textContent = site.origin;
      name.title = site.origin;
      if (accessGranted) {
        status.textContent = "Site access granted";
      } else {
        status.textContent = "No site access";
      }
    } else {
      name.textContent = "Current page";
      name.removeAttribute("title");
      status.textContent = "Interception is unavailable on this page";
    }
    renderButtons();
  }

  function renderButtons() {
    grantButton.hidden = !site || accessGranted;
    reloadButton.hidden = !site || !accessGranted;
    grantButton.disabled = actionInProgress;
    reloadButton.disabled = actionInProgress;
  }

  function showNote(message, error = false) {
    note.textContent = message;
    note.hidden = !message;
    note.classList.toggle("error", error);
    if (error) panel.hidden = false;
  }

  async function grantAccess() {
    if (!site || accessGranted || actionInProgress) return;
    const requestedSite = site;
    actionInProgress = true;
    renderButtons();
    showNote("");
    try {
      // Request persistent host access directly in the click gesture, before any await.
      const granted = await chrome.permissions.request({ origins: [requestedSite.pattern] });
      if (!granted) {
        showNote("Site access was not granted.");
        return;
      }
      await notifySiteAccess();
      await loadAccess();
      if (!interceptorInstalled) showNote("Access granted. Reload the page to enable interception.");
    } catch (error) {
      showNote(error.message, true);
    } finally {
      actionInProgress = false;
      renderButtons();
    }
  }

  async function reloadPage() {
    if (!site || !accessGranted || actionInProgress) return;
    actionInProgress = true;
    renderButtons();
    try {
      await chrome.tabs.reload(site.tabId);
      window.close();
    } catch (error) {
      showNote(error.message, true);
    } finally {
      actionInProgress = false;
      renderButtons();
    }
  }
}
