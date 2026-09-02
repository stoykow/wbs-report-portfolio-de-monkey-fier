// ==UserScript==
// @name          WBS Berichtsheft de-monkey-fier
// @namespace     https://github.com/stoykow/wbs-report-portfolio-de-monkey-fier
// @match         *://ecampus.wbstraining.de/*
// @run-at        document-end
// @version       2.4.0
// @description   Hilfen und optionale lokale KI-Unterstützung für WBS-Berichtshefte
// @icon          https://ecampus.wbstraining.de/Customizing/global/skin/wbs718skin/images/HeaderIconResponsive.svg
// @downloadURL   https://github.com/stoykow/wbs-report-portfolio-de-monkey-fier/raw/refs/heads/master/wbs-report-portfolio-de-monkey-fier.user.js
// @updateURL     https://github.com/stoykow/wbs-report-portfolio-de-monkey-fier/raw/refs/heads/master/wbs-report-portfolio-de-monkey-fier.user.js
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_xmlhttpRequest
// @connect       *
// ==/UserScript==

(() => {
    "use strict";

    ////////////////////////////// START config
    // Strings to look for in the portfolio (partial, case-insensitive):
    const commentPOIs = [
        "krank", "entschuldig", "abwesen", "anwesen", "arzt", "fehl",
        "attest", "urlaub", "ferien", "kontrolle"
    ];
    ////////////////////////////// END config

    const SCRIPT_NAME = "WBS Berichtsheft de-monkey-fier";
    const SCRIPT_VERSION = "2.4.0";
    const FEEDBACK_ENDPOINT = "https://llmfeedback.nik0.de/api/v1/feedback.php";
    const AI_SETTINGS_KEY = "wbsDeMonkeyFier.ai.settings.v1";
    const AI_SECRETS_KEY = "wbsDeMonkeyFier.ai.secrets.v1";
    const AI_SETTINGS_SCHEMA_VERSION = 5;
    const REASONING_VALUES = ["auto", "off", "on", "low", "medium", "high"];
    const REASONING_LABELS = {
        auto: "Automatisch",
        off: "Aus",
        on: "Ein",
        low: "Niedrig",
        medium: "Mittel",
        high: "Hoch"
    };
    const LM_STUDIO_NATIVE_MODELS_ENDPOINT = "/api/v1/models";
    const LM_STUDIO_NATIVE_CHAT_ENDPOINT = "/api/v1/chat";
    const DAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
    const DAY_ALIASES = [
        ["montag", "monday", "mo"], ["dienstag", "tuesday", "di"],
        ["mittwoch", "wednesday", "mi"], ["donnerstag", "thursday", "do"],
        ["freitag", "friday", "fr"], ["samstag", "saturday", "sa"],
        ["sonntag", "sunday", "so"]
    ];
    const LEGACY_DEFAULT_SYSTEM_PROMPT = `Du unterstützt einen Ausbilder bei der Prüfung von Ausbildungsberichtsheften.

Bewerte ausschließlich die bereitgestellten Inhalte. Erfinde keine Tätigkeiten, Technologien, Inhalte oder Zusammenhänge. Wenn eine Beschreibung nicht konkret genug ist, fordere eine genauere Beschreibung an und kennzeichne Unsicherheit ausdrücklich.

Prüfe insbesondere Konkretheit und Nachvollziehbarkeit der Tätigkeiten und Lerninhalte, reine Schlagwörter, Wiederholungen, Widersprüche, FPA-Einträge, Abwesenheiten, Stundenangaben und sinnvolle Rückfragen.

Gib keine automatische Annahme-, Ablehnungs- oder Rückgabeempfehlung. Formuliere Hinweise sachlich, kurz und konstruktiv. Liefere ausschließlich ein JSON-Objekt mit status (ok, warning oder critical), summary, issues und suggestedComment. Jedes issue darf day, type, original, message und suggestion enthalten.`;

    const PREVIOUS_DEFAULT_SYSTEM_PROMPT = `Du unterstützt einen Ausbilder bei der Prüfung von Ausbildungsberichtsheften.

Bewerte ausschließlich die bereitgestellten Inhalte. Erfinde keine Tätigkeiten, Technologien, Inhalte oder Zusammenhänge. Wenn eine Beschreibung nicht konkret genug ist, fordere eine genauere Beschreibung an und kennzeichne Unsicherheit ausdrücklich.

Prüfe insbesondere Konkretheit und Nachvollziehbarkeit der Tätigkeiten und Lerninhalte, wirklich unklare reine Schlagwörter, problematische Wiederholungen, Widersprüche, Abwesenheiten, Stundenangaben und sinnvolle Rückfragen.

Die Begriffe FPA, Prüfung, Test, Wiederholung und Vorbereitung sind für sich allein kein Mangel. Beanstande einen Eintrag mit diesen Begriffen nur, wenn die gesamte Beschreibung tatsächlich unklar oder widersprüchlich ist. Folgende Arten von Einträgen gelten als ausreichend konkret und dürfen nicht künstlich um zusätzliche Technologien, Werkzeuge, Methoden oder Ergebnisse erweitert werden: „FPA: Praktische Angriffsszenarien analysiert und TOMs abgeleitet.“, „Bausteinprüfung geschrieben“, „Testsimulation mit mehreren Multiple Choice Fragen.“

Die Berichtsnummer muss dreistellig sein. Melde eine ein- oder zweistellige Berichtsnummer ausschließlich unter formalIssues und nenne die mit führenden Nullen ergänzte Form, beispielsweise 14 als 014.

Der Abschnitt beziehungsweise das Modul muss im Bericht vollständig ausgeschrieben und eindeutig angegeben sein. Eine reine Abkürzung oder ein fehlender Modulname ist als formale Auffälligkeit unter formalIssues zu melden.

Gib keine automatische Annahme-, Ablehnungs- oder Rückgabeempfehlung. Formuliere Hinweise sachlich, kurz und konstruktiv. Liefere ausschließlich ein JSON-Objekt mit status (ok, warning oder critical), summary, formalIssues, contentIssues, hourIssues, notes und suggestedComment. Formale Auffälligkeiten, inhaltliche Auffälligkeiten und Stundenauffälligkeiten müssen in den jeweils passenden Arrays stehen. Neutrale Hinweise gehören ausschließlich in notes. Einträge dürfen day, type, original, message und suggestion enthalten.`;

    const PRE_MODULE_DEFAULT_SYSTEM_PROMPT = PREVIOUS_DEFAULT_SYSTEM_PROMPT.replace(`

Der Abschnitt beziehungsweise das Modul muss im Bericht vollständig ausgeschrieben und eindeutig angegeben sein. Eine reine Abkürzung oder ein fehlender Modulname ist als formale Auffälligkeit unter formalIssues zu melden.`, "");

    const DEFAULT_SYSTEM_PROMPT = PREVIOUS_DEFAULT_SYSTEM_PROMPT
        .replace(
            "Der Abschnitt beziehungsweise das Modul muss im Bericht vollständig ausgeschrieben und eindeutig angegeben sein. Eine reine Abkürzung oder ein fehlender Modulname ist als formale Auffälligkeit unter formalIssues zu melden.",
            "Das Feld „Abschnitt/Modul“ muss die vollständige und eindeutige Modulbezeichnung enthalten. Eine alleinstehende Abkürzung oder ein fehlender Modulname reicht nicht aus und ist ausschließlich unter formalIssues zu melden. Eine Abkürzung darf zusätzlich hinter der ausgeschriebenen Modulbezeichnung stehen."
        )
        .replace(
            "Gib keine automatische Annahme-, Ablehnungs- oder Rückgabeempfehlung. Formuliere Hinweise sachlich, kurz und konstruktiv. Liefere ausschließlich ein JSON-Objekt mit status (ok, warning oder critical), summary, formalIssues, contentIssues, hourIssues, notes und suggestedComment. Formale Auffälligkeiten, inhaltliche Auffälligkeiten und Stundenauffälligkeiten müssen in den jeweils passenden Arrays stehen. Neutrale Hinweise gehören ausschließlich in notes. Einträge dürfen day, type, original, message und suggestion enthalten.",
            `Gib keine automatische Annahme-, Ablehnungs- oder Rückgabeempfehlung. Formuliere alle Rückmeldungen an die teilnehmende Person sachlich, kurz und konsequent in direkter Du-Ansprache. Verwende dabei „du“, „dir“ und „dein“.

Setze status nur dann auf „ok“, wenn formalIssues, contentIssues und hourIssues vollständig leer sind. Neutrale Hinweise gehören ausschließlich in notes und zählen nicht als Auffälligkeit.

Melde jede Auffälligkeit nur einmal und ordne sie ausschließlich dem passendsten Array zu. Behaupte in summary niemals, es gebe keine Auffälligkeiten, wenn mindestens eines der drei Auffälligkeitsarrays einen Eintrag enthält.

suggestedComment enthält ausschließlich konkrete Korrekturen oder notwendige Rückfragen aus formalIssues, contentIssues und hourIssues. Nenne dort nichts, was bereits gut oder korrekt ist, übernimm keine neutralen notes und erzeuge keine allgemeine Zusammenfassung. Sind diese drei Arrays leer, bleibt suggestedComment leer. Ausnahme: Bei den Berichtsnummern 001 bis 005, auch wenn die führenden Nullen noch fehlen, darf suggestedComment zusätzlich genau einen kurzen ermutigenden Satz enthalten. Zähle dabei trotzdem keine positiven Einzelheiten auf.

Samstag und Sonntag dürfen leer bleiben und benötigen keine Tätigkeiten oder Stunden. Beanstande das Wochenende nur, wenn dort tatsächlich Tätigkeiten oder positive Stunden eingetragen sind.

Ein vollständig oder weitgehend leerer Bericht ist trotzdem auswertbar. Melde fehlende oder nicht ausreichende Tätigkeitsbeschreibungen passend unter contentIssues, ohne Inhalte zu erfinden.

Liefere ausschließlich ein JSON-Objekt mit status (ok, warning oder critical), summary, formalIssues, contentIssues, hourIssues, notes und suggestedComment. Formale Auffälligkeiten, inhaltliche Auffälligkeiten und Stundenauffälligkeiten müssen in den jeweils passenden Arrays stehen. Einträge dürfen day, type, original, message und suggestion enthalten. Antworte ohne Markdown und ohne zusätzlichen Text außerhalb des JSON-Objekts.`
        );

    const DEFAULT_PROFILE = Object.freeze({
        id: "lmstudio-main",
        name: "LM Studio",
        provider: "lm-studio",
        baseUrl: "https://llm.nik0.de",
        chatEndpoint: "/v1/chat/completions",
        modelsEndpoint: "/v1/models",
        model: "",
        manualModel: "",

        temperature: 0.2,
        maxTokens: 500,

        reasoning: "auto",
        reasoningMode: "auto",
        reasoningEffort: "medium",
        reasoningCapabilities: null,

        timeout: 900000,

        authType: "bearer",
        token: ""
    });

    function cloneDefaultProfile(id = DEFAULT_PROFILE.id, name = DEFAULT_PROFILE.name) {
        return { ...DEFAULT_PROFILE, id, name };
    }

    function defaultAiSettings() {
        return {
            schemaVersion: AI_SETTINGS_SCHEMA_VERSION,
            enabled: true,
            debug: false,
            activeProfileId: DEFAULT_PROFILE.id,
            profiles: [cloneDefaultProfile()],
            activeCourseId: "",
            courses: [],
            systemPrompt: DEFAULT_SYSTEM_PROMPT
        };
    }

    function normalizeCourse(course, fallbackIndex = 0) {
        const source = course && typeof course === "object" ? course : {};
        return {
            id: String(source.id || `course-${fallbackIndex + 1}`),
            name: String(source.name || `Kurs ${fallbackIndex + 1}`),
            startDate: normalizeDateValue(source.startDate)
        };
    }

    function normalizeProfile(profile, fallbackIndex = 0) {
        const source = profile && typeof profile === "object" ? profile : {};
        const fallbackId = fallbackIndex === 0 ? DEFAULT_PROFILE.id : `ai-profile-${fallbackIndex + 1}`;
        const numberInRange = (value, fallback, min, max) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
        };
        const legacyMode = ["auto", "off", "on"].includes(source.reasoningMode) ? source.reasoningMode : "auto";
        const legacyEffort = ["low", "medium", "high"].includes(source.reasoningEffort) ? source.reasoningEffort : "medium";
        const storedReasoning = REASONING_VALUES.includes(source.reasoning)
            ? source.reasoning
            : legacyMode === "auto" ? "auto" : legacyMode === "off" ? "off" : legacyEffort;
        const rawCapabilities = source.reasoningCapabilities && typeof source.reasoningCapabilities === "object" ? source.reasoningCapabilities : null;
        const allowedOptions = rawCapabilities && Array.isArray(rawCapabilities.allowedOptions)
            ? [...new Set(rawCapabilities.allowedOptions.filter(option => REASONING_VALUES.includes(option) && option !== "auto"))]
            : [];
        const normalizedCapabilities = rawCapabilities ? {
            model: String(rawCapabilities.model || ""),
            known: rawCapabilities.known === true,
            supported: rawCapabilities.supported === true && allowedOptions.length > 0,
            allowedOptions,
            default: REASONING_VALUES.includes(rawCapabilities.default) && rawCapabilities.default !== "auto" ? rawCapabilities.default : "",
            source: String(rawCapabilities.source || "")
        } : null;
        const normalizedReasoning = normalizedCapabilities && normalizedCapabilities.known && normalizedCapabilities.supported &&
            storedReasoning !== "auto" && !normalizedCapabilities.allowedOptions.includes(storedReasoning) ? "auto" : storedReasoning;
        return {
            ...cloneDefaultProfile(fallbackId, `KI-Profil ${fallbackIndex + 1}`),
            ...source,
            id: String(source.id || fallbackId),
            name: String(source.name || `KI-Profil ${fallbackIndex + 1}`),
            provider: ["lm-studio", "openai-compatible", "custom"].includes(source.provider) ? source.provider : "custom",
            baseUrl: String(source.baseUrl || DEFAULT_PROFILE.baseUrl).replace(/\/+$/, ""),
            chatEndpoint: String(source.chatEndpoint || DEFAULT_PROFILE.chatEndpoint),
            modelsEndpoint: String(source.modelsEndpoint || DEFAULT_PROFILE.modelsEndpoint),
            model: String(source.model || ""),
            manualModel: String(source.manualModel || ""),
            temperature: numberInRange(source.temperature, DEFAULT_PROFILE.temperature, 0, 2),
            maxTokens: numberInRange(source.maxTokens, DEFAULT_PROFILE.maxTokens, 1, 32768),
            reasoning: normalizedReasoning,
            reasoningMode: normalizedReasoning === "auto" || normalizedReasoning === "off" ? normalizedReasoning : "on",
            reasoningEffort: ["low", "medium", "high"].includes(normalizedReasoning) ? normalizedReasoning : legacyEffort,
            reasoningCapabilities: normalizedCapabilities,
            timeout: numberInRange(source.timeout, DEFAULT_PROFILE.timeout, 1000, 900000),
            authType: ["none", "bearer", "api-key"].includes(source.authType) ? source.authType : "none",
            token: typeof source.token === "string" ? source.token : ""
        };
    }

    function normalizeAiSettings(rawSettings, rawSecrets = {}) {
        const defaults = defaultAiSettings();
        const source = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
        const sourceSchemaVersion = Number(source.schemaVersion || 1);
        const shouldMigrateOneMinuteTimeout = sourceSchemaVersion < 2;
        const shouldMigrateFiveMinuteTimeout = sourceSchemaVersion < 4;
        const profiles = Array.isArray(source.profiles) && source.profiles.length
            ? source.profiles.map((profile, index) => normalizeProfile(
                (shouldMigrateOneMinuteTimeout && Number(profile && profile.timeout) === 60000) ||
                    (shouldMigrateFiveMinuteTimeout && Number(profile && profile.timeout) === 300000)
                    ? { ...profile, timeout: DEFAULT_PROFILE.timeout }
                    : profile,
                index
            ))
            : defaults.profiles;
        const secrets = rawSecrets && typeof rawSecrets === "object" ? rawSecrets : {};
        profiles.forEach(profile => {
            profile.token = typeof secrets[profile.id] === "string" ? secrets[profile.id] : profile.token;
        });
        const activeProfileId = profiles.some(profile => profile.id === source.activeProfileId)
            ? source.activeProfileId
            : profiles[0].id;
        const courses = Array.isArray(source.courses) ? source.courses.map(normalizeCourse) : [];
        const activeCourseId = courses.some(course => course.id === source.activeCourseId)
            ? source.activeCourseId
            : courses[0] && courses[0].id || "";
        const storedSystemPrompt = typeof source.systemPrompt === "string" ? source.systemPrompt : "";
        const knownPreviousDefaultPrompts = [LEGACY_DEFAULT_SYSTEM_PROMPT, PRE_MODULE_DEFAULT_SYSTEM_PROMPT, PREVIOUS_DEFAULT_SYSTEM_PROMPT];
        return {
            schemaVersion: AI_SETTINGS_SCHEMA_VERSION,
            enabled: source.enabled !== false,
            debug: source.debug === true,
            activeProfileId,
            profiles,
            activeCourseId,
            courses,
            systemPrompt: storedSystemPrompt.trim() && !knownPreviousDefaultPrompts.includes(storedSystemPrompt)
                ? storedSystemPrompt
                : DEFAULT_SYSTEM_PROMPT
        };
    }

    function safeGetValue(key, fallback) {
        try {
            return typeof GM_getValue === "function" ? GM_getValue(key, fallback) : fallback;
        } catch (_error) {
            return fallback;
        }
    }

    function safeSetValue(key, value) {
        if (typeof GM_setValue !== "function") throw new Error("Der Userscript-Speicher ist nicht verfügbar.");
        GM_setValue(key, value);
    }

    function loadAiConfig() {
        const storedSettings = safeGetValue(AI_SETTINGS_KEY, defaultAiSettings());
        const normalized = normalizeAiSettings(storedSettings, safeGetValue(AI_SECRETS_KEY, {}));
        if (Number(storedSettings && storedSettings.schemaVersion || 1) < AI_SETTINGS_SCHEMA_VERSION && typeof GM_setValue === "function") {
            saveAiConfig(normalized);
        }
        return normalized;
    }

    function saveAiConfig(settings) {
        const normalized = normalizeAiSettings(settings);
        const secrets = {};
        const publicSettings = {
            ...normalized,
            profiles: normalized.profiles.map(profile => {
                if (profile.token) secrets[profile.id] = profile.token;
                const { token: _token, ...publicProfile } = profile;
                return publicProfile;
            })
        };
        safeSetValue(AI_SETTINGS_KEY, publicSettings);
        safeSetValue(AI_SECRETS_KEY, secrets);
        return normalized;
    }

    function getAiProfiles(settings = loadAiConfig()) {
        return settings.profiles;
    }

    function saveAiProfiles(profiles, settings = loadAiConfig()) {
        return saveAiConfig({ ...settings, profiles });
    }

    function getActiveAiProfile(settings = loadAiConfig()) {
        return settings.profiles.find(profile => profile.id === settings.activeProfileId) || settings.profiles[0];
    }

    function getActiveCourse(settings = loadAiConfig()) {
        return settings.courses.find(course => course.id === settings.activeCourseId) || null;
    }

    function selectedModel(profile) {
        return String(profile.manualModel || profile.model || "").trim();
    }

    function joinUrl(baseUrl, endpoint) {
        const base = String(baseUrl || "").trim().replace(/\/+$/, "");
        const path = String(endpoint || "").trim();
        if (!base) throw new Error("Es ist kein KI-Server konfiguriert.");
        try {
            const parsedBase = new URL(base);
            if (!/^https?:$/.test(parsedBase.protocol)) throw new Error();
        } catch (_error) {
            throw new Error("Die KI-Serveradresse ist ungültig. Erlaubt sind HTTP und HTTPS.");
        }
        if (!path) return base;
        return `${base}/${path.replace(/^\/+/, "")}`;
    }

    function buildAuthHeaders(profile) {
        const token = String(profile.token || "").trim();
        if (profile.authType === "none") return {};
        if (!token) throw new Error("Authentifizierung ist aktiviert, aber es wurde kein Token hinterlegt.");
        if (profile.authType === "api-key") return { "X-API-Key": token };
        return { Authorization: `Bearer ${token}` };
    }

    function debugLog(settings, message, details) {
        if (!settings || !settings.debug) return;
        // Ausschließlich technische Metadaten übergeben, nie Berichtsinhalte oder Secrets.
        if (details === undefined) console.debug(`[${SCRIPT_NAME}] ${message}`);
        else console.debug(`[${SCRIPT_NAME}] ${message}`, details);
    }

    function gmRequest(options) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== "function") {
                reject(new Error("GM_xmlhttpRequest ist nicht verfügbar. Bitte die Userscript-Berechtigungen prüfen."));
                return;
            }
            const { errorMessage, timeoutMessage, abortMessage, ...requestOptions } = options;
            GM_xmlhttpRequest({
                ...requestOptions,
                onload: response => resolve(response),
                onerror: () => reject(new Error(errorMessage || "Der KI-Server ist nicht erreichbar.")),
                ontimeout: () => reject(new Error(timeoutMessage || `Der Browser hat die KI-Anfrage nach ${Math.round(Number(options.timeout || 0) / 60000)} Minuten abgebrochen. Bitte den Timeout erhöhen oder die Modell-/Serverleistung prüfen.`)),
                onabort: () => reject(new Error(abortMessage || "Die Anfrage an den KI-Server wurde abgebrochen."))
            });
        });
    }

    function classifyHttpError(status) {
        if (status === 401 || status === 403) return new Error("Authentifizierung fehlgeschlagen.");
        if (status === 404 || status === 405) return new Error("API-Endpunkt nicht unterstützt.");
        if (status === 408 || status === 504) return new Error(`Der KI-Server oder ein vorgeschalteter Proxy hat die Anfrage mit HTTP ${status} wegen eines serverseitigen Zeitlimits abgebrochen. Ein höherer Browser-Timeout allein behebt das nicht.`);
        if (status >= 400) return new Error(`KI-Server antwortet mit HTTP ${status}.`);
        return null;
    }

    function parseModelsResponse(responseText) {
        let parsed;
        try {
            parsed = JSON.parse(responseText);
        } catch (_error) {
            throw new Error("Der Models-Endpunkt hat kein gültiges JSON geliefert.");
        }
        const candidates = Array.isArray(parsed)
            ? parsed
            : parsed && Array.isArray(parsed.data)
                ? parsed.data
                : parsed && Array.isArray(parsed.models)
                    ? parsed.models
                    : null;
        if (!candidates) throw new Error("API-Endpunkt nicht unterstützt: keine Modellliste gefunden.");
        return [...new Set(candidates.map(item => {
            if (typeof item === "string") return item;
            if (item && typeof item === "object") return item.id || item.name || item.model;
            return "";
        }).filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b));
    }

    function normalizeReasoningCapabilities(raw, model = "", source = "") {
        const capabilities = raw && typeof raw === "object" ? raw : {};
        const reasoning = capabilities.reasoning && typeof capabilities.reasoning === "object" ? capabilities.reasoning : capabilities;
        const rawAllowed = reasoning.allowed_options || reasoning.allowedOptions || [];
        const allowedOptions = Array.isArray(rawAllowed)
            ? [...new Set(rawAllowed.map(option => String(option).toLowerCase()).filter(option => REASONING_VALUES.includes(option) && option !== "auto"))]
            : [];
        const defaultValue = String(reasoning.default || reasoning.default_option || "").toLowerCase();
        return {
            model: String(model || ""),
            known: true,
            supported: allowedOptions.length > 0,
            allowedOptions,
            default: allowedOptions.includes(defaultValue) ? defaultValue : "",
            source: String(source || "lm-studio-native")
        };
    }

    function parseLmStudioModelsResponse(responseText) {
        let parsed;
        try {
            parsed = JSON.parse(responseText);
        } catch (_error) {
            throw new Error("Der native LM-Studio-Models-Endpunkt hat kein gültiges JSON geliefert.");
        }
        const candidates = Array.isArray(parsed)
            ? parsed
            : parsed && Array.isArray(parsed.models)
                ? parsed.models
                : parsed && Array.isArray(parsed.data)
                    ? parsed.data
                    : null;
        if (!candidates) throw new Error("Der native LM-Studio-Models-Endpunkt liefert keine Modellliste.");
        return candidates.map(item => {
            const model = item && typeof item === "object" ? String(item.key || item.id || item.model || item.name || "") : String(item || "");
            const capabilities = item && typeof item === "object" ? normalizeReasoningCapabilities(item.capabilities || {}, model) : normalizeReasoningCapabilities({}, model);
            return {
                id: model,
                name: item && typeof item === "object" ? String(item.display_name || item.name || model) : model,
                capabilities
            };
        }).filter(item => item.id);
    }

    async function getLmStudioModels(profile, settings = loadAiConfig()) {
        const response = await gmRequest({
            method: "GET",
            url: joinUrl(profile.baseUrl, LM_STUDIO_NATIVE_MODELS_ENDPOINT),
            headers: { Accept: "application/json", ...buildAuthHeaders(profile) },
            timeout: profile.timeout
        });
        const httpError = classifyHttpError(response.status);
        if (httpError) throw httpError;
        const models = parseLmStudioModelsResponse(response.responseText || "");
        debugLog(settings, "LM Studio native models response", { status: response.status, count: models.length });
        return models;
    }

    async function getAvailableModels(profile, settings = loadAiConfig()) {
        debugLog(settings, "AI models request started");
        const response = await gmRequest({
            method: "GET",
            url: joinUrl(profile.baseUrl, profile.modelsEndpoint),
            headers: { Accept: "application/json", ...buildAuthHeaders(profile) },
            timeout: profile.timeout
        });
        debugLog(settings, "AI models response", { status: response.status });
        const httpError = classifyHttpError(response.status);
        if (httpError) throw httpError;
        return parseModelsResponse(response.responseText || "");
    }

    async function getModelsForProfile(profile, settings = loadAiConfig()) {
        if (profile && profile.provider === "lm-studio") {
            try {
                const details = await getLmStudioModels(profile, settings);
                return { details, models: details.map(item => item.id), native: true };
            } catch (error) {
                debugLog(settings, "LM Studio native models unavailable; using OpenAI-compatible fallback", { message: error.message });
                const models = await getAvailableModels(profile, settings);
                return { details: [], models, native: false, capabilityError: error instanceof Error ? error.message : String(error) };
            }
        }
        const models = await getAvailableModels(profile, settings);
        return { details: [], models, native: false };
    }

    async function testAiConnection(profile, settings = loadAiConfig()) {
        try {
            const result = await getModelsForProfile(profile, settings);
            const models = result.models;
            if (!models.length) return { ok: true, level: "warning", message: "🟡 Server erreichbar, aber kein Modell verfügbar", models, details: result.details };
            return { ok: true, level: "ok", message: "🟢 KI-Server verbunden", models, details: result.details };
        } catch (error) {
            const knownMessage = error instanceof Error ? error.message : "Unbekannter Verbindungsfehler.";
            return { ok: false, level: "error", message: `🔴 ${knownMessage}`, models: [], details: [] };
        }
    }

    function cssEscape(value) {
        if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
        return String(value).replace(/["\\]/g, "\\$&");
    }

    function associatedText(input) {
        const parts = [input.id, input.name, input.getAttribute && input.getAttribute("aria-label")];
        if (typeof document !== "undefined" && input.id) {
            const label = document.querySelector(`label[for="${cssEscape(input.id)}"]`);
            if (label) parts.push(label.textContent);
        }
        const group = input.closest && input.closest(".form-group, .ilFormProperty, tr, fieldset");
        if (group) parts.push(group.textContent);
        return parts.filter(Boolean).join(" ").toLowerCase();
    }

    function detectDayIndex(input) {
        const haystack = associatedText(input);
        let bestMatch = { dayIndex: -1, textIndex: Number.POSITIVE_INFINITY };
        DAY_ALIASES.forEach((aliases, dayIndex) => {
            aliases.forEach(alias => {
                const match = new RegExp(`(^|[^a-zäöü])${alias}([^a-zäöü]|$)`, "i").exec(haystack);
                if (match && match.index < bestMatch.textIndex) bestMatch = { dayIndex, textIndex: match.index };
            });
        });
        return bestMatch.dayIndex;
    }

    function parseHours(value) {
        const normalized = String(value ?? "").trim().replace(",", ".");
        if (!normalized) return null;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function parseDateValue(value) {
        const text = String(value || "").trim();
        let year; let month; let day;
        let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
        if (match) [, year, month, day] = match;
        else {
            match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
            if (!match) return null;
            [, day, month, year] = match;
        }
        const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
        if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
        return date;
    }

    function toIsoDate(date) {
        return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
    }

    function formatGermanDate(value) {
        const date = parseDateValue(value);
        return date ? `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.${date.getUTCFullYear()}` : String(value || "");
    }

    function normalizeDateValue(value) {
        return toIsoDate(parseDateValue(value));
    }

    function addUtcDays(date, days) {
        const result = new Date(date.getTime());
        result.setUTCDate(result.getUTCDate() + days);
        return result;
    }

    function startOfIsoWeek(value) {
        const date = value instanceof Date ? new Date(value.getTime()) : parseDateValue(value);
        if (!date) return null;
        const weekday = date.getUTCDay() || 7;
        return addUtcDays(date, 1 - weekday);
    }

    function calculateCourseWeek(courseStart, reportStart) {
        const courseWeek = startOfIsoWeek(courseStart);
        const reportWeek = startOfIsoWeek(reportStart);
        if (!courseWeek || !reportWeek || reportWeek < courseWeek) return null;
        return Math.floor((reportWeek - courseWeek) / 604800000) + 1;
    }

    function formatExpectedReportNumber(courseStart, reportStart) {
        const week = calculateCourseWeek(courseStart, reportStart);
        return week === null ? "" : String(week).padStart(3, "0");
    }

    function easterSunday(year) {
        const a = year % 19;
        const b = Math.floor(year / 100);
        const c = year % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = (h + l - 7 * m + 114) % 31 + 1;
        return new Date(Date.UTC(year, month - 1, day));
    }

    function repentanceDay(year) {
        const date = new Date(Date.UTC(year, 10, 22));
        while (date.getUTCDay() !== 3) date.setUTCDate(date.getUTCDate() - 1);
        return date;
    }

    function getGermanHolidays(year) {
        const numericYear = Number(year);
        if (!Number.isInteger(numericYear) || numericYear < 2000 || numericYear > 2100) return [];
        const easter = easterSunday(numericYear);
        const holidays = [];
        const addFixed = (month, day, name, scope) => holidays.push({ date: toIsoDate(new Date(Date.UTC(numericYear, month - 1, day))), name, scope });
        const addMovable = (offset, name, scope) => holidays.push({ date: toIsoDate(addUtcDays(easter, offset)), name, scope });

        addFixed(1, 1, "Neujahr", "bundesweit");
        addFixed(1, 6, "Heilige Drei Könige", "Baden-Württemberg, Bayern, Sachsen-Anhalt");
        if (numericYear >= 2023) addFixed(3, 8, "Internationaler Frauentag", "Berlin, Mecklenburg-Vorpommern");
        else if (numericYear >= 2019) addFixed(3, 8, "Internationaler Frauentag", "Berlin");
        addMovable(-2, "Karfreitag", "bundesweit");
        addMovable(0, "Ostersonntag", "Brandenburg");
        addMovable(1, "Ostermontag", "bundesweit");
        addFixed(5, 1, "Tag der Arbeit", "bundesweit");
        addMovable(39, "Christi Himmelfahrt", "bundesweit");
        addMovable(49, "Pfingstsonntag", "Brandenburg");
        addMovable(50, "Pfingstmontag", "bundesweit");
        addMovable(60, "Fronleichnam", "BW, BY, HE, NW, RP, SL sowie örtlich in SN und TH");
        addFixed(8, 8, "Augsburger Friedensfest", "Stadt Augsburg");
        addFixed(8, 15, "Mariä Himmelfahrt", "Saarland sowie örtlich in Bayern");
        if (numericYear >= 2019) addFixed(9, 20, "Weltkindertag", "Thüringen");
        addFixed(10, 3, "Tag der Deutschen Einheit", "bundesweit");
        addFixed(10, 31, "Reformationstag", numericYear >= 2018 ? "BB, HB, HH, MV, NI, SN, ST, SH, TH" : "BB, MV, SN, ST, TH");
        addFixed(11, 1, "Allerheiligen", "BW, BY, NW, RP, SL");
        holidays.push({ date: toIsoDate(repentanceDay(numericYear)), name: "Buß- und Bettag", scope: "Sachsen" });
        addFixed(12, 25, "1. Weihnachtsfeiertag", "bundesweit");
        addFixed(12, 26, "2. Weihnachtsfeiertag", "bundesweit");
        if (numericYear === 2020) addFixed(5, 8, "75. Jahrestag der Befreiung vom Nationalsozialismus", "Berlin, einmalig 2020");
        if (numericYear === 2025) addFixed(5, 8, "80. Jahrestag der Befreiung vom Nationalsozialismus", "Berlin, einmalig 2025");
        if (numericYear === 2028) addFixed(6, 17, "75. Jahrestag des Volksaufstands vom 17. Juni 1953", "Berlin, einmalig 2028");
        return holidays.sort((left, right) => left.date.localeCompare(right.date));
    }

    function getHolidaysInRange(startValue, endValue) {
        const start = parseDateValue(startValue);
        const end = parseDateValue(endValue || startValue);
        if (!start || !end || end < start) return [];
        const holidays = [];
        for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year++) holidays.push(...getGermanHolidays(year));
        const startKey = toIsoDate(start);
        const endKey = toIsoDate(end);
        return holidays.filter(holiday => holiday.date >= startKey && holiday.date <= endKey);
    }

    function extractReportPeriod(root) {
        const candidates = [...root.querySelectorAll("input")].map((input, index) => {
            const label = input.id ? root.querySelector(`label[for="${cssEscape(input.id)}"]`) : null;
            const descriptor = [input.id, input.name, input.getAttribute && input.getAttribute("aria-label"), label && label.textContent]
                .filter(Boolean).join(" ").toLocaleLowerCase("de-DE");
            const looksLikeDateField = input.type === "date" || /(date|datum|zeitraum|von|bis|start|beginn|ende|from|to)/i.test(descriptor);
            const date = looksLikeDateField ? normalizeDateValue(input.value) : "";
            if (!date) return null;
            return { date, descriptor, index };
        }).filter(Boolean);
        const startPattern = /(^|[^a-z])(von|start|beginn|from|date[_ -]?from|period[_ -]?start)([^a-z]|$)/i;
        const endPattern = /(^|[^a-z])(bis|ende|end|to|date[_ -]?to|period[_ -]?end)([^a-z]|$)/i;
        const startCandidate = candidates.find(candidate => startPattern.test(candidate.descriptor)) || candidates[0];
        const endCandidate = candidates.find(candidate => endPattern.test(candidate.descriptor)) || candidates.find(candidate => candidate !== startCandidate);
        return { periodStart: startCandidate && startCandidate.date || "", periodEnd: endCandidate && endCandidate.date || "" };
    }

    function extractReportData(root = document) {
        const weekNumberInput = root.querySelector('input[aria-label="Berichtsnummer"], #number');
        const totalHoursInput = root.querySelector("#total_hours");
        const hourInputs = [...root.querySelectorAll('input[aria-label="Stunden / UE"]')];
        const entryInputs = [...root.querySelectorAll('input[name*="_text"], textarea[name*="_text"]')]
            .filter(input => input.id !== "remarks" && input.name !== "remarks");
        const dayCount = Math.max(hourInputs.length, 5);
        const days = Array.from({ length: Math.min(Math.max(dayCount, 5), 7) }, (_unused, index) => ({
            weekday: DAY_NAMES[index] || `Tag ${index + 1}`, hours: null, entries: []
        }));

        hourInputs.slice(0, 7).forEach((input, index) => {
            const detected = detectDayIndex(input);
            const targetIndex = detected >= 0 ? detected : index;
            if (!days[targetIndex]) days[targetIndex] = { weekday: DAY_NAMES[targetIndex] || `Tag ${targetIndex + 1}`, hours: null, entries: [] };
            days[targetIndex].hours = parseHours(input.value);
        });

        const entriesPerDay = hourInputs.length ? Math.ceil(entryInputs.length / Math.min(hourInputs.length, 7)) : 1;
        entryInputs.forEach((input, index) => {
            const text = String(input.value || "").trim();
            if (!text) return;
            const detected = detectDayIndex(input);
            const fallbackIndex = Math.min(Math.floor(index / Math.max(entriesPerDay, 1)), days.length - 1);
            const targetIndex = detected >= 0 ? detected : fallbackIndex;
            if (days[targetIndex]) days[targetIndex].entries.push(text);
        });

        const result = {};
        const reportNumber = String(weekNumberInput && weekNumberInput.value || "").trim();
        const totalHours = parseHours(totalHoursInput && totalHoursInput.value);
        const moduleField = [...root.querySelectorAll("input, textarea, select")].find(input => {
            if (input === weekNumberInput || input === totalHoursInput || entryInputs.includes(input) || hourInputs.includes(input)) return false;
            const label = input.id ? root.querySelector(`label[for="${cssEscape(input.id)}"]`) : null;
            const descriptor = [input.id, input.name, input.getAttribute && input.getAttribute("aria-label"), label && label.textContent]
                .filter(Boolean).join(" ").toLocaleLowerCase("de-DE");
            return /(abschnitt|modul)/i.test(descriptor);
        });
        const moduleName = String(moduleField && moduleField.value || "").trim();
        if (reportNumber) result.reportNumber = reportNumber;
        if (moduleName) result.module = moduleName;
        if (totalHours !== null) result.totalHours = totalHours;
        result.days = days.filter((day, index) => {
            const hasEntries = day.entries.length > 0;
            const hasPositiveWeekendHours = index >= 5 && typeof day.hours === "number" && day.hours !== 0;
            const isWeekdayWithHoursField = index < 5 && day.hours !== null;
            return hasEntries || hasPositiveWeekendHours || isWeekdayWithHoursField;
        });
        const period = extractReportPeriod(root);
        if (period.periodStart) {
            result.periodStart = period.periodStart;
            const weekStart = startOfIsoWeek(period.periodStart);
            result.days.forEach(day => {
                const dayIndex = DAY_NAMES.indexOf(day.weekday);
                if (weekStart && dayIndex >= 0) day.date = toIsoDate(addUtcDays(weekStart, dayIndex));
            });
            const effectiveEnd = period.periodEnd || toIsoDate(addUtcDays(parseDateValue(period.periodStart), 6));
            if (period.periodEnd) result.periodEnd = period.periodEnd;
            const holidays = getHolidaysInRange(period.periodStart, effectiveEnd);
            if (holidays.length) {
                result.holidays = holidays;
                result.holidayPolicy = "Alle aufgeführten gesetzlichen Feiertage gelten für diese Prüfung unabhängig von ihrem regionalen Geltungsbereich als schulungsfrei.";
                result.days.forEach(day => {
                    const holiday = holidays.find(item => item.date === day.date);
                    if (holiday) day.holiday = { name: holiday.name, scope: holiday.scope };
                });
            }
        }
        return result;
    }

    function normalizedEntry(text) {
        return String(text || "").toLocaleLowerCase("de-DE").replace(/[^a-z0-9äöüß]+/g, " ").trim();
    }

    function reportNumberMessage(reportNumber) {
        const value = String(reportNumber || "").trim();
        if (/^\d{1,2}$/.test(value)) return `Bitte die Berichtsnummer dreistellig als ${value.padStart(3, "0")} eintragen.`;
        return "Bitte die Berichtsnummer dreistellig eintragen.";
    }

    function validateReport(report, poiWords = commentPOIs, course = null) {
        const source = report && typeof report === "object" ? report : {};
        const issues = [];
        const entryOccurrences = new Map();
        const addIssue = (day, type, message, original = "") => issues.push({ day, type, message, original });
        const days = Array.isArray(source.days) ? source.days : [];

        days.forEach((day, dayIndex) => {
            const entries = Array.isArray(day.entries) ? day.entries.filter(text => String(text).trim()) : [];
            const hours = typeof day.hours === "number" ? day.hours : null;
            const weekday = day.weekday || DAY_NAMES[dayIndex] || `Tag ${dayIndex + 1}`;
            const holidayName = normalizedEntry(day.holiday && day.holiday.name);
            const isKnownHolidayEntry = Boolean(holidayName) && entries.length > 0 && entries.every(entry => {
                const normalized = normalizedEntry(entry);
                return normalized.includes("feiertag") || normalized.includes(holidayName);
            });
            if (hours > 0 && entries.length === 0) addIssue(weekday, "hours_without_entries", "Stunden sind eingetragen, aber Tätigkeitsbeschreibungen fehlen.");
            if (hours === 0 && entries.length > 0 && !isKnownHolidayEntry) addIssue(weekday, "entries_without_hours", "Tätigkeiten sind vorhanden, obwohl 0 Stunden eingetragen sind.");
            if (hours !== null && (hours < 0 || hours > 12 || (hours !== 0 && hours !== 8 && hours !== 10))) addIssue(weekday, "unusual_hours", `Der Stundenwert ${hours} ist ungewöhnlich.`, String(hours));
            const isWeekend = ["samstag", "sonntag"].some(dayName => weekday.toLocaleLowerCase("de-DE").includes(dayName)) || dayIndex >= 5;
            if (isWeekend && (hours > 0 || entries.length > 0)) addIssue(weekday, "weekend_entry", "Am Wochenende sind Tätigkeiten oder Stunden eingetragen.");

            entries.forEach(entry => {
                const normalized = normalizedEntry(entry);
                if (normalized.length < 15 && !isKnownHolidayEntry) addIssue(weekday, "too_short", "Die Tätigkeitsbeschreibung ist sehr kurz und möglicherweise zu allgemein.", entry);
                if (!entryOccurrences.has(normalized)) entryOccurrences.set(normalized, []);
                entryOccurrences.get(normalized).push({ weekday, entry });
                const matchedPois = poiWords.filter(word => normalized.includes(normalizedEntry(word)));
                if (matchedPois.length) addIssue(weekday, "keyword", `Auffälliges Schlagwort: ${matchedPois.join(", ")}.`, entry);
                const isAbsence = ["krank", "entschuldig", "abwesen", "arzt", "attest", "urlaub", "ferien", "feiertag", "fehl"].some(word => normalized.includes(word));
                if (isAbsence && hours > 0) addIssue(weekday, "absence_with_hours", "Eine Abwesenheit ist zusammen mit positiven Stunden eingetragen.", entry);
            });
        });

        entryOccurrences.forEach(occurrences => {
            if (occurrences.length < 2 || !occurrences[0].entry) return;
            const affectedDays = [...new Set(occurrences.map(item => item.weekday))].join(", ");
            addIssue(affectedDays, occurrences.length >= 3 ? "frequent_duplicate" : "duplicate", `Identische Tätigkeit ${occurrences.length}-mal verwendet.`, occurrences[0].entry);
        });

        const summedHours = days.reduce((sum, day) => sum + (typeof day.hours === "number" ? day.hours : 0), 0);
        if (typeof source.totalHours === "number" && Math.abs(summedHours - source.totalHours) > 0.001) addIssue("Gesamt", "inconsistent_total", `Die Summe der Tagesstunden (${summedHours}) stimmt nicht mit den Gesamtstunden (${source.totalHours}) überein.`);
        if (source.reportNumber && !/^\d{3}$/.test(String(source.reportNumber))) addIssue("Berichtsnummer", "invalid_report_number", reportNumberMessage(source.reportNumber), String(source.reportNumber));
        const expectedReportNumber = course && course.startDate && source.periodStart
            ? formatExpectedReportNumber(course.startDate, source.periodStart)
            : "";
        if (expectedReportNumber && /^\d+$/.test(String(source.reportNumber || "")) && Number(source.reportNumber) !== Number(expectedReportNumber)) {
            addIssue("Berichtsnummer", "unexpected_report_number", `Für die Berichtswoche wird anhand des Kursstarts die Berichtsnummer ${expectedReportNumber} erwartet. Bitte die Nummerierung prüfen.`, String(source.reportNumber));
        }
        if (!days.length || !days.some(day => (day.entries && day.entries.length) || (typeof day.hours === "number" && day.hours !== 0))) addIssue("Bericht", "empty_report", "Das Berichtsheft enthält keine auswertbaren Tätigkeiten oder Stunden.");
        return issues;
    }

    function getSelectedReasoning(profile) {
        if (REASONING_VALUES.includes(profile && profile.reasoning) && profile.reasoning !== "auto") return profile.reasoning;
        const mode = ["auto", "off", "on"].includes(profile && profile.reasoningMode) ? profile.reasoningMode : "auto";
        const effort = ["low", "medium", "high"].includes(profile && profile.reasoningEffort) ? profile.reasoningEffort : "medium";
        if (mode !== "auto") return mode === "off" ? "off" : effort;
        return REASONING_VALUES.includes(profile && profile.reasoning) ? profile.reasoning : "auto";
    }

    function isLegacyOpenAiReasoningModel(profile) {
        if (!profile || profile.provider !== "openai-compatible") return false;
        return /(^|[/:_-])(o1(?:-mini|-preview|$)|o3(?:-mini|-pro|$)|o4(?:-mini|$)|gpt-5(?:\.\d+)?(?:-[a-z0-9.-]+)?)(?:$|[/:_-])/i.test(selectedModel(profile));
    }

    function getReasoningRequestParameters(profile) {
        const selected = getSelectedReasoning(profile);
        const hasCapabilities = profile && profile.reasoningCapabilities && profile.reasoningCapabilities.known;
        const capabilities = hasCapabilities
            ? normalizeReasoningCapabilities(profile.reasoningCapabilities, selectedModel(profile), profile.reasoningCapabilities.source)
            : null;
        if (selected === "auto") return {};
        if (!hasCapabilities && isLegacyOpenAiReasoningModel(profile)) {
            if (selected === "off") return /^gpt-5\.1(?:$|[-/:])/i.test(selectedModel(profile)) ? { reasoning_effort: "none" } : {};
            return { reasoning_effort: selected };
        }
        if (!capabilities || !capabilities.allowedOptions.includes(selected)) return {};
        const parameter = profile.reasoningParameter;
        if (parameter === "reasoning_effort" && ["off", "low", "medium", "high"].includes(selected)) {
            return { reasoning_effort: selected === "off" ? "none" : selected };
        }
        return {};
    }

    function buildAiSystemPrompt(settings = loadAiConfig(), profile = null) {
        const prompt = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
        if (profile && profile.provider === "lm-studio" && /\/chat\/completions(?:[/?]|$)/i.test(String(profile.chatEndpoint || "")) && getSelectedReasoning(profile) !== "auto") {
            return `${prompt}\n\nReasoning: ${getSelectedReasoning(profile)}`;
        }
        return prompt;
    }

    function buildNativeLmStudioInput(reportData, settings, profile) {
        const userPrompt = `Prüfe dieses minimierte Berichtsheft. Nutze ausschließlich die folgenden Daten und antworte nur als JSON:\n${JSON.stringify(reportData)}`;
        return `${buildAiSystemPrompt(settings, { ...profile, provider: "native-lm-studio" })}\n\n${userPrompt}`;
    }

    function isLmStudioNativeProfile(profile) {
        return Boolean(profile && profile.provider === "lm-studio");
    }

    function buildOpenAiCompatibleRequest(reportData, profile, settings) {
        const model = selectedModel(profile);
        return {
            model,
            temperature: profile.temperature,
            max_tokens: profile.maxTokens,
            ...getReasoningRequestParameters(profile),
            messages: [
                { role: "system", content: buildAiSystemPrompt(settings, profile) },
                { role: "user", content: `Prüfe dieses minimierte Berichtsheft. Nutze ausschließlich die folgenden Daten und antworte nur als JSON:\n${JSON.stringify(reportData)}` }
            ]
        };
    }

    function buildAiRequest(reportData, profile, settings = loadAiConfig()) {
        const model = selectedModel(profile);
        if (!model) throw new Error("Kein KI-Modell ausgewählt. Bitte zuerst ein Modell laden oder manuell eintragen.");
        if (!reportData || !Array.isArray(reportData.days) || !reportData.days.length) throw new Error("Das Berichtsheft enthält keine auswertbaren Daten.");
        if (isLmStudioNativeProfile(profile)) {
            const request = {
                model,
                input: buildNativeLmStudioInput(reportData, settings, profile),
                temperature: profile.temperature,
                max_output_tokens: profile.maxTokens
            };
            const selected = getSelectedReasoning(profile);
            const capabilities = profile.reasoningCapabilities && profile.reasoningCapabilities.known
                ? normalizeReasoningCapabilities(profile.reasoningCapabilities, model, profile.reasoningCapabilities.source)
                : null;
            if (selected !== "auto" && capabilities && capabilities.allowedOptions.includes(selected)) request.reasoning = selected;
            return request;
        }
        return buildOpenAiCompatibleRequest(reportData, profile, settings);
    }

    function extractNativeLmStudioContent(envelope) {
        if (!envelope || typeof envelope !== "object") return "";
        if (typeof envelope.output === "string") return envelope.output;
        if (Array.isArray(envelope.output)) {
            const parts = envelope.output.flatMap(item => {
                if (typeof item === "string") return [item];
                if (!item || typeof item !== "object") return [];
                if (typeof item.content === "string") return [item.content];
                if (Array.isArray(item.content)) return item.content.map(part => typeof part === "string" ? part : part && (part.text || part.content) || "");
                if (typeof item.text === "string") return [item.text];
                return [];
            });
            if (parts.join("").trim()) return parts.join("");
        }
        if (typeof envelope.content === "string") return envelope.content;
        return envelope.choices && envelope.choices[0] && envelope.choices[0].message
            ? String(envelope.choices[0].message.content || "")
            : "";
    }

    async function callAi(reportData, profile, settings = loadAiConfig()) {
        debugLog(settings, "AI request started", { modelSelected: Boolean(selectedModel(profile)) });
        let request = buildAiRequest(reportData, profile, settings);
        const requestOptions = {
            method: "POST",
            url: joinUrl(profile.baseUrl, isLmStudioNativeProfile(profile) ? LM_STUDIO_NATIVE_CHAT_ENDPOINT : profile.chatEndpoint),
            headers: { "Content-Type": "application/json", Accept: "application/json", ...buildAuthHeaders(profile) },
            data: JSON.stringify(request),
            timeout: profile.timeout
        };
        let response = await gmRequest(requestOptions);
        if (isLmStudioNativeProfile(profile) && [404, 405].includes(Number(response.status))) {
            const fallbackRequest = buildOpenAiCompatibleRequest(reportData, profile, settings);
            debugLog(settings, "LM Studio native chat unavailable; using OpenAI-compatible fallback", { status: response.status });
            request = fallbackRequest;
            response = await gmRequest({
                ...requestOptions,
                url: joinUrl(profile.baseUrl, profile.chatEndpoint),
                data: JSON.stringify(fallbackRequest)
            });
        }
        const reasoningParameterWasSent = Object.prototype.hasOwnProperty.call(request, "reasoning_effort") || Object.prototype.hasOwnProperty.call(request, "reasoning");
        if (reasoningParameterWasSent && [400, 404, 422].includes(Number(response.status))) {
            const fallbackRequest = { ...request };
            delete fallbackRequest.reasoning_effort;
            delete fallbackRequest.reasoning;
            debugLog(settings, "Reasoning parameter unsupported; retrying without it", { status: response.status });
            response = await gmRequest({ ...requestOptions, data: JSON.stringify(fallbackRequest) });
        }
        debugLog(settings, "AI response", { status: response.status });
        const httpError = classifyHttpError(response.status);
        if (httpError) throw httpError;
        let envelope;
        try {
            envelope = JSON.parse(response.responseText || "");
        } catch (_error) {
            throw new Error("Der KI-Server hat keine gültige API-Antwort geliefert.");
        }
        const content = isLmStudioNativeProfile(profile) ? extractNativeLmStudioContent(envelope) : envelope && envelope.choices && envelope.choices[0] && envelope.choices[0].message ? envelope.choices[0].message.content : "";
        if (!content) throw new Error("Die KI-Antwort ist leer.");
        return parseAiResponse(content);
    }

    function extractJsonText(content) {
        const text = String(content || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        if (text.startsWith("{") && text.endsWith("}")) return text;
        const first = text.indexOf("{");
        const last = text.lastIndexOf("}");
        return first >= 0 && last > first ? text.slice(first, last + 1) : text;
    }

    function normalizeAiIssue(issue, defaults = {}) {
        if (typeof issue === "string") {
            return { day: defaults.day || "Allgemein", type: defaults.type || "notice", original: "", message: issue, suggestion: "" };
        }
        const source = issue && typeof issue === "object" ? issue : {};
        return {
            day: String(source.day || source.weekday || defaults.day || "Allgemein"),
            type: String(source.type || source.title || defaults.type || "notice"),
            original: String(source.original || source.entry || ""),
            message: String(source.message || source.text || source.description || source.title || "Hinweis ohne nähere Beschreibung."),
            suggestion: String(source.suggestion || source.recommendation || source.hint || "")
        };
    }

    function getAiIssueCount(result) {
        if (!result || typeof result !== "object") return 0;
        if (result.usesStructuredSchema) {
            return [result.formalIssues, result.contentIssues, result.hourIssues]
                .reduce((sum, issues) => sum + (Array.isArray(issues) ? issues.length : 0), 0);
        }
        return Array.isArray(result.issues) ? result.issues.length : 0;
    }

    function hasNoAiIssues(result) {
        return Boolean(result && result.status === "ok" && getAiIssueCount(result) === 0);
    }

    function parseAiResponse(content) {
        let parsed;
        try {
            parsed = JSON.parse(extractJsonText(content));
        } catch (_error) {
            throw new Error("Die KI hat kein gültiges JSON geliefert.");
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Die KI-Antwort hat ein ungültiges Format.");
        const responseStatus = String(parsed.status || "").toLowerCase();
        const status = ["ok", "warning", "critical"].includes(responseStatus) ? responseStatus : "warning";
        const structuredKeys = ["formalIssues", "contentIssues", "hourIssues", "notes"];
        const usesStructuredSchema = structuredKeys.some(key => Object.prototype.hasOwnProperty.call(parsed, key));
        const normalizeList = (value, defaults) => Array.isArray(value) ? value.map(issue => normalizeAiIssue(issue, defaults)) : [];
        const formalIssues = usesStructuredSchema ? normalizeList(parsed.formalIssues, { day: "Formal", type: "formal" }) : [];
        const contentIssues = usesStructuredSchema ? normalizeList(parsed.contentIssues, { day: "Allgemein", type: "content" }) : [];
        const hourIssues = usesStructuredSchema ? normalizeList(parsed.hourIssues, { day: "Stunden / UE", type: "hours" }) : [];
        const notes = usesStructuredSchema ? normalizeList(parsed.notes, { day: "Hinweis", type: "note" }) : [];
        const legacyIssues = usesStructuredSchema ? [] : normalizeList(parsed.issues, { day: "Allgemein", type: "notice" });
        const issues = usesStructuredSchema ? [...formalIssues, ...contentIssues, ...hourIssues] : legacyIssues;
        const result = {
            status,
            summary: "",
            usesStructuredSchema,
            formalIssues,
            contentIssues,
            hourIssues,
            notes,
            legacyIssues,
            issues,
            suggestedComment: String(parsed.suggestedComment || "")
        };
        result.summary = String(parsed.summary || (hasNoAiIssues(result)
            ? "Keine Auffälligkeiten gemeldet."
            : getAiIssueCount(result)
                ? "Die KI hat Auffälligkeiten gemeldet."
                : `KI-Status ${status} ohne strukturierte Auffälligkeiten.`));
        return result;
    }

    function generateSuggestedComment(aiResult) {
        return aiResult ? String(aiResult.suggestedComment || "").trim() : "";
    }

    async function createClientFingerprint(llmToken) {
        const token = String(llmToken || "").trim();
        if (!token) throw new Error("Im aktiven KI-Profil ist kein LLM-Token hinterlegt.");
        const cryptoApi = typeof globalThis !== "undefined" ? globalThis.crypto : null;
        if (!cryptoApi || !cryptoApi.subtle) throw new Error("Der Browser unterstützt die sichere Fingerabdruckberechnung nicht.");
        const bytes = new TextEncoder().encode(`wbs-llm-feedback:v1:${token}`);
        const digest = await cryptoApi.subtle.digest("SHA-256", bytes);
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    }

    function feedbackAiResult(aiResult) {
        const source = aiResult && typeof aiResult === "object" ? aiResult : {};
        return {
            status: ["ok", "warning", "critical"].includes(source.status) ? source.status : "warning",
            summary: String(source.summary || ""),
            formalIssues: Array.isArray(source.formalIssues) ? source.formalIssues : [],
            contentIssues: Array.isArray(source.contentIssues) ? source.contentIssues : [],
            hourIssues: Array.isArray(source.hourIssues) ? source.hourIssues : [],
            notes: Array.isArray(source.notes) ? source.notes : [],
            suggestedComment: String(source.suggestedComment || ""),
            ...(source.usesStructuredSchema === false && Array.isArray(source.issues) ? { legacyIssues: source.issues } : {})
        };
    }

    function buildFeedbackPayload({ reportData, localIssues, aiResult, profile, clientFingerprint, rating, categories, comment, expectedResult, requestDurationMs = 0 }) {
        const report = reportData && typeof reportData === "object" ? reportData : {};
        const days = Array.isArray(report.days) ? report.days : [];
        return {
            schemaVersion: 1,
            createdAt: new Date().toISOString(),
            scriptVersion: SCRIPT_VERSION,
            profile: {
                provider: String(profile && profile.provider || ""),
                model: selectedModel(profile || {})
            },
            report: {
                reportNumber: String(report.reportNumber || ""),
                module: String(report.module || ""),
                period: {
                    from: String(report.periodStart || ""),
                    to: String(report.periodEnd || "")
                },
                days: days.map(day => ({
                    day: String(day.weekday || ""),
                    entries: Array.isArray(day.entries) ? day.entries.map(entry => String(entry)) : [],
                    hours: typeof day.hours === "number" ? day.hours : null
                })),
                totalHours: typeof report.totalHours === "number" ? report.totalHours : null
            },
            localEvaluation: {
                issueCount: Array.isArray(localIssues) ? localIssues.length : 0,
                issues: Array.isArray(localIssues) ? localIssues : []
            },
            aiEvaluation: feedbackAiResult(aiResult),
            userFeedback: {
                rating: String(rating || "partly_correct"),
                categories: Array.isArray(categories) ? categories.map(String) : [],
                comment: String(comment || "").trim(),
                expectedResult: String(expectedResult || "").trim()
            },
            technical: {
                clientFingerprint: String(clientFingerprint || ""),
                requestDurationMs: Math.max(0, Math.round(Number(requestDurationMs) || 0)),
                httpStatus: 200
            }
        };
    }

    async function sendFeedbackPayload(payload) {
        const response = await gmRequest({
            method: "POST",
            url: FEEDBACK_ENDPOINT,
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            data: JSON.stringify(payload),
            timeout: 30000,
            errorMessage: "Der Feedbackdienst ist nicht erreichbar.",
            timeoutMessage: "Der Feedbackdienst hat nicht innerhalb von 30 Sekunden geantwortet.",
            abortMessage: "Die Feedbackübertragung wurde abgebrochen."
        });
        let parsed = {};
        try { parsed = JSON.parse(response.responseText || "{}"); } catch (_error) { /* Fehler wird unten verständlich gemeldet. */ }
        if (response.status !== 201 || parsed.success !== true) {
            const detail = parsed && parsed.error ? `: ${parsed.error}` : "";
            throw new Error(`Feedbackdienst antwortet mit HTTP ${response.status}${detail}`);
        }
        return parsed;
    }

    function canRunAiEvaluation(reportData) {
        return Boolean(reportData && Array.isArray(reportData.days) && reportData.days.length);
    }

    function isPrivateOrLocalHost(baseUrl) {
        try {
            const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "").toLowerCase();
            if (host === "localhost" || host === "::1" || host.endsWith(".localhost")) return true;
            const parts = host.split(".").map(Number);
            if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
            return parts[0] === 10 || parts[0] === 127 || (parts[0] === 192 && parts[1] === 168) ||
                (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 169 && parts[1] === 254);
        } catch (_error) {
            return false;
        }
    }

    function displayHost(baseUrl) {
        try { return new URL(baseUrl).host; } catch (_error) { return baseUrl || "nicht konfiguriert"; }
    }

    function createElement(tag, options = {}) {
        const element = document.createElement(tag);
        if (options.className) element.className = options.className;
        if (options.text !== undefined) element.textContent = options.text;
        if (options.type) element.type = options.type;
        if (options.value !== undefined) element.value = options.value;
        if (options.title) element.title = options.title;
        return element;
    }

    function injectStyles() {
        if (document.querySelector("#wbs-dmf-styles")) return;
        const style = createElement("style");
        style.id = "wbs-dmf-styles";
        style.textContent = `
            .wbs-dmf-button { margin: 4px; padding: 7px 12px; border: 1px solid #777; border-radius: 4px; background: #fff; cursor: pointer; }
            .wbs-dmf-button:hover { background: #f0f0f0; }
            .wbs-dmf-button-primary { background: #1769aa; border-color: #1769aa; color: #fff; }
            .wbs-dmf-button-danger { color: #9b1c1c; }
            .wbs-dmf-settings-launcher { position: fixed; right: 18px; bottom: 18px; z-index: 9998; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
            .wbs-dmf-modal-backdrop { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.48); display: flex; align-items: center; justify-content: center; padding: 20px; }
            .wbs-dmf-modal { width: min(780px, 96vw); max-height: 92vh; overflow: auto; background: #fff; color: #222; border-radius: 8px; padding: 20px; box-shadow: 0 8px 35px rgba(0,0,0,.35); }
            .wbs-dmf-modal h2, .wbs-dmf-panel h3 { margin-top: 0; }
            .wbs-dmf-grid { display: grid; grid-template-columns: minmax(170px, 1fr) minmax(260px, 2fr); gap: 10px 14px; align-items: center; }
            .wbs-dmf-grid input:not([type=checkbox]), .wbs-dmf-grid select, .wbs-dmf-grid textarea { width: 100%; box-sizing: border-box; padding: 6px; }
            .wbs-dmf-grid textarea { min-height: 150px; resize: vertical; }
            .wbs-dmf-actions { margin-top: 14px; display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
            .wbs-dmf-status { margin: 10px 0; padding: 8px; background: #f4f4f4; border-radius: 4px; }
            .wbs-dmf-warning { color: #9b4c00; font-weight: 600; }
            .wbs-dmf-note { font-size: .92em; color: #555; }
            .wbs-dmf-panel { margin: 16px 0; padding: 15px; border: 1px solid #b9c5d0; border-left: 5px solid #1769aa; border-radius: 5px; background: #f8fbfd; }
            .wbs-dmf-result { margin-top: 12px; }
            .wbs-dmf-ai-summary { margin: 8px 0; padding: 10px; border-left: 5px solid; background: #fff; }
            .wbs-dmf-ai-status-ok { border-left-color: #2e7d32; color: #1b5e20; }
            .wbs-dmf-ai-status-warning { border-left-color: #e2a400; color: #7a5600; }
            .wbs-dmf-ai-status-critical { border-left-color: #c62828; color: #8e0000; }
            .wbs-dmf-issue { margin: 5px 0; padding: 7px 9px; background: #fff; border-left: 3px solid #e2a400; }
            .wbs-dmf-issue-critical { border-left-color: #c62828; }
            .wbs-dmf-original { margin: 3px 0; color: #555; font-style: italic; }
            .wbs-dmf-detail { margin-top: 3px; }
            .wbs-dmf-suggestion { margin-top: 3px; color: #555; font-size: .94em; }
            .wbs-dmf-note-list { margin: 8px 0; padding: 9px 9px 9px 28px; background: #eef3f6; border-left: 4px solid #78909c; }
            .wbs-dmf-comment-preview { width: 100%; min-height: 100px; margin-top: 8px; box-sizing: border-box; }
            .wbs-dmf-feedback-categories { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 12px; }
            .wbs-dmf-feedback-categories label { font-weight: normal; }
            .wbs-dmf-feedback-preview { width: 100%; min-height: 230px; box-sizing: border-box; padding: 8px; font-family: monospace; font-size: 12px; resize: vertical; }
            @media (max-width: 640px) { .wbs-dmf-grid { grid-template-columns: 1fr; } }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function labelFor(text, input) {
        const label = createElement("label", { text });
        if (input.id) label.htmlFor = input.id;
        return label;
    }

    function makeInput(id, value, type = "text") {
        const input = createElement("input", { type, value });
        input.id = id;
        return input;
    }

    function renderAiSettings(onSaved) {
        document.querySelector("#wbs-dmf-settings-backdrop")?.remove();
        let settings = loadAiConfig();
        let workingProfiles = settings.profiles.map(profile => ({ ...profile }));
        let activeId = settings.activeProfileId;
        let workingCourses = settings.courses.map(course => ({ ...course }));
        let activeCourseId = settings.activeCourseId;
        const backdrop = createElement("div", { className: "wbs-dmf-modal-backdrop" });
        backdrop.id = "wbs-dmf-settings-backdrop";
        const modal = createElement("section", { className: "wbs-dmf-modal" });
        modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true"); modal.setAttribute("aria-labelledby", "wbs-dmf-settings-title");
        const title = createElement("h2", { text: "🤖 KI-Einstellungen" }); title.id = "wbs-dmf-settings-title"; modal.appendChild(title);
        modal.appendChild(createElement("h3", { text: "KI-Verbindung" }));
        const grid = createElement("div", { className: "wbs-dmf-grid" });
        const enabled = makeInput("wbs-ai-enabled", "", "checkbox"); enabled.checked = settings.enabled;
        const debug = makeInput("wbs-ai-debug", "", "checkbox"); debug.checked = settings.debug;
        const profileSelect = createElement("select"); profileSelect.id = "wbs-ai-profile";
        const name = makeInput("wbs-ai-name", "");
        const provider = createElement("select"); provider.id = "wbs-ai-provider";
        [["lm-studio", "LM Studio"], ["openai-compatible", "OpenAI-kompatible API"], ["custom", "Benutzerdefiniert"]].forEach(([value, text]) => provider.appendChild(new Option(text, value)));
        const baseUrl = makeInput("wbs-ai-base-url", "");
        const chatEndpoint = makeInput("wbs-ai-chat-endpoint", "");
        const modelsEndpoint = makeInput("wbs-ai-models-endpoint", "");
        const modelSelect = createElement("select"); modelSelect.id = "wbs-ai-model";
        const manualModel = makeInput("wbs-ai-manual-model", ""); manualModel.placeholder = "Optional, überschreibt das Dropdown";
        const temperature = makeInput("wbs-ai-temperature", "", "number"); temperature.min = "0"; temperature.max = "2"; temperature.step = "0.1";
        const maxTokens = makeInput("wbs-ai-max-tokens", "", "number"); maxTokens.min = "1"; maxTokens.max = "32768"; maxTokens.step = "1";
        const reasoningSelect = createElement("select"); reasoningSelect.id = "wbs-ai-reasoning";
        reasoningSelect.appendChild(new Option("Automatisch", "auto"));
        const reasoningInfo = createElement("p", { className: "wbs-dmf-note" });
        const timeout = makeInput("wbs-ai-timeout", "", "number"); timeout.min = "1000"; timeout.max = "900000"; timeout.step = "1000";
        const authEnabled = makeInput("wbs-ai-auth-enabled", "", "checkbox");
        const authType = createElement("select"); authType.id = "wbs-ai-auth";
        [["none", "Keine"], ["bearer", "Bearer Token"], ["api-key", "API Key (X-API-Key)"]].forEach(([value, text]) => authType.appendChild(new Option(text, value)));
        const token = makeInput("wbs-ai-token", "", "password"); token.autocomplete = "off";
        const prompt = createElement("textarea"); prompt.id = "wbs-ai-system-prompt"; prompt.value = settings.systemPrompt;
        [
            ["KI-Unterstützung aktivieren", enabled], ["Debug-Modus", debug], ["KI-Profil", profileSelect],
            ["Profilname", name], ["Anbieter", provider], ["KI-Server", baseUrl], ["Chat Endpoint", chatEndpoint],
            ["Models Endpoint", modelsEndpoint], ["Modell", modelSelect], ["Modellname manuell eingeben", manualModel],
            ["Temperature", temperature], ["Max. Ausgabetokens", maxTokens], ["Reasoning / Thinking", reasoningSelect], ["Timeout (ms)", timeout], ["Authentifizierung verwenden", authEnabled], ["Authentifizierungstyp", authType],
            ["API Token / API Key", token], ["Systemprompt", prompt]
        ].forEach(([labelText, input]) => grid.append(labelFor(labelText, input), input));
        modal.appendChild(createElement("p", { className: "wbs-dmf-note", text: "Automatisch sendet keine Reasoning-Vorgabe. Niedrig, Mittel und Hoch werden nur für erkannte kompatible Anbieter/Modelle verwendet; nicht unterstützte Vorgaben werden automatisch weggelassen." }));
        modal.appendChild(grid);
        modal.appendChild(reasoningInfo);
        modal.appendChild(createElement("h3", { text: "Kurse und Berichtswoche" }));
        const courseGrid = createElement("div", { className: "wbs-dmf-grid" });
        const courseSelect = createElement("select"); courseSelect.id = "wbs-course-select";
        const courseName = makeInput("wbs-course-name", "");
        const courseStart = makeInput("wbs-course-start", "", "date");
        [["Aktiver Kurs", courseSelect], ["Kursname", courseName], ["Kursstart", courseStart]]
            .forEach(([labelText, input]) => courseGrid.append(labelFor(labelText, input), input));
        modal.appendChild(courseGrid);
        const courseActions = createElement("div", { className: "wbs-dmf-actions" });
        const newCourseButton = createElement("button", { className: "wbs-dmf-button", type: "button", text: "Kurs erstellen" });
        const deleteCourseButton = createElement("button", { className: "wbs-dmf-button wbs-dmf-button-danger", type: "button", text: "Kurs löschen" });
        courseActions.append(newCourseButton, deleteCourseButton); modal.appendChild(courseActions);
        modal.appendChild(createElement("h3", { text: "Gesetzliche Feiertage in Deutschland" }));
        modal.appendChild(createElement("p", { className: "wbs-dmf-note", text: "Alle angezeigten bundesweiten, landesweiten und örtlichen Feiertage werden unabhängig von ihrem Geltungsbereich als schulungsfrei behandelt." }));
        const holidayYear = makeInput("wbs-holiday-year", String(new Date().getFullYear()), "number"); holidayYear.min = "2000"; holidayYear.max = "2100";
        const holidayYearRow = createElement("div", { className: "wbs-dmf-grid" });
        holidayYearRow.append(labelFor("Jahr", holidayYear), holidayYear); modal.appendChild(holidayYearRow);
        const holidayList = createElement("ul", { className: "wbs-dmf-note-list" }); modal.appendChild(holidayList);
        modal.appendChild(createElement("p", { className: "wbs-dmf-note", text: "Tokens werden getrennt im lokalen Userscript-Speicher abgelegt. Dieser Speicher ist kein vollwertiger Passwort-Tresor. Berichtsheftinhalte werden nicht gespeichert." }));
        modal.appendChild(createElement("p", { className: "wbs-dmf-note", text: settings.systemPrompt === DEFAULT_SYSTEM_PROMPT
            ? "Aktiv ist der eingebaute Standardprompt."
            : "Aktiv ist dein eigener gespeicherter Systemprompt. Script-Updates überschreiben ihn nicht; nur „Standardprompt wiederherstellen“ ersetzt ihn bewusst." }));
        const externalWarning = createElement("p", { className: "wbs-dmf-warning" }); modal.appendChild(externalWarning);
        const status = createElement("div", { className: "wbs-dmf-status", text: "Verbindung noch nicht getestet." }); modal.appendChild(status);
        const actions = createElement("div", { className: "wbs-dmf-actions" });
        const newButton = createElement("button", { className: "wbs-dmf-button", type: "button", text: "Profil erstellen" });
        const deleteButton = createElement("button", { className: "wbs-dmf-button wbs-dmf-button-danger", type: "button", text: "Profil löschen" });
        const modelsButton = createElement("button", { className: "wbs-dmf-button", type: "button", text: "Modelle neu laden" });
        const testButton = createElement("button", { className: "wbs-dmf-button", type: "button", text: "Verbindung testen" });
        const restoreButton = createElement("button", { className: "wbs-dmf-button", type: "button", text: "Standardprompt wiederherstellen" });
        const saveButton = createElement("button", { className: "wbs-dmf-button wbs-dmf-button-primary", type: "button", text: "Speichern" });
        const closeButton = createElement("button", { className: "wbs-dmf-button", type: "button", text: "Abbrechen" });
        [newButton, deleteButton, modelsButton, testButton, restoreButton, saveButton, closeButton].forEach(button => actions.appendChild(button));
        modal.appendChild(actions); backdrop.appendChild(modal); document.body.appendChild(backdrop);

        const findProfile = () => workingProfiles.find(item => item.id === activeId) || workingProfiles[0];
        const findCourse = () => workingCourses.find(item => item.id === activeCourseId) || null;
        const persistVisibleCourse = () => {
            const current = findCourse();
            if (!current) return;
            Object.assign(current, normalizeCourse({ ...current, name: courseName.value.trim() || current.name, startDate: courseStart.value }));
        };
        const renderCourseOptions = () => {
            courseSelect.replaceChildren(new Option("— Kein Kurs ausgewählt —", ""));
            workingCourses.forEach(course => courseSelect.appendChild(new Option(course.name, course.id)));
            courseSelect.value = activeCourseId;
        };
        const showCourse = () => {
            const current = findCourse();
            courseName.value = current ? current.name : "";
            courseStart.value = current ? current.startDate : "";
            courseName.disabled = !current; courseStart.disabled = !current; deleteCourseButton.disabled = !current;
        };
        const renderHolidayYear = () => {
            holidayList.replaceChildren();
            const holidays = getGermanHolidays(Number(holidayYear.value));
            holidays.forEach(holiday => holidayList.appendChild(createElement("li", { text: `${formatGermanDate(holiday.date)} – ${holiday.name} (${holiday.scope})` })));
            if (!holidays.length) holidayList.appendChild(createElement("li", { text: "Bitte ein Jahr zwischen 2000 und 2100 eingeben." }));
        };
        const updateWarning = () => { externalWarning.textContent = isPrivateOrLocalHost(baseUrl.value) ? `KI-Verarbeitung über: ${displayHost(baseUrl.value)}` : "Achtung: Die konfigurierte KI befindet sich möglicherweise außerhalb des lokalen Netzwerks."; };
        const replaceModelOptions = (models, chosen = "") => {
            modelSelect.replaceChildren(new Option("— Modell auswählen —", ""));
            [...new Set([chosen, ...models].filter(Boolean))].forEach(model => modelSelect.appendChild(new Option(model, model)));
            modelSelect.value = chosen;
        };
        let modelDetails = [];
        const renderReasoningOptions = (capabilities, errorMessage = "") => {
            const current = findProfile();
            const normalized = capabilities && capabilities.known ? normalizeReasoningCapabilities(capabilities, selectedModel(current), capabilities.source) : null;
            reasoningSelect.replaceChildren();
            reasoningSelect.appendChild(new Option("Automatisch", "auto"));
            if (normalized && normalized.supported) {
                const defaultText = normalized.default ? ` (Modellstandard: ${REASONING_LABELS[normalized.default]})` : "";
                reasoningSelect.options[0].textContent = `Automatisch${defaultText}`;
                normalized.allowedOptions.forEach(option => reasoningSelect.appendChild(new Option(REASONING_LABELS[option] || option, option)));
                const selected = getSelectedReasoning(current);
                reasoningSelect.value = selected !== "auto" && normalized.allowedOptions.includes(selected) ? selected : "auto";
                reasoningSelect.disabled = false;
                reasoningInfo.textContent = `Unterstützte Optionen: ${normalized.allowedOptions.map(option => REASONING_LABELS[option] || option).join(", ")}.`;
            } else if (normalized && normalized.known) {
                reasoningSelect.replaceChildren(new Option("Automatisch", "auto"), new Option("Nicht unterstützt", "unsupported"));
                reasoningSelect.value = "unsupported"; reasoningSelect.disabled = true;
                reasoningInfo.textContent = "Dieses Modell meldet keine Reasoning-/Thinking-Optionen.";
            } else {
                reasoningSelect.value = "auto"; reasoningSelect.disabled = false;
                reasoningInfo.textContent = errorMessage || "Reasoning-Eigenschaften dieses Modells konnten nicht ermittelt werden. Automatisch wird verwendet.";
            }
        };
        const updateReasoningForModel = (profile, errorMessage = "") => {
            const detail = modelDetails.find(item => item.id === selectedModel(profile) || item.id === profile.model);
            if (detail && detail.capabilities) {
                profile.reasoningCapabilities = detail.capabilities;
                const selected = getSelectedReasoning(profile);
                if (selected !== "auto" && !detail.capabilities.allowedOptions.includes(selected)) {
                    profile.reasoning = "auto";
                    profile.reasoningMode = "auto";
                }
                renderReasoningOptions(detail.capabilities);
            } else {
                profile.reasoningCapabilities = null;
                profile.reasoning = "auto";
                profile.reasoningMode = "auto";
                renderReasoningOptions(null, errorMessage);
            }
        };
        const persistVisibleProfile = () => {
            const current = findProfile();
            if (!current) return;
            const reasoningSelection = reasoningSelect.disabled ? "auto" : reasoningSelect.value;
            Object.assign(current, normalizeProfile({ ...current, name: name.value.trim() || current.name, provider: provider.value,
                baseUrl: baseUrl.value, chatEndpoint: chatEndpoint.value, modelsEndpoint: modelsEndpoint.value,
                model: modelSelect.value, manualModel: manualModel.value, temperature: temperature.value, maxTokens: maxTokens.value,
                reasoning: REASONING_VALUES.includes(reasoningSelection) ? reasoningSelection : "auto",
                reasoningMode: reasoningSelection === "auto" || reasoningSelection === "off" ? reasoningSelection : "on",
                reasoningEffort: ["low", "medium", "high"].includes(reasoningSelection) ? reasoningSelection : current.reasoningEffort,
                timeout: timeout.value, authType: authEnabled.checked ? (authType.value === "none" ? "bearer" : authType.value) : "none", token: token.value }));
        };
        const renderProfileOptions = () => {
            profileSelect.replaceChildren(); workingProfiles.forEach(item => profileSelect.appendChild(new Option(item.name, item.id))); profileSelect.value = activeId;
        };
        const showProfile = () => {
            const current = findProfile(); if (!current) return;
            name.value = current.name; provider.value = current.provider; baseUrl.value = current.baseUrl;
            chatEndpoint.value = current.chatEndpoint; modelsEndpoint.value = current.modelsEndpoint;
            replaceModelOptions([], current.model); manualModel.value = current.manualModel;
            temperature.value = String(current.temperature); maxTokens.value = String(current.maxTokens);
            renderReasoningOptions(current.reasoningCapabilities);
            const selectedReasoning = getSelectedReasoning(current);
            if ([...reasoningSelect.options].some(option => option.value === selectedReasoning)) reasoningSelect.value = selectedReasoning;
            timeout.value = String(current.timeout);
            authEnabled.checked = current.authType !== "none"; authType.value = current.authType;
            authType.disabled = !authEnabled.checked; token.value = current.token; token.disabled = !authEnabled.checked; updateWarning();
        };
        const runModelRequest = async isTest => {
            persistVisibleProfile(); const current = findProfile(); status.textContent = "🟡 Verbindung wird geprüft …";
            testButton.disabled = true; modelsButton.disabled = true;
            const result = await testAiConnection(current, { ...settings, debug: debug.checked }); status.textContent = result.message;
            modelDetails = result.details || [];
            if (result.models.length) {
                const previous = current.model; replaceModelOptions(result.models, result.models.includes(previous) ? previous : result.models[0]); current.model = modelSelect.value;
            }
            updateReasoningForModel(current, result.models.length ? "" : "Reasoning-Eigenschaften dieses Modells konnten nicht ermittelt werden.");
            testButton.disabled = false; modelsButton.disabled = false;
            if (!isTest && result.ok && !result.models.length) status.textContent = "🟡 Keine Modelle gefunden; bitte Modell manuell eingeben.";
        };
        renderProfileOptions(); showProfile(); renderCourseOptions(); showCourse(); renderHolidayYear();
        profileSelect.addEventListener("change", () => { persistVisibleProfile(); activeId = profileSelect.value; showProfile(); void runModelRequest(false); });
        modelSelect.addEventListener("change", () => { persistVisibleProfile(); const current = findProfile(); current.model = modelSelect.value; updateReasoningForModel(current); });
        manualModel.addEventListener("input", () => { const current = findProfile(); if (current) { current.manualModel = manualModel.value; updateReasoningForModel(current, "Reasoning-Eigenschaften dieses manuell eingetragenen Modells konnten nicht ermittelt werden. Außerdem wird automatisch verwendet."); } });
        provider.addEventListener("change", () => { persistVisibleProfile(); modelDetails = []; const current = findProfile(); current.provider = provider.value; updateReasoningForModel(current, "Reasoning-Eigenschaften für diesen Anbieter konnten nicht ermittelt werden. Automatisch wird verwendet."); void runModelRequest(false); });
        courseSelect.addEventListener("change", () => { persistVisibleCourse(); activeCourseId = courseSelect.value; showCourse(); });
        courseName.addEventListener("input", () => {
            const current = findCourse();
            if (current) { current.name = courseName.value || "Unbenannter Kurs"; renderCourseOptions(); }
        });
        holidayYear.addEventListener("input", renderHolidayYear);
        baseUrl.addEventListener("input", updateWarning);
        authEnabled.addEventListener("input", () => {
            if (authEnabled.checked && authType.value === "none") authType.value = "bearer";
            authType.disabled = !authEnabled.checked;
            token.disabled = !authEnabled.checked;
        });
        authType.addEventListener("input", () => {
            authEnabled.checked = authType.value !== "none";
            authType.disabled = !authEnabled.checked;
            token.disabled = !authEnabled.checked;
        });
        name.addEventListener("input", () => { const current = findProfile(); if (current) { current.name = name.value || "Unbenanntes Profil"; renderProfileOptions(); } });
        newButton.addEventListener("click", () => { persistVisibleProfile(); const id = `ai-profile-${Date.now()}`; workingProfiles.push(cloneDefaultProfile(id, `KI-Profil ${workingProfiles.length + 1}`)); activeId = id; renderProfileOptions(); showProfile(); });
        deleteButton.addEventListener("click", () => {
            if (workingProfiles.length === 1) { status.textContent = "Mindestens ein Profil muss erhalten bleiben."; return; }
            if (!window.confirm(`Profil „${findProfile().name}“ wirklich löschen?`)) return;
            workingProfiles = workingProfiles.filter(item => item.id !== activeId); activeId = workingProfiles[0].id; renderProfileOptions(); showProfile();
        });
        newCourseButton.addEventListener("click", () => {
            persistVisibleCourse();
            const id = `course-${Date.now()}`;
            workingCourses.push(normalizeCourse({ id, name: `Kurs ${workingCourses.length + 1}`, startDate: "" }));
            activeCourseId = id; renderCourseOptions(); showCourse(); courseName.focus();
        });
        deleteCourseButton.addEventListener("click", () => {
            const current = findCourse();
            if (!current || !window.confirm(`Kurs „${current.name}“ wirklich löschen?`)) return;
            workingCourses = workingCourses.filter(course => course.id !== activeCourseId);
            activeCourseId = workingCourses[0] && workingCourses[0].id || "";
            renderCourseOptions(); showCourse();
        });
        modelsButton.addEventListener("click", () => runModelRequest(false)); testButton.addEventListener("click", () => runModelRequest(true));
        restoreButton.addEventListener("click", () => { prompt.value = DEFAULT_SYSTEM_PROMPT; }); closeButton.addEventListener("click", () => backdrop.remove());
        backdrop.addEventListener("click", event => { if (event.target === backdrop) backdrop.remove(); });
        saveButton.addEventListener("click", () => {
            try {
                persistVisibleProfile(); persistVisibleCourse(); settings = saveAiConfig({
                    enabled: enabled.checked, debug: debug.checked, activeProfileId: activeId, profiles: workingProfiles,
                    activeCourseId, courses: workingCourses, systemPrompt: prompt.value
                });
                backdrop.remove(); if (typeof onSaved === "function") onSaved(settings);
            } catch (error) { status.textContent = `🔴 ${error.message}`; }
        });
        name.focus();
        void runModelRequest(false);
    }

    function renderSettingsLauncher(onSaved) {
        if (document.querySelector("#wbs-dmf-settings-launcher")) return;
        const button = createElement("button", { className: "wbs-dmf-button wbs-dmf-settings-launcher", type: "button", text: "⚙ KI-Einstellungen" });
        button.id = "wbs-dmf-settings-launcher"; button.addEventListener("click", () => renderAiSettings(onSaved)); document.body.appendChild(button);
    }

    function chooseCommentAction() {
        return new Promise(resolve => {
            const backdrop = createElement("div", { className: "wbs-dmf-modal-backdrop" });
            const modal = createElement("section", { className: "wbs-dmf-modal" }); modal.style.width = "min(520px, 96vw)";
            modal.appendChild(createElement("h2", { text: "Vorhandener Kommentar" }));
            modal.appendChild(createElement("p", { text: "Das Kommentarfeld enthält bereits Text. Wie soll der KI-Vorschlag übernommen werden?" }));
            const actions = createElement("div", { className: "wbs-dmf-actions" });
            [["Anhängen", "append", "wbs-dmf-button-primary"], ["Ersetzen", "replace", ""], ["Abbrechen", "cancel", ""]].forEach(([text, value, extraClass]) => {
                const button = createElement("button", { className: `wbs-dmf-button ${extraClass}`, type: "button", text });
                button.addEventListener("click", () => { backdrop.remove(); resolve(value); }); actions.appendChild(button);
            });
            modal.appendChild(actions); backdrop.appendChild(modal); document.body.appendChild(backdrop);
        });
    }

    async function applySuggestedComment(commentText, commentTextArea) {
        const suggestion = String(commentText || "").trim();
        if (!suggestion) throw new Error("Es ist kein Kommentarvorschlag vorhanden.");
        if (!commentTextArea) throw new Error("Das Kommentarfeld wurde nicht gefunden. Möglicherweise hat sich die WBS-Seitenstruktur geändert.");
        const existing = commentTextArea.value.trim();
        const action = existing ? await chooseCommentAction() : "replace";
        if (action === "cancel") return false;
        commentTextArea.value = action === "append" ? `${existing}\n\n${suggestion}` : suggestion;
        commentTextArea.dispatchEvent(new Event("input", { bubbles: true })); commentTextArea.focus(); return true;
    }

    function renderLocalResults(container, issues) {
        container.replaceChildren();
        const issueLabel = issues.length === 1 ? "1 Auffälligkeit" : `${issues.length} Auffälligkeiten`;
        container.appendChild(createElement("strong", { text: `Lokale Prüfung: ${issues.length ? issueLabel : "keine Auffälligkeiten"}` }));
        if (!issues.length) return;
        const list = createElement("ul");
        issues.slice(0, 12).forEach(issue => list.appendChild(createElement("li", { text: `${issue.day}: ${issue.message}${issue.original ? ` („${issue.original}“)` : ""}` })));
        if (issues.length > 12) list.appendChild(createElement("li", { text: `${issues.length - 12} weitere Hinweise.` }));
        container.appendChild(list);
    }

    function aiIssueTypeLabel(type) {
        const labels = {
            too_generic: "Tätigkeit zu allgemein",
            too_general: "Tätigkeit zu allgemein",
            missing_information: "Fehlende Information",
            repetition: "Wiederholung",
            contradiction: "Widerspruch",
            hours: "Stundenauffälligkeit",
            formal: "Formale Auffälligkeit",
            content: "Inhaltliche Auffälligkeit",
            notice: "Auffälligkeit"
        };
        const value = String(type || "notice");
        return labels[value.toLowerCase()] || value.replace(/_/g, " ");
    }

    function renderAiIssueBox(container, issue, status) {
        const box = createElement("article", { className: `wbs-dmf-issue ${status === "critical" ? "wbs-dmf-issue-critical" : ""}` });
        const title = [issue.day, aiIssueTypeLabel(issue.type)].filter(Boolean).join(" · ");
        box.appendChild(createElement("strong", { text: title }));
        if (issue.original) box.appendChild(createElement("div", { className: "wbs-dmf-original", text: `„${issue.original}“` }));
        if (issue.message) box.appendChild(createElement("div", { className: "wbs-dmf-detail", text: issue.message }));
        if (issue.suggestion && issue.suggestion !== issue.message) box.appendChild(createElement("div", { className: "wbs-dmf-suggestion", text: `→ ${issue.suggestion}` }));
        container.appendChild(box);
    }

    function renderAiResults(container, result) {
        container.replaceChildren();
        const issueCount = getAiIssueCount(result);
        const statusSymbol = result.status === "ok" ? "✓" : result.status === "critical" ? "⛔" : "⚠";
        const summary = createElement("div", { className: `wbs-dmf-ai-summary wbs-dmf-ai-status-${result.status}` });
        summary.appendChild(createElement("strong", { text: `${statusSymbol} ${result.summary}` }));
        summary.appendChild(createElement("div", { text: `KI-Auffälligkeiten: ${issueCount}` }));
        container.appendChild(summary);

        if (result.usesStructuredSchema) {
            if (result.formalIssues.length) {
                container.appendChild(createElement("h4", { text: "Formale Auffälligkeiten" }));
                const list = createElement("ul");
                result.formalIssues.forEach(issue => list.appendChild(createElement("li", { text: issue.message })));
                container.appendChild(list);
            }
            if (result.contentIssues.length) {
                container.appendChild(createElement("h4", { text: "Inhaltliche Auffälligkeiten" }));
                const sortedContentIssues = [...result.contentIssues].sort((left, right) => {
                    const findDayIndex = value => DAY_NAMES.findIndex(day => String(value || "").toLocaleLowerCase("de-DE").includes(day.toLocaleLowerCase("de-DE")));
                    const leftIndex = findDayIndex(left.day);
                    const rightIndex = findDayIndex(right.day);
                    return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
                });
                sortedContentIssues.forEach(issue => renderAiIssueBox(container, issue, result.status));
            }
            if (result.hourIssues.length) {
                container.appendChild(createElement("h4", { text: "Stunden / UE" }));
                result.hourIssues.forEach(issue => renderAiIssueBox(container, issue, result.status));
            }
            if (result.notes.length) {
                container.appendChild(createElement("h4", { text: "Hinweise" }));
                const notes = createElement("ul", { className: "wbs-dmf-note-list" });
                result.notes.forEach(note => notes.appendChild(createElement("li", { text: note.message })));
                container.appendChild(notes);
            }
        } else {
            result.issues.forEach(issue => renderAiIssueBox(container, issue, result.status));
        }

        if (hasNoAiIssues(result)) container.appendChild(createElement("p", { text: "Keine Auffälligkeiten gemeldet." }));
    }

    function renderFeedbackDialog(context) {
        document.querySelector("#wbs-dmf-feedback-backdrop")?.remove();
        const backdrop = createElement("div", { className: "wbs-dmf-modal-backdrop" });
        backdrop.id = "wbs-dmf-feedback-backdrop";
        const modal = createElement("section", { className: "wbs-dmf-modal" });
        modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
        modal.appendChild(createElement("h2", { text: "Auswertung als Feedback melden" }));
        modal.appendChild(createElement("p", { className: "wbs-dmf-note", text: "Übertragen werden nur die unten angezeigten Berichtsdaten, die lokale Prüfung, die KI-Auswertung und deine Bewertung. Teilnehmername, WBS-URL und das echte LLM-Token werden nicht übertragen." }));

        const grid = createElement("div", { className: "wbs-dmf-grid" });
        const rating = createElement("select"); rating.id = "wbs-dmf-feedback-rating";
        [["good", "Passt"], ["partly_correct", "Teilweise richtig"], ["poor", "Unpassend"]].forEach(([value, text]) => rating.appendChild(new Option(text, value)));
        rating.value = "partly_correct";
        grid.append(labelFor("Gesamtbewertung", rating), rating);

        const categoryLabels = {
            too_strict: "Zu streng", too_lenient: "Zu nachsichtig", false_positive: "Falsche Auffälligkeit",
            missed_issue: "Auffälligkeit übersehen", wrong_hours: "Stunden falsch", wrong_formal_issue: "Formales falsch",
            wrong_content_issue: "Inhaltliches falsch", wrong_summary: "Zusammenfassung falsch", wrong_comment: "Kommentar falsch",
            extraction_problem: "Daten nicht richtig erkannt", technical_problem: "Technisches Problem", other: "Sonstiges"
        };
        const categoryBox = createElement("div", { className: "wbs-dmf-feedback-categories" });
        Object.entries(categoryLabels).forEach(([value, text]) => {
            const label = createElement("label");
            const input = createElement("input", { type: "checkbox", value }); input.name = "wbs-dmf-feedback-category";
            label.append(input, ` ${text}`); categoryBox.appendChild(label);
        });
        grid.append(createElement("span", { text: "Was passt nicht?" }), categoryBox);

        const comment = createElement("textarea"); comment.id = "wbs-dmf-feedback-comment"; comment.placeholder = "Was gefällt dir an der Auswertung nicht?";
        const expectedResult = createElement("textarea"); expectedResult.id = "wbs-dmf-feedback-expected"; expectedResult.placeholder = "Wie hätte die richtige Auswertung aussehen sollen?";
        grid.append(labelFor("Deine Einschätzung", comment), comment, labelFor("Erwartetes Ergebnis", expectedResult), expectedResult);
        modal.appendChild(grid);

        modal.appendChild(createElement("h3", { text: "Übertragungsvorschau" }));
        const payloadPreview = createElement("textarea", { className: "wbs-dmf-feedback-preview" }); payloadPreview.readOnly = true;
        modal.appendChild(payloadPreview);
        const status = createElement("div", { className: "wbs-dmf-status", text: "Anonyme Zuordnung wird vorbereitet …" }); modal.appendChild(status);
        const actions = createElement("div", { className: "wbs-dmf-actions" });
        const sendButton = createElement("button", { className: "wbs-dmf-button wbs-dmf-button-primary", type: "button", text: "Feedback senden" }); sendButton.disabled = true;
        const closeButton = createElement("button", { className: "wbs-dmf-button", type: "button", text: "Abbrechen" });
        actions.append(sendButton, closeButton); modal.appendChild(actions); backdrop.appendChild(modal); document.body.appendChild(backdrop);

        let clientFingerprint = "";
        const selectedCategories = () => [...categoryBox.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
        const currentPayload = () => buildFeedbackPayload({
            ...context,
            clientFingerprint,
            rating: rating.value,
            categories: selectedCategories(),
            comment: comment.value,
            expectedResult: expectedResult.value
        });
        const updatePreview = () => { payloadPreview.value = JSON.stringify(currentPayload(), null, 2); };
        [rating, categoryBox, comment, expectedResult].forEach(element => element.addEventListener("input", updatePreview));
        closeButton.addEventListener("click", () => backdrop.remove());
        backdrop.addEventListener("click", event => { if (event.target === backdrop) backdrop.remove(); });
        sendButton.addEventListener("click", async () => {
            if (!selectedCategories().length) {
                status.textContent = "Bitte mindestens eine passende Kategorie auswählen.";
                return;
            }
            updatePreview();
            sendButton.disabled = true; status.textContent = "Feedback wird gesendet …";
            try {
                const response = await sendFeedbackPayload(currentPayload());
                status.textContent = `Feedback gespeichert: ${response.id}`;
                sendButton.textContent = "Feedback gesendet";
            } catch (error) {
                status.textContent = `Feedback konnte nicht gesendet werden: ${error.message}`;
                sendButton.disabled = false;
            }
        });

        void createClientFingerprint(context.profile && context.profile.token).then(fingerprint => {
            clientFingerprint = fingerprint;
            updatePreview();
            status.textContent = "Vorschau bereit. Gesendet wird erst nach deinem Klick.";
            sendButton.disabled = false;
        }).catch(error => {
            status.textContent = error.message;
            payloadPreview.value = "Ohne hinterlegtes LLM-Token kann keine anonyme Zuordnung erzeugt werden.";
        });
    }

    function renderAiPanel(commentTextArea, insertionTarget, beforeElement) {
        document.querySelector("#wbs-dmf-ai-panel")?.remove();
        const settings = loadAiConfig(); const profile = getActiveAiProfile(settings); const course = getActiveCourse(settings);
        const panel = createElement("section", { className: "wbs-dmf-panel" }); panel.id = "wbs-dmf-ai-panel";
        panel.appendChild(createElement("h3", { text: "🤖 KI-Assistent" }));
        panel.appendChild(createElement("div", { text: `KI-Profil: ${profile.name}` }));
        panel.appendChild(createElement("div", { text: `KI-Verarbeitung über: ${displayHost(profile.baseUrl)}` }));
        panel.appendChild(createElement("div", { text: `Modell: ${selectedModel(profile) || "noch nicht ausgewählt"}` }));
        panel.appendChild(createElement("div", { text: course ? `Kurs: ${course.name} · Start: ${course.startDate ? formatGermanDate(course.startDate) : "noch nicht gesetzt"}` : "Kurs: kein Kursstart ausgewählt" }));
        if (!isPrivateOrLocalHost(profile.baseUrl)) panel.appendChild(createElement("p", { className: "wbs-dmf-warning", text: "Achtung: Die konfigurierte KI befindet sich möglicherweise außerhalb des lokalen Netzwerks." }));
        const connectionStatus = createElement("div", { className: "wbs-dmf-status", text: settings.enabled ? "Verbindung noch nicht getestet." : "KI-Unterstützung ist deaktiviert." }); panel.appendChild(connectionStatus);
        const reportData = extractReportData();
        const expectedNumber = course && reportData.periodStart ? formatExpectedReportNumber(course.startDate, reportData.periodStart) : "";
        if (expectedNumber) panel.appendChild(createElement("div", { text: `Erwartete Berichtsnummer für diesen Zeitraum: ${expectedNumber}` }));
        const localIssues = validateReport(reportData, commentPOIs, course);
        const localResults = createElement("div", { className: "wbs-dmf-result" }); renderLocalResults(localResults, localIssues); panel.appendChild(localResults);
        const aiResults = createElement("div", { className: "wbs-dmf-result" }); panel.appendChild(aiResults);
        const preview = createElement("textarea", { className: "wbs-dmf-comment-preview" }); preview.placeholder = "Hier erscheint der bearbeitbare Kommentarvorschlag."; preview.hidden = true; panel.appendChild(preview);
        const actions = createElement("div", { className: "wbs-dmf-actions" });
        const testButton = createElement("button", { className: "wbs-dmf-button", type: "button", text: "Verbindung testen" });
        const checkButton = createElement("button", { className: "wbs-dmf-button wbs-dmf-button-primary", type: "button", text: "Mit KI prüfen" });
        const generateButton = createElement("button", { className: "wbs-dmf-button", type: "button", text: "Kommentar erzeugen" });
        const applyButton = createElement("button", { className: "wbs-dmf-button", type: "button", text: "Kommentar übernehmen" });
        const feedbackButton = createElement("button", { className: "wbs-dmf-button", type: "button", text: "Auswertung melden" });
        const settingsButton = createElement("button", { className: "wbs-dmf-button", type: "button", text: "Einstellungen" });
        generateButton.disabled = true; applyButton.disabled = true; feedbackButton.disabled = true; checkButton.disabled = !settings.enabled;
        [testButton, checkButton, generateButton, applyButton, feedbackButton, settingsButton].forEach(button => actions.appendChild(button)); panel.appendChild(actions);
        let lastResult = null; let lastReportData = reportData; let lastLocalIssues = localIssues; let lastRequestDurationMs = 0;
        testButton.addEventListener("click", async () => { connectionStatus.textContent = "🟡 Verbindung wird geprüft …"; testButton.disabled = true; const result = await testAiConnection(profile, settings); connectionStatus.textContent = result.message; testButton.disabled = false; });
        checkButton.addEventListener("click", async () => {
            const currentReportData = extractReportData();
            const currentLocalIssues = validateReport(currentReportData, commentPOIs, course);
            lastReportData = currentReportData; lastLocalIssues = currentLocalIssues;
            renderLocalResults(localResults, currentLocalIssues);
            if (!canRunAiEvaluation(currentReportData)) {
                connectionStatus.textContent = "🔴 Es wurden technisch keine Berichtsfelder erkannt. Wahrscheinlich wurde die WBS-Seitenstruktur verändert.";
                return;
            }
            connectionStatus.textContent = "🟡 KI-Prüfung läuft …"; checkButton.disabled = true;
            lastResult = null; generateButton.disabled = true; applyButton.disabled = true; feedbackButton.disabled = true; preview.value = ""; preview.hidden = true;
            try {
                const aiReportData = course && course.startDate ? {
                    ...currentReportData,
                    courseContext: {
                        startDate: course.startDate,
                        expectedReportNumber: currentReportData.periodStart ? formatExpectedReportNumber(course.startDate, currentReportData.periodStart) : ""
                    }
                } : currentReportData;
                const requestStartedAt = Date.now();
                lastResult = await callAi(aiReportData, profile, settings); lastRequestDurationMs = Date.now() - requestStartedAt;
                connectionStatus.textContent = "🟢 KI-Antwort erfolgreich verarbeitet"; renderAiResults(aiResults, lastResult); feedbackButton.disabled = false;
                const suggestion = generateSuggestedComment(lastResult);
                if (suggestion) { preview.value = suggestion; preview.hidden = false; generateButton.disabled = false; applyButton.disabled = false; }
            } catch (error) {
                connectionStatus.textContent = `🔴 ${error.message}`; aiResults.replaceChildren(createElement("p", { text: "Die lokale Prüfung und alle übrigen Funktionen bleiben verfügbar." }));
            } finally { checkButton.disabled = false; }
        });
        generateButton.addEventListener("click", () => {
            const suggestion = generateSuggestedComment(lastResult);
            preview.value = suggestion; preview.hidden = !suggestion; applyButton.disabled = !suggestion;
        });
        applyButton.addEventListener("click", async () => { try { const applied = await applySuggestedComment(preview.value, commentTextArea); if (applied) connectionStatus.textContent = "Kommentarvorschlag übernommen, aber nicht gespeichert oder abgesendet."; } catch (error) { connectionStatus.textContent = `🔴 ${error.message}`; } });
        feedbackButton.addEventListener("click", () => renderFeedbackDialog({ reportData: lastReportData, localIssues: lastLocalIssues, aiResult: lastResult, profile, requestDurationMs: lastRequestDurationMs }));
        settingsButton.addEventListener("click", () => renderAiSettings(() => renderAiPanel(commentTextArea, insertionTarget, beforeElement)));
        if (insertionTarget && beforeElement && beforeElement.parentNode === insertionTarget) insertionTarget.insertBefore(panel, beforeElement);
        else if (insertionTarget) insertionTarget.appendChild(panel); else document.body.appendChild(panel);
    }

    function appendMarker(input, symbol, message) {
        if (!input) return;
        const label = input.id ? document.querySelector(`label[for="${cssEscape(input.id)}"]`) : null;
        if (label && !label.textContent.includes(symbol)) label.append(` ${symbol}`);
        input.title = `${input.title || ""}${message} `;
    }

    function enhanceReportListPage() {
        const wantedFilterOption = 3;
        const filterDropdown = document.querySelector("select#status");
        const filterButton = document.querySelector("#tfil_rstg_ > fieldset > span > input:nth-child(1)");
        if (filterDropdown && filterButton && filterDropdown.selectedIndex === 0) { filterDropdown.selectedIndex = wantedFilterOption; filterButton.click(); return; }
        const viewPos = 1; const acceptPos = 2; const rejectPos = 4;
        const allLinksAtPosition = position => `tbody > tr > .std:nth-child(7) > .btn-group > #ilAdvSelListTable_asl_ > li:nth-child(${position}) > a`;
        const selectorForRow = row => `tbody > tr:nth-child(${row}) > .std:nth-child(7) > .btn-group > #ilAdvSelListTable_asl_ > li:nth-child(${viewPos}) > a`;
        document.querySelectorAll(`${allLinksAtPosition(acceptPos)}, ${allLinksAtPosition(rejectPos)}`).forEach(link => {
            link.href = "javascript:void(0)"; link.style.textDecoration = "line-through"; link.title = "Hier wurde für Dich ein Aus-Versehen-Klick deaktiviert 💚";
        });
        let nextRow = 1;
        const rowIfExists = row => { const element = document.querySelector(selectorForRow(row)); if (!element) window.alert("Alle Zeilen auf dieser Seite wurden bearbeitet!\nNeu laden tut gut 😉"); return element; };
        const bar = document.querySelector("#tfil_rstg_ > fieldset > span"); if (!bar) return;
        const insertButton = (title, handler, tooltip) => {
            const button = createElement("input", { type: "button", value: title, title: tooltip }); button.className = "btn btn-default"; button.style.marginLeft = "4px"; button.addEventListener("click", handler); bar.appendChild(button); return button;
        };
        insertButton("▶️", () => { const row = rowIfExists(nextRow); if (row) window.open(row.href, "_self"); }, "Nächstes Berichtsheft in diesem Fenster öffnen");
        let newTabButton;
        newTabButton = insertButton("⤴️", () => { const row = rowIfExists(nextRow); if (!row) return; nextRow++; newTabButton.value = `⤴️ (${nextRow})`; window.open(row.href, "_blank"); }, "Nächstes Berichtsheft in neuem Tab öffnen");
        if (filterDropdown && filterDropdown.selectedIndex !== wantedFilterOption) {
            const warning = createElement("span", { text: "⚠️", title: "Du bist nicht bei den eingereichten Berichtsheften. Bitte prüfe den gewählten Filter." }); warning.style.marginLeft = "3px"; bar.appendChild(warning);
        }
    }

    function runLegacyDomValidations() {
        let hasWarnings = false; let hasPOIs = false;
        document.querySelectorAll('input[name*="_text"], textarea[name*="_text"]').forEach(input => {
            commentPOIs.forEach(poi => {
                if (!String(input.value || "").toLocaleLowerCase("de-DE").includes(poi.toLocaleLowerCase("de-DE"))) return;
                appendMarker(input, "🔎", `🔎 Enthält „${poi}“.`); hasPOIs = true;
            });
        });
        const weekNumberInput = document.querySelector('input[aria-label="Berichtsnummer"], #number');
        if (weekNumberInput && !/^\d{3}$/.test(weekNumberInput.value.trim())) { appendMarker(weekNumberInput, "⚠️", `⚠️ ${reportNumberMessage(weekNumberInput.value)}`); hasWarnings = true; }
        let accumulatedHours = 0;
        document.querySelectorAll('input[aria-label="Stunden / UE"]').forEach(input => {
            const number = parseHours(input.value); if (number !== null) accumulatedHours += number;
            if (number !== null && number !== 0 && number !== 8 && number !== 10) { appendMarker(input, "⚠️", "⚠️ Ist die teilnehmende Person in Teilzeit? St/UE sind nicht 0, 8 oder 10."); hasWarnings = true; }
        });
        const totalInput = document.querySelector("#total_hours"); const total = parseHours(totalInput && totalInput.value);
        if (totalInput && total !== null && total % 8 !== 0 && total % 10 !== 0) { appendMarker(totalInput, "⚠️", "⚠️ St/UE sind weder durch 8 noch durch 10 teilbar."); hasWarnings = true; }
        if (totalInput && total !== null && Math.abs(total - accumulatedHours) > 0.001) { appendMarker(totalInput, "⚠️", "⚠️ Die St/UE-Summe stimmt nicht mit den Tageseinträgen überein."); hasWarnings = true; }
        if (hasWarnings || hasPOIs) {
            const container = document.querySelector("#form_ > div > div.ilFormFooter.clearfix > div.col-sm-6.ilFormCmds"); const firstButton = container && container.querySelector("input:nth-child(1)");
            if (container) { const symbols = `${hasWarnings ? "⚠️" : ""}${hasPOIs ? "🔎" : ""}`; const summary = createElement("span", { text: `${symbols} `, title: `Siehe ${symbols}: Bitte die markierten Stellen manuell prüfen.` }); container.insertBefore(summary, firstButton || null); }
        }
    }

    function enhanceSingleReportPage() {
        document.querySelectorAll('input[name="cmd[reportstrainer.saveaccept]"]').forEach(button => { button.value = "✅ Annehmen"; });
        document.querySelectorAll('input[name="cmd[reportstrainer.savereject]"]').forEach(button => { button.value = "👎 Zurückgeben"; });
        const commentTextArea = document.querySelector("#remarks"); const bottomButtons = document.querySelector("#form_ > div > div.ilFormFooter.clearfix");
        const commentContainer = commentTextArea && commentTextArea.parentNode && commentTextArea.parentNode.parentNode ? commentTextArea.parentNode.parentNode.parentNode : null;
        runLegacyDomValidations(); renderAiPanel(commentTextArea, commentContainer, bottomButtons);
    }

    function initialize() {
        injectStyles();
        const params = new URLSearchParams(location.search);
        const isParamPath = value => params.get("cmd") === value || params.get("fallbackCmd") === value;
        if (isParamPath("reportstrainer.list")) enhanceReportListPage();
        if (isParamPath("reportstrainer.viewreport")) enhanceSingleReportPage();
        if (isParamPath("reportstrainer.list") || isParamPath("reportstrainer.viewreport")) renderSettingsLauncher(() => window.location.reload());
    }

    const testExports = {
        DEFAULT_SYSTEM_PROMPT, PREVIOUS_DEFAULT_SYSTEM_PROMPT, PRE_MODULE_DEFAULT_SYSTEM_PROMPT, LEGACY_DEFAULT_SYSTEM_PROMPT, cloneDefaultProfile, defaultAiSettings, normalizeProfile, normalizeCourse, normalizeAiSettings,
        loadAiConfig, saveAiConfig, getAiProfiles, saveAiProfiles, getActiveAiProfile, getActiveCourse,
        selectedModel, joinUrl, buildAuthHeaders, gmRequest, classifyHttpError,
        parseModelsResponse, parseLmStudioModelsResponse, normalizeReasoningCapabilities, getAvailableModels, getLmStudioModels, getModelsForProfile, testAiConnection, detectDayIndex, parseHours, parseDateValue,
        normalizeDateValue, calculateCourseWeek, formatExpectedReportNumber, getGermanHolidays, getHolidaysInRange, extractReportPeriod,
        extractReportData, normalizedEntry, reportNumberMessage, validateReport, buildAiSystemPrompt, getSelectedReasoning, getReasoningRequestParameters, buildAiRequest, extractNativeLmStudioContent, callAi, extractJsonText,
        normalizeAiIssue, getAiIssueCount, hasNoAiIssues, parseAiResponse, generateSuggestedComment, createClientFingerprint, feedbackAiResult, buildFeedbackPayload, sendFeedbackPayload, canRunAiEvaluation,
        renderLocalResults, renderAiResults, isPrivateOrLocalHost, displayHost
    };
    if (typeof module !== "undefined" && module.exports) { module.exports = testExports; return; }
    initialize();
})();
