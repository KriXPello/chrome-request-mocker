export async function getGrantedSites() {
  const { origins = [] } = await chrome.permissions.getAll();
  return origins.filter((origin) => origin === "<all_urls>" || /^(https?|\*):\/\//.test(origin)).sort();
}

export function sitePermissionPattern(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a site with http:// or https://.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Enter an HTTP or HTTPS site without credentials.");
  }
  if (url.hostname !== "*" && !/^(\*\.)?[^*]+$/.test(url.hostname)) {
    throw new Error("Use *.example.com to include subdomains.");
  }
  return `${url.protocol}//${url.host}/*`;
}

export async function hasSiteAccess(sender) {
  if (sender.id !== chrome.runtime.id || !sender.tab || sender.origin === "null") return false;
  let site;
  try {
    site = sitePermissionPattern(sender.origin || sender.url);
  } catch {
    return false;
  }
  return chrome.permissions.contains({ origins: [site] });
}
