export async function notifyRuntimeConfig() {
  try {
    await chrome.runtime.sendMessage({ type: "RUNTIME_CONFIG_UPDATED" });
  } catch (error) {
    console.warn("Runtime config notification failed after saving.", error);
  }
}
