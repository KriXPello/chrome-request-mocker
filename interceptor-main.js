(() => {
  const INSTALL_FLAG = "__LOCAL_MOCK_EXTENSION_INSTALLED__";
  const SOURCE = "__LOCAL_MOCK_EXTENSION_V1__";
  const CONFIG_TIMEOUT_MS = 5000;

  if (window[INSTALL_FLAG]) {
    return;
  }

  Object.defineProperty(window, INSTALL_FLAG, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  let configLoaded = false;
  let preparedConfig = null;
  let resolveConfig;

  const configReady = new Promise((resolve) => {
    resolveConfig = resolve;
  });

  const configTimeout = setTimeout(() => {
    settleConfig(null, "Timed out while loading Chrome Request Mocker config; requests will pass through.");
  }, CONFIG_TIMEOUT_MS);

  window.addEventListener("message", onBridgeMessage);

  function onBridgeMessage(event) {
    if (event.source !== window) {
      return;
    }

    const message = event.data;
    if (!message || message.source !== SOURCE || message.type !== "CONFIG") {
      return;
    }

    const payload = message.payload;
    if (payload?.ok) {
      settleConfig(payload.config ?? null, null, true);
    } else {
      settleConfig(null, payload?.error || "Could not load Chrome Request Mocker config.");
    }
  }

  function settleConfig(config, error, runtimeLoaded = false) {
    if (configLoaded) {
      return;
    }

    configLoaded = true;
    clearTimeout(configTimeout);
    window.removeEventListener("message", onBridgeMessage);

    if (error) {
      console.warn(`[Chrome Request Mocker] ${error}`);
    }

    preparedConfig = prepareConfig(config);
    if (runtimeLoaded) {
      console.info(`[Chrome Request Mocker] Loaded runtime config (${preparedConfig.rules.length} rules).`);
    }

    resolveConfig(preparedConfig);
  }

  function prepareConfig(config) {
    if (!config || !Array.isArray(config.rules)) {
      return { rules: [] };
    }

    const rules = [];
    for (const rule of config.rules) {
      try {
        rules.push({
          ...rule,
          matcher: globToRegExp(rule.pattern)
        });
      } catch (error) {
        console.warn(`[Chrome Request Mocker] Invalid pattern ${JSON.stringify(rule.pattern)}:`, error);
      }
    }

    return { rules };
  }

  function globToRegExp(glob) {
    let source = "^";
    const special = new Set(["\\", "^", "$", ".", "+", "(", ")", "[", "]", "{", "}", "|"]);

    for (let index = 0; index < glob.length; index += 1) {
      const char = glob[index];
      if (char === "*") {
        if (glob[index + 1] === "*") {
          source += ".*";
          index += 1;
        } else {
          source += "[^/]*";
        }
      } else if (char === "?") {
        source += "[^/]";
      } else if (special.has(char)) {
        source += `\\${char}`;
      } else {
        source += char;
      }
    }

    source += "$";
    return new RegExp(source);
  }

  function absoluteUrl(input) {
    try {
      if (input instanceof Request) {
        return input.url;
      }
      return new URL(String(input), window.location.href).href;
    } catch {
      return String(input);
    }
  }

  function urlForMatching(url) {
    try {
      const parsed = new URL(url);
      parsed.search = "";
      parsed.hash = "";
      return parsed.href;
    } catch {
      return url;
    }
  }

  function matchingRule(config, url, method) {
    if (!config) {
      return null;
    }

    for (const rule of config.rules) {
      if (rule.matcher.test(url) && (!rule.methods || rule.methods.includes(method))) {
        return rule;
      }
    }

    return null;
  }

  function sleep(ms, signal) {
    if (signal?.aborted) {
      return Promise.reject(abortError());
    }

    return new Promise((resolve, reject) => {
      let timer = null;

      const cleanup = () => {
        if (timer !== null) {
          clearTimeout(timer);
        }
        signal?.removeEventListener("abort", onAbort);
      };

      const onAbort = () => {
        cleanup();
        reject(abortError());
      };

      timer = setTimeout(() => {
        cleanup();
        resolve();
      }, ms);

      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  function abortError() {
    return new DOMException("The operation was aborted.", "AbortError");
  }

  patchFetch();
  patchXmlHttpRequest();

  function patchFetch() {
    const nativeFetch = window.fetch;

    window.fetch = async function localMockFetch(input, init) {
      const config = configLoaded ? preparedConfig : await configReady;
      const url = absoluteUrl(input);
      const method = effectiveFetchMethod(input, init);
      const rule = matchingRule(config, urlForMatching(url), method);

      if (!rule) {
        return nativeFetch.apply(this, arguments);
      }

      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      await sleep(rule.delay, signal);

      const responseConfig = responseForRule(rule);
      const body = method === "HEAD" || [204, 205, 304].includes(responseConfig.status)
        ? undefined
        : JSON.stringify(responseConfig.body);
      const response = new Response(body, {
        status: responseConfig.status,
        statusText: responseConfig.statusText,
        headers: responseConfig.headers
      });

      try {
        Object.defineProperty(response, "url", {
          value: url,
          configurable: true
        });
      } catch {
        // Non-essential; a constructed Response normally has an empty URL.
      }

      console.debug(`[Chrome Request Mocker] fetch ${method} ${url} -> ${rule.configId ?? "?"}/${rule.ruleId ?? rule.pattern} (${rule.delay} ms)`);
      return response;
    };
  }

  function effectiveFetchMethod(input, init) {
    if (init && init.method !== undefined) {
      return String(init.method).toUpperCase();
    }

    if (input instanceof Request) {
      return input.method.toUpperCase();
    }

    return "GET";
  }

  function patchXmlHttpRequest() {
    const NativeXHR = window.XMLHttpRequest;
    if (!NativeXHR?.prototype) {
      return;
    }

    const nativeOpen = NativeXHR.prototype.open;
    const nativeSend = NativeXHR.prototype.send;
    const nativeAbort = NativeXHR.prototype.abort;
    const metadata = new WeakMap();

    const mockOwnProperties = [
      "readyState",
      "status",
      "statusText",
      "responseURL",
      "responseText",
      "response",
      "responseXML",
      "getResponseHeader",
      "getAllResponseHeaders"
    ];

    NativeXHR.prototype.open = function localMockOpen(method, url, async = true, user, password) {
      clearMockProperties(this, mockOwnProperties);

      const result = nativeOpen.call(this, method, url, async, user, password);
      const requestUrl = absoluteUrl(url);
      metadata.set(this, {
        url: requestUrl,
        matchingUrl: urlForMatching(requestUrl),
        method: String(method || "GET").toUpperCase(),
        async: async !== false,
        aborted: false,
        delegated: false,
        mocked: false,
        timer: null,
        timeoutTimer: null,
        state: null
      });

      return result;
    };

    NativeXHR.prototype.send = function localMockSend(body = null) {
      const xhr = this;
      const meta = metadata.get(xhr);

      if (!meta) {
        return nativeSend.call(xhr, body);
      }

      if (!meta.async) {
        if (!configLoaded) {
          throw new DOMException(
            "Chrome Request Mocker cannot wait for its config during a synchronous XMLHttpRequest.",
            "NotSupportedError"
          );
        }

        const rule = matchingRule(preparedConfig, meta.matchingUrl, meta.method);
        if (!rule) {
          meta.delegated = true;
          return nativeSend.call(xhr, body);
        }

        meta.mocked = true;
        const end = performance.now() + rule.delay;
        while (performance.now() < end) {
          // Synchronous XHR blocks the main thread too; preserve that behavior for configured delay.
        }
        completeMockXhr(xhr, meta, rule);
        return undefined;
      }

      const decide = configLoaded ? Promise.resolve(preparedConfig) : configReady;

      decide.then((config) => {
        if (meta.aborted) {
          return;
        }

        const rule = matchingRule(config, meta.matchingUrl, meta.method);
        if (!rule) {
          meta.delegated = true;
          nativeSend.call(xhr, body);
          return;
        }

        beginMockXhr(xhr, meta, rule);
      });

      return undefined;
    };

    NativeXHR.prototype.abort = function localMockAbort() {
      const meta = metadata.get(this);

      if (!meta || meta.delegated) {
        return nativeAbort.call(this);
      }

      meta.aborted = true;
      clearTimeout(meta.timer);
      clearTimeout(meta.timeoutTimer);

      if (meta.mocked) {
        if (meta.state) {
          meta.state.readyState = 0;
          meta.state.status = 0;
          meta.state.statusText = "";
        }
        this.dispatchEvent(new Event("abort"));
        this.dispatchEvent(new Event("loadend"));
      }

      return undefined;
    };

    function beginMockXhr(xhr, meta, rule) {
      meta.mocked = true;
      meta.state = makeMockState(xhr, meta.url, responseForRule(rule), meta.method);
      installMockProperties(xhr, meta.state);

      xhr.dispatchEvent(new Event("loadstart"));

      const timeout = Number(xhr.timeout) || 0;
      if (timeout > 0 && timeout < rule.delay) {
        meta.timeoutTimer = setTimeout(() => {
          if (meta.aborted) {
            return;
          }

          meta.state.readyState = 4;
          meta.state.status = 0;
          meta.state.statusText = "";
          xhr.dispatchEvent(new Event("readystatechange"));
          xhr.dispatchEvent(new Event("timeout"));
          xhr.dispatchEvent(new Event("loadend"));
        }, timeout);
        return;
      }

      meta.timer = setTimeout(() => {
        if (meta.aborted) {
          return;
        }
        completeMockXhr(xhr, meta, rule);
      }, rule.delay);
    }

    function completeMockXhr(xhr, meta, rule) {
      if (!meta.state) {
        meta.state = makeMockState(xhr, meta.url, responseForRule(rule), meta.method);
        installMockProperties(xhr, meta.state);
        xhr.dispatchEvent(new Event("loadstart"));
      }

      meta.state.status = meta.state.responseConfig.status;
      meta.state.statusText = meta.state.responseConfig.statusText;

      meta.state.readyState = 2;
      xhr.dispatchEvent(new Event("readystatechange"));

      meta.state.readyState = 3;
      xhr.dispatchEvent(new Event("readystatechange"));

      meta.state.readyState = 4;
      xhr.dispatchEvent(new Event("readystatechange"));

      const byteLength = new TextEncoder().encode(meta.state.text).byteLength;
      xhr.dispatchEvent(
        new ProgressEvent("progress", {
          lengthComputable: true,
          loaded: byteLength,
          total: byteLength
        })
      );
      xhr.dispatchEvent(new Event("load"));
      xhr.dispatchEvent(new Event("loadend"));

      console.debug(`[Chrome Request Mocker] XHR ${meta.method} ${meta.url} -> ${rule.configId ?? "?"}/${rule.ruleId ?? rule.pattern} (${rule.delay} ms)`);
    }

    function makeMockState(xhr, url, responseConfig, method) {
      const bodyless = method === "HEAD" || [204, 205, 304].includes(responseConfig.status);
      const text = bodyless ? "" : JSON.stringify(responseConfig.body);
      const responseType = xhr.responseType || "";
      let response;

      if (responseType === "json") {
        response = bodyless ? null : responseConfig.body;
      } else if (responseType === "arraybuffer") {
        response = new TextEncoder().encode(text).buffer;
      } else if (responseType === "blob") {
        const contentType = Object.entries(responseConfig.headers)
          .find(([name]) => name.toLowerCase() === "content-type")?.[1] || "application/json";
        response = new Blob([text], { type: contentType });
      } else if (responseType === "document") {
        response = null;
      } else {
        response = text;
      }

      return {
        readyState: 1,
        status: 0,
        statusText: "",
        responseURL: url,
        text,
        response,
        responseConfig
      };
    }

    function installMockProperties(xhr, state) {
      defineGetter(xhr, "readyState", () => state.readyState);
      defineGetter(xhr, "status", () => state.status);
      defineGetter(xhr, "statusText", () => state.statusText);
      defineGetter(xhr, "responseURL", () => state.responseURL);
      defineGetter(xhr, "responseText", () => {
        if (xhr.responseType !== "" && xhr.responseType !== "text") {
          throw new DOMException(
            "The value is only accessible if the object's responseType is '' or 'text'.",
            "InvalidStateError"
          );
        }
        return state.text;
      });
      defineGetter(xhr, "response", () => state.response);
      defineGetter(xhr, "responseXML", () => null);

      Object.defineProperty(xhr, "getResponseHeader", {
        configurable: true,
        value(name) {
          if (state.readyState < 2) {
            return null;
          }
          const requested = String(name).toLowerCase();
          const header = Object.entries(state.responseConfig.headers)
            .find(([headerName]) => headerName.toLowerCase() === requested);
          return header ? header[1] : null;
        }
      });

      Object.defineProperty(xhr, "getAllResponseHeaders", {
        configurable: true,
        value() {
          if (state.readyState < 2) {
            return "";
          }
          return Object.entries(state.responseConfig.headers)
            .map(([name, value]) => `${name}: ${value}\r\n`).join("");
        }
      });
    }

    function responseForRule(rule) {
      if (rule.responseFormatVersion === 2) {
        return rule.response;
      }
      return {
        body: rule.response,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        status: 200,
        statusText: "OK"
      };
    }

    function defineGetter(target, name, getter) {
      Object.defineProperty(target, name, {
        configurable: true,
        enumerable: true,
        get: getter
      });
    }

    function clearMockProperties(xhr, properties) {
      for (const property of properties) {
        try {
          delete xhr[property];
        } catch {
          // Ignore non-configurable properties from unusual XHR implementations.
        }
      }
    }
  }
})();
