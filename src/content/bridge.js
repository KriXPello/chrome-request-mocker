(() => {
  const SOURCE = "__LOCAL_MOCK_EXTENSION_V1__";
  let generation = 0;

  chrome.runtime.sendMessage({ type: "GET_RUNTIME_CONFIG" })
    .then((payload) => {
      publishInitial(payload);
    })
    .catch((error) => {
      publish({
        ok: false,
        code: "bridge-error",
        error: error instanceof Error ? error.message : String(error)
      });
    });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "RUNTIME_CONFIG_UPDATE") {
      return undefined;
    }
    generation += 1;
    publish(message.payload, generation);
    return undefined;
  });

  function publishInitial(payload) {
    const initialGeneration = generation;
    publish(payload, initialGeneration);
    setTimeout(() => publishIfCurrent(payload, initialGeneration), 50);
    setTimeout(() => publishIfCurrent(payload, initialGeneration), 250);
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
