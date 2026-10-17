import { getGrantedSites } from "../site-access.js";

const SCRIPTS = [
  { id: "local-mock-interceptor", js: ["src/content/interceptor-main.js"], world: "MAIN" },
  { id: "local-mock-bridge", js: ["src/content/bridge.js"], world: "ISOLATED" }
];

export async function syncSiteScripts() {
  const sites = await getGrantedSites();
  const matches = [...new Set(sites.map((site) => {
    if (site === "<all_urls>") return "*://*/*";
    return site;
  }))];
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: SCRIPTS.map((script) => script.id) });
  if (!matches.length) {
    if (registered.length) {
      await chrome.scripting.unregisterContentScripts({ ids: registered.map((script) => script.id) });
    }
    return;
  }

  const existingIds = new Set(registered.map((script) => script.id));
  const updates = [];
  const additions = [];
  for (const script of SCRIPTS) {
    const registration = {
      ...script,
      matches,
      runAt: "document_start",
      allFrames: true,
      matchOriginAsFallback: true,
      persistAcrossSessions: true
    };
    if (existingIds.has(script.id)) {
      updates.push(registration);
    } else {
      additions.push(registration);
    }
  }
  if (updates.length) await chrome.scripting.updateContentScripts(updates);
  if (additions.length) await chrome.scripting.registerContentScripts(additions);
}
