(function pwaDiagnosticsModule(global) {
  "use strict";

  const FORMAT = "kinodreieck-pwa-android-diagnose";
  const VERSION = 1;
  const OFFLINE_PROBE_HEADER = "x-kd-offline-probe";
  const STATUS = Object.freeze(["pass", "fail", "unavailable", "not-run"]);
  const PROMPT_STATUS = Object.freeze(["available", "missing", "accepted", "dismissed", "installed"]);
  const BROWSER_FAMILIES = Object.freeze(["chrome", "edge", "samsung", "firefox", "opera", "unknown"]);

  const DEFINITIONS = Object.freeze({
    "KD-PWA-ANDROID-000": Object.freeze({ severity: "pass", message: "Installierbar oder bereits als App geöffnet.", nextAction: "Keine technische Korrektur nötig." }),
    "KD-PWA-ANDROID-010": Object.freeze({ severity: "error", message: "Kein sicherer HTTPS- oder localhost-Kontext.", nextAction: "Hosting oder aufgerufene URL korrigieren." }),
    "KD-PWA-ANDROID-020": Object.freeze({ severity: "error", message: "Manifest nicht erreichbar oder ungültig.", nextAction: "Manifest-Response, MIME-Typ, CSP und JSON prüfen." }),
    "KD-PWA-ANDROID-021": Object.freeze({ severity: "error", message: "Name, Start-URL, Scope oder Display des Manifests ist unbrauchbar.", nextAction: "Manifestfelder und aufgelöste Pfade korrigieren." }),
    "KD-PWA-ANDROID-022": Object.freeze({ severity: "error", message: "192- oder 512-Pixel-Icon fehlt oder ist nicht abrufbar.", nextAction: "Iconpfad und ausgeliefertes Asset prüfen." }),
    "KD-PWA-ANDROID-030": Object.freeze({ severity: "error", message: "Service Worker wird nicht unterstützt.", nextAction: "Einen unterstützten Android-Browser verwenden." }),
    "KD-PWA-ANDROID-031": Object.freeze({ severity: "error", message: "Service-Worker-Registrierung oder Aktivierung ist fehlgeschlagen.", nextAction: "Worker-URL, Scope, CSP und Aktivierungszustand prüfen." }),
    "KD-PWA-ANDROID-032": Object.freeze({ severity: "error", message: "Seite oder Start-URL liegt außerhalb des Service-Worker-Scopes.", nextAction: "Scope und Startpfad angleichen." }),
    "KD-PWA-ANDROID-033": Object.freeze({ severity: "error", message: "Der aktive Service Worker kontrolliert diese Seite noch nicht.", nextAction: "Kontrollierten Reload, Scope und claim/Activation prüfen." }),
    "KD-PWA-ANDROID-040": Object.freeze({ severity: "warning", message: "Alle App-Prüfungen sind grün, aber der Browser stellt keinen Installationsdialog bereit.", nextAction: "Installationszustand, Browsermenü, Berechtigung und Engagement prüfen; dies ist nicht automatisch ein Appfehler." }),
    "KD-PWA-ANDROID-041": Object.freeze({ severity: "warning", message: "Der native Installationsdialog wurde abgelehnt.", nextAction: "Erneut nur auf bewusste Nutzeraktion anbieten." }),
    "KD-PWA-ANDROID-042": Object.freeze({ severity: "warning", message: "Der Dialog wurde akzeptiert, aber Installation oder Standalone-Modus ist noch nicht belegt.", nextAction: "Homescreen und Browserzustand prüfen und den Bericht sichern." }),
    "KD-PWA-ANDROID-050": Object.freeze({ severity: "error", message: "Offline-App-Shell oder Start-URL ist nicht kontrolliert nutzbar.", nextAction: "Precache, Offline-Fallback und Cache-Header prüfen." }),
    "KD-PWA-ANDROID-060": Object.freeze({ severity: "error", message: "Cache- oder Storagefähigkeit ist lokal nicht verfügbar.", nextAction: "Browser- und Speicherzustand prüfen." }),
    "KD-PWA-ANDROID-090": Object.freeze({ severity: "error", message: "Ein sonstiger sanitizter Clientfehler ist aufgetreten.", nextAction: "Build und den gemeldeten Prüfschritt untersuchen." }),
  });

  const PRIORITY = Object.freeze([
    "KD-PWA-ANDROID-010", "KD-PWA-ANDROID-020", "KD-PWA-ANDROID-021",
    "KD-PWA-ANDROID-022", "KD-PWA-ANDROID-030", "KD-PWA-ANDROID-031",
    "KD-PWA-ANDROID-032", "KD-PWA-ANDROID-033", "KD-PWA-ANDROID-050",
    "KD-PWA-ANDROID-060", "KD-PWA-ANDROID-090", "KD-PWA-ANDROID-041",
    "KD-PWA-ANDROID-042", "KD-PWA-ANDROID-040", "KD-PWA-ANDROID-000",
  ]);

  function boundedText(value, form, max, fallback = "unknown") {
    const text = String(value == null ? "" : value).trim();
    return text && text.length <= max && form.test(text) ? text : fallback;
  }

  function safeBoolean(value) { return value === true; }
  function safeStatus(value) { return STATUS.includes(value) ? value : "not-run"; }
  function safePromptStatus(value) { return PROMPT_STATUS.includes(value) ? value : "missing"; }
  function safeMajor(value) {
    const major = Number(value);
    return Number.isInteger(major) && major >= 0 && major <= 999 ? major : null;
  }

  function safeIso(value) {
    const date = new Date(String(value || ""));
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  function safePage(value) {
    try {
      const url = new URL(String(value || ""));
      const origin = boundedText(url.origin, /^https?:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?$/, 160, "unknown");
      const path = boundedText(url.pathname || "/", /^\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]*$/, 240, "/");
      return Object.freeze({ origin, path });
    } catch { return Object.freeze({ origin: "unknown", path: "/" }); }
  }

  function browserSummary(userAgent) {
    const ua = String(userAgent || "");
    const candidates = [
      ["edge", /EdgA?\/(\d{1,3})/],
      ["opera", /(?:OPR|Opera)\/(\d{1,3})/],
      ["samsung", /SamsungBrowser\/(\d{1,3})/],
      ["firefox", /Firefox\/(\d{1,3})/],
      ["chrome", /(?:Chrome|CriOS)\/(\d{1,3})/],
    ];
    let family = "unknown";
    let major = null;
    for (const [name, pattern] of candidates) {
      const match = ua.match(pattern);
      if (match) { family = name; major = safeMajor(match[1]); break; }
    }
    const androidMajor = safeMajor(ua.match(/Android\s+(\d{1,3})/i)?.[1]);
    return Object.freeze({ family, major, androidMajor });
  }

  function finding(code) {
    const definition = DEFINITIONS[code] || DEFINITIONS["KD-PWA-ANDROID-090"];
    const safeCode = Object.prototype.hasOwnProperty.call(DEFINITIONS, code) ? code : "KD-PWA-ANDROID-090";
    return Object.freeze({ code: safeCode, ...definition });
  }

  function primaryCode(findings) {
    const codes = new Set((Array.isArray(findings) ? findings : []).map((item) => item?.code));
    return PRIORITY.find((code) => codes.has(code)) || "KD-PWA-ANDROID-090";
  }

  function sanitizeReport(input = {}) {
    const supplied = Array.isArray(input.findings) ? input.findings : [];
    const codes = [...new Set(supplied.map((item) => String(item?.code || ""))
      .filter((code) => Object.prototype.hasOwnProperty.call(DEFINITIONS, code)))].slice(0, 16);
    if (!codes.length) codes.push("KD-PWA-ANDROID-090");
    const findings = codes.map(finding);
    const browser = input.browser || {};
    const capabilities = input.capabilities || {};
    const checks = input.checks || {};
    const page = safePage(input.pageUrl || `${input.page?.origin || ""}${input.page?.path || ""}`);
    return Object.freeze({
      format: FORMAT,
      version: VERSION,
      createdAt: safeIso(input.createdAt),
      build: boundedText(input.build, /^(?:[a-f0-9]{7,64}|dev|local|unknown)$/i, 64),
      page,
      browser: Object.freeze({
        family: BROWSER_FAMILIES.includes(browser.family) ? browser.family : "unknown",
        major: safeMajor(browser.major),
        androidMajor: safeMajor(browser.androidMajor),
      }),
      capabilities: Object.freeze({
        secureContext: safeBoolean(capabilities.secureContext),
        manifest: safeBoolean(capabilities.manifest),
        serviceWorker: safeBoolean(capabilities.serviceWorker),
        caches: safeBoolean(capabilities.caches),
        storage: safeBoolean(capabilities.storage),
        prompt: safeBoolean(capabilities.prompt),
        standalone: safeBoolean(capabilities.standalone),
        appInstalled: safeBoolean(capabilities.appInstalled),
      }),
      checks: Object.freeze({
        secureContext: safeStatus(checks.secureContext),
        manifest: safeStatus(checks.manifest),
        icons: safeStatus(checks.icons),
        serviceWorker: safeStatus(checks.serviceWorker),
        scope: safeStatus(checks.scope),
        controller: safeStatus(checks.controller),
        offline: safeStatus(checks.offline),
        storage: safeStatus(checks.storage),
        promptStatus: safePromptStatus(checks.promptStatus),
      }),
      primaryCode: primaryCode(findings),
      findings: Object.freeze(findings),
    });
  }

  function manifestAssessment(manifest, manifestUrl, pageUrl) {
    const findings = [];
    const allowedDisplay = ["fullscreen", "standalone", "minimal-ui", "window-controls-overlay"];
    let startUrl = null;
    let scopeUrl = null;
    try {
      startUrl = new URL(String(manifest?.start_url || ""), manifestUrl);
      scopeUrl = new URL(String(manifest?.scope || ""), manifestUrl);
    } catch { /* finding below */ }
    const pageOrigin = new URL(pageUrl).origin;
    const identityOk = !!(String(manifest?.name || manifest?.short_name || "").trim())
      && !!startUrl && !!scopeUrl
      && startUrl.origin === pageOrigin && scopeUrl.origin === pageOrigin
      && startUrl.href.startsWith(scopeUrl.href)
      && allowedDisplay.includes(manifest?.display)
      && manifest?.prefer_related_applications !== true;
    if (!identityOk) findings.push("KD-PWA-ANDROID-021");
    const icons = Array.isArray(manifest?.icons) ? manifest.icons : [];
    const requiredIcons = [192, 512].map((size) => icons.find((icon) => (
      String(icon?.sizes || "").split(/\s+/).includes(`${size}x${size}`) && String(icon?.src || "").trim()
    )) || null);
    if (requiredIcons.some((icon) => !icon)) findings.push("KD-PWA-ANDROID-022");
    return Object.freeze({ ok: findings.length === 0, findings: Object.freeze(findings), startUrl, scopeUrl, requiredIcons: Object.freeze(requiredIcons) });
  }

  function timeout(promise, millis) {
    return Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => global.setTimeout(() => reject(new Error("timeout")), millis)),
    ]);
  }

  async function waitForController(serviceWorker, millis = 2500) {
    if (serviceWorker?.controller) return serviceWorker.controller;
    if (!serviceWorker?.addEventListener) return null;
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve(serviceWorker.controller || null);
      };
      serviceWorker.addEventListener("controllerchange", finish, { once: true });
      global.setTimeout(finish, millis);
    });
  }

  function isWithinScope(url, scope) {
    try {
      const target = new URL(url);
      const base = new URL(scope);
      return target.origin === base.origin && target.href.startsWith(base.href);
    } catch { return false; }
  }

  async function runDiagnostics(options = {}) {
    const windowObject = options.window || global.window || global;
    const navigatorObject = options.navigator || global.navigator || {};
    const locationObject = options.location || global.location || { href: "about:blank", origin: "null", pathname: "/" };
    const cacheStorage = options.caches || global.caches;
    const fetchFunction = options.fetch || global.fetch;
    const pageUrl = String(locationObject.href || "about:blank");
    const pageOrigin = String(locationObject.origin || "null");
    const manifestUrl = new URL(options.manifestUrl || "../manifest.webmanifest", pageUrl).href;
    const serviceWorkerUrl = new URL(options.serviceWorkerUrl || "../sw.js", pageUrl).href;
    const buildMetaUrl = new URL(options.buildMetaUrl || "../build-meta.json", pageUrl).href;
    const promptState = options.promptState || {};
    const findings = [];
    const add = (code) => { if (!findings.includes(code)) findings.push(code); };
    const checks = {
      secureContext: "not-run", manifest: "not-run", icons: "not-run", serviceWorker: "not-run",
      scope: "not-run", controller: "not-run", offline: "not-run", storage: "not-run",
      promptStatus: promptState.installed ? "installed" : promptState.available ? "available" : "missing",
    };
    const capabilities = {
      secureContext: options.isSecureContext === true || windowObject.isSecureContext === true,
      manifest: false,
      serviceWorker: "serviceWorker" in navigatorObject,
      caches: !!cacheStorage?.open,
      storage: !!navigatorObject.storage,
      prompt: promptState.available === true,
      standalone: promptState.standalone === true,
      appInstalled: promptState.installed === true,
    };
    let build = "unknown";
    let manifestInfo = null;

    const fetchLocal = async (url, init) => {
      const resolved = new URL(url, pageUrl);
      if (resolved.origin !== pageOrigin || typeof fetchFunction !== "function") throw new Error("local-fetch-unavailable");
      return fetchFunction(resolved.href, init);
    };

    checks.secureContext = capabilities.secureContext ? "pass" : "fail";
    if (!capabilities.secureContext) add("KD-PWA-ANDROID-010");

    try {
      const response = await timeout(fetchLocal(buildMetaUrl, { cache: "no-store" }), 4000);
      if (response?.ok) build = boundedText((await response.json())?.buildVersion, /^(?:[a-f0-9]{7,64}|dev|local)$/i, 64);
    } catch { /* Build bleibt explizit unknown. */ }

    try {
      const response = await timeout(fetchLocal(manifestUrl, { cache: "no-store" }), 5000);
      const contentType = String(response?.headers?.get?.("content-type") || "").toLowerCase();
      if (!response?.ok || !/(?:application\/(?:manifest\+json|json)|text\/json)/.test(contentType)) throw new Error("manifest-response-invalid");
      const manifest = await response.json();
      manifestInfo = manifestAssessment(manifest, manifestUrl, pageUrl);
      capabilities.manifest = true;
      checks.manifest = manifestInfo.findings.includes("KD-PWA-ANDROID-021") ? "fail" : "pass";
      manifestInfo.findings.forEach(add);
      if (!manifestInfo.requiredIcons.some((icon) => !icon)) {
        let iconsOk = true;
        for (const icon of manifestInfo.requiredIcons) {
          try {
            const iconUrl = new URL(icon.src, manifestUrl);
            if (iconUrl.origin !== pageOrigin || !(await timeout(fetchLocal(iconUrl.href, { cache: "reload" }), 5000))?.ok) iconsOk = false;
          } catch { iconsOk = false; }
        }
        checks.icons = iconsOk ? "pass" : "fail";
        if (!iconsOk) add("KD-PWA-ANDROID-022");
      } else checks.icons = "fail";
    } catch {
      checks.manifest = "fail";
      checks.icons = "unavailable";
      add("KD-PWA-ANDROID-020");
    }

    if (!capabilities.serviceWorker) {
      checks.serviceWorker = "unavailable";
      add("KD-PWA-ANDROID-030");
    } else {
      try {
        const registration = await timeout(navigatorObject.serviceWorker.register(serviceWorkerUrl, { scope: "../" }), 6000);
        const ready = await timeout(navigatorObject.serviceWorker.ready || registration, 7000);
        const activeRegistration = ready || registration;
        if (!activeRegistration?.active) throw new Error("service-worker-inactive");
        checks.serviceWorker = "pass";
        if (manifestInfo?.startUrl && manifestInfo?.scopeUrl) {
          const scope = String(activeRegistration.scope || "");
          const scopeOk = isWithinScope(pageUrl, scope)
            && isWithinScope(manifestInfo.startUrl.href, scope)
            && isWithinScope(manifestInfo.startUrl.href, manifestInfo.scopeUrl.href);
          checks.scope = scopeOk ? "pass" : "fail";
          if (!scopeOk) add("KD-PWA-ANDROID-032");
        } else checks.scope = "unavailable";
        const controller = await waitForController(navigatorObject.serviceWorker);
        checks.controller = controller ? "pass" : "fail";
        if (!controller) add("KD-PWA-ANDROID-033");
      } catch {
        checks.serviceWorker = "fail";
        add("KD-PWA-ANDROID-031");
      }
    }

    if (!capabilities.caches) {
      checks.storage = "unavailable";
      add("KD-PWA-ANDROID-060");
    } else {
      const probeCache = "kd-pwa-diagnose-v1";
      try {
        const cache = await cacheStorage.open(probeCache);
        const probeUrl = new URL("./pwa-storage-probe", pageUrl).href;
        await cache.put(probeUrl, new Response("ok", { headers: { "content-type": "text/plain" } }));
        const hit = await cache.match(probeUrl);
        await cacheStorage.delete(probeCache);
        checks.storage = hit?.ok ? "pass" : "fail";
        if (!hit?.ok) add("KD-PWA-ANDROID-060");
      } catch {
        try { await cacheStorage.delete(probeCache); } catch { /* best effort */ }
        checks.storage = "fail";
        add("KD-PWA-ANDROID-060");
      }
    }

    if (manifestInfo?.startUrl && checks.controller === "pass" && checks.scope === "pass") {
      try {
        const online = await timeout(fetchLocal(manifestInfo.startUrl.href, { cache: "reload" }), 6000);
        if (!online?.ok) throw new Error("online-shell-failed");
        const offline = await timeout(fetchLocal(manifestInfo.startUrl.href, {
          cache: "no-store",
          headers: { [OFFLINE_PROBE_HEADER]: "1" },
        }), 6000);
        checks.offline = offline?.ok ? "pass" : "fail";
        if (!offline?.ok) add("KD-PWA-ANDROID-050");
      } catch {
        checks.offline = "fail";
        add("KD-PWA-ANDROID-050");
      }
    } else checks.offline = "unavailable";

    const appChecksGreen = ["secureContext", "manifest", "icons", "serviceWorker", "scope", "controller", "offline", "storage"]
      .every((name) => checks[name] === "pass");
    if (appChecksGreen) {
      add(capabilities.prompt || capabilities.standalone || capabilities.appInstalled
        ? "KD-PWA-ANDROID-000" : "KD-PWA-ANDROID-040");
    }

    return sanitizeReport({
      createdAt: new Date().toISOString(), build, pageUrl,
      browser: browserSummary(navigatorObject.userAgent), capabilities, checks,
      findings: findings.map((code) => ({ code })),
    });
  }

  function withPromptOutcome(report, outcome) {
    const safe = sanitizeReport(report);
    const retained = safe.findings.filter((item) => ![
      "KD-PWA-ANDROID-000", "KD-PWA-ANDROID-040", "KD-PWA-ANDROID-041", "KD-PWA-ANDROID-042",
    ].includes(item.code));
    const code = outcome === "installed" ? "KD-PWA-ANDROID-000"
      : outcome === "accepted" ? "KD-PWA-ANDROID-042"
      : outcome === "dismissed" ? "KD-PWA-ANDROID-041"
      : "KD-PWA-ANDROID-040";
    return sanitizeReport({
      ...safe,
      pageUrl: `${safe.page.origin}${safe.page.path}`,
      capabilities: {
        ...safe.capabilities,
        standalone: outcome === "installed" || safe.capabilities.standalone,
        appInstalled: outcome === "installed" || safe.capabilities.appInstalled,
      },
      checks: { ...safe.checks, promptStatus: outcome === "installed" ? "installed" : outcome },
      findings: [...retained, { code }],
    });
  }

  global.KdPwaDiagnostics = Object.freeze({
    FORMAT, VERSION, OFFLINE_PROBE_HEADER, DEFINITIONS,
    browserSummary, finding, primaryCode, sanitizeReport, manifestAssessment,
    runDiagnostics, withPromptOutcome,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
