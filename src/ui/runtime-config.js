export async function notifyRuntimeConfig() {
  try {
    await chrome.runtime.sendMessage({ type: "RUNTIME_CONFIG_UPDATED" });
  } catch (error) {
    console.warn("Runtime config notification failed after saving.", error);
  }
}

export async function notifySiteAccess() {
  const result = await chrome.runtime.sendMessage({ type: "SITE_ACCESS_UPDATED" });
  if (!result?.ok) throw new Error(result?.error || "Could not update site access.");
}
