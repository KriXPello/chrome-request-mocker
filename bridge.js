(() => {
  const SOURCE = "__LOCAL_MOCK_EXTENSION_V1__";

  chrome.runtime.sendMessage({ type: "GET_RUNTIME_CONFIG" })
    .then((payload) => {
      publish(payload);
      setTimeout(() => publish(payload), 50);
      setTimeout(() => publish(payload), 250);
    })
    .catch((error) => {
      publish({
        ok: false,
        code: "bridge-error",
        error: error instanceof Error ? error.message : String(error)
      });
    });

  function publish(payload) {
    window.postMessage(
      {
        source: SOURCE,
        type: "CONFIG",
        payload
      },
      "*"
    );
  }
})();
