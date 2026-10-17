(() => {
  const SOURCE = "__LOCAL_MOCK_EXTENSION_V1__";
  let generation = 0;

  requestConfig(true);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "GET_INTERCEPTION_STATUS") {
      queryInterceptor(sendResponse);
      return true;
    }
    if (message?.type !== "RUNTIME_CONFIG_UPDATE") {
      return undefined;
    }
    requestConfig();
    return undefined;
  });

  function queryInterceptor(sendResponse) {
    const requestId = crypto.randomUUID();
    const timeout = setTimeout(() => finish(false), 500);
    window.addEventListener("message", onStatus);
    window.postMessage({ source: SOURCE, type: "GET_INTERCEPTION_STATUS", requestId }, "*");

    function onStatus(event) {
      const message = event.data;
      if (event.source !== window || message?.source !== SOURCE || message.type !== "INTERCEPTION_STATUS"
        || message.requestId !== requestId) return;
      finish(message.installed === true);
    }

    function finish(installed) {
      clearTimeout(timeout);
      window.removeEventListener("message", onStatus);
      sendResponse({ installed });
    }
  }

  async function requestConfig(initial = false) {
    const revision = ++generation;
    let payload;
    try {
      payload = await chrome.runtime.sendMessage({ type: "GET_RUNTIME_CONFIG" });
      if (!payload?.ok) throw new Error(payload?.error || "Could not load runtime config.");
    } catch (error) {
      console.warn("[Chrome Request Mocker] Runtime config unavailable; mocks disabled.", error);
      payload = { ok: true, config: { rules: [], logging: { mode: "off", includeResponse: false } } };
    }
    publishIfCurrent(payload, revision);
    if (initial) {
      setTimeout(() => publishIfCurrent(payload, revision), 50);
      setTimeout(() => publishIfCurrent(payload, revision), 250);
    }
  }

  function publishIfCurrent(payload, expectedGeneration) {
    if (generation === expectedGeneration) {
      publish(payload, expectedGeneration);
    }
  }

  function publish(payload, revision) {
    window.postMessage(
      {
        source: SOURCE,
        type: "CONFIG",
        revision,
        payload
      },
      "*"
    );
  }
})();
