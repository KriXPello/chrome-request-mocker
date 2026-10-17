import { getGrantedSites, sitePermissionPattern } from "../../site-access.js";
import { notifySiteAccess } from "../runtime-config.js";

export function initializeSiteAccess(onStatus) {
  const form = document.querySelector("#site-access-form");
  const input = document.querySelector("#site-access-input");
  const addButton = document.querySelector("#site-access-add");
  const list = document.querySelector("#site-access-list");
  const empty = document.querySelector("#site-access-empty");
  let saveInProgress = false;

  form.addEventListener("submit", addSite);
  chrome.permissions.onAdded.addListener(refreshSites);
  chrome.permissions.onRemoved.addListener(refreshSites);
  refreshSites();

  function refreshSites() {
    renderSites().catch((error) => onStatus(error.message, "error"));
  }

  async function renderSites() {
    const sites = await getGrantedSites();
    const rows = [];
    for (const site of sites) {
      const row = document.createElement("li");
      const label = document.createElement("code");
      label.textContent = site;
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.textContent = "Remove";
      removeButton.setAttribute("aria-label", `Remove access to ${site}`);
      removeButton.disabled = saveInProgress;
      removeButton.addEventListener("click", () => removeSite(site));
      row.append(label, removeButton);
      rows.push(row);
    }
    list.replaceChildren(...rows);
    empty.hidden = sites.length > 0;
  }

  function setSaveInProgress(value) {
    saveInProgress = value;
    input.disabled = value;
    addButton.disabled = value;
    for (const button of list.querySelectorAll("button")) button.disabled = value;
  }

  async function applySiteAccess() {
    await notifySiteAccess();
    await renderSites();
  }

  async function addSite(event) {
    event.preventDefault();
    if (saveInProgress) return;
    try {
      const site = sitePermissionPattern(input.value.trim());
      setSaveInProgress(true);
      // Keep the permission request in the submit gesture; do not await anything before it.
      const granted = await chrome.permissions.request({ origins: [site] });
      if (!granted) {
        onStatus("Site access was not granted.", "");
        return;
      }
      await applySiteAccess();
      input.value = "";
      onStatus("Site access granted. Reload the site to enable interception.", "ok");
    } catch (error) {
      onStatus(error.message, "error");
    } finally {
      setSaveInProgress(false);
    }
  }

  async function removeSite(site) {
    if (saveInProgress) return;
    setSaveInProgress(true);
    try {
      await chrome.permissions.remove({ origins: [site] });
      await applySiteAccess();
      onStatus("Site access removed. Reload open pages to remove the injected scripts completely.", "ok");
    } catch (error) {
      onStatus(error.message, "error");
    } finally {
      setSaveInProgress(false);
    }
  }
}
