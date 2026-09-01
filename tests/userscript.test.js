"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    DEFAULT_SYSTEM_PROMPT,
    LEGACY_DEFAULT_SYSTEM_PROMPT,
    defaultAiSettings,
    normalizeCourse,
    normalizeAiSettings,
    loadAiConfig,
    saveAiConfig,
    getActiveAiProfile,
    joinUrl,
    buildAuthHeaders,
    testAiConnection,
    classifyHttpError,
    parseModelsResponse,
    parseLmStudioModelsResponse,
    normalizeReasoningCapabilities,
    detectDayIndex,
    parseHours,
    normalizeDateValue,
    calculateCourseWeek,
    formatExpectedReportNumber,
    getGermanHolidays,
    getHolidaysInRange,
    extractReportPeriod,
    extractReportData,
    reportNumberMessage,
    validateReport,
    buildAiSystemPrompt,
    getSelectedReasoning,
    getReasoningRequestParameters,
    buildAiRequest,
    callAi,
    parseAiResponse,
    getAiIssueCount,
    hasNoAiIssues,
    renderLocalResults,
    renderAiResults,
    generateSuggestedComment,
    isPrivateOrLocalHost,
    displayHost
} = require("../wbs-report-portfolio-de-monkey-fier.user.js");

const userscriptPath = path.join(__dirname, "..", "wbs-report-portfolio-de-monkey-fier.user.js");
const userscriptSource = fs.readFileSync(userscriptPath, "utf8");

const tests = [];
const test = (name, callback) => tests.push({ name, callback });

test("liefert die LM-Studio-Gateway-Standardkonfiguration ohne eingebettetes Token", () => {
    const settings = defaultAiSettings();
    assert.equal(settings.enabled, true);
    assert.equal(settings.profiles[0].baseUrl, "https://llm.nik0.de");
    assert.equal(settings.profiles[0].chatEndpoint, "/v1/chat/completions");
    assert.equal(settings.profiles[0].modelsEndpoint, "/v1/models");
    assert.equal(settings.profiles[0].timeout, 900000);
    assert.equal(settings.profiles[0].maxTokens, 500);
    assert.equal(settings.profiles[0].authType, "bearer");
    assert.equal(settings.profiles[0].token, "");
});

test("normalisiert Profile und setzt ein gültiges aktives Profil", () => {
    const settings = normalizeAiSettings({
        activeProfileId: "nicht-vorhanden",
        profiles: [{ id: "test", name: "Test", baseUrl: "http://localhost:1234/", timeout: 5 }]
    });
    assert.equal(settings.activeProfileId, "test");
    assert.equal(settings.profiles[0].baseUrl, "http://localhost:1234");
    assert.equal(settings.profiles[0].timeout, 900000);
    assert.equal(getActiveAiProfile(settings).id, "test");
});

test("normalisiert fehlende oder ungültige Reasoning-Werte auf Automatisch", () => {
    const defaults = normalizeAiSettings({ profiles: [{ id: "ohne-reasoning" }] });
    assert.equal(defaults.profiles[0].reasoningMode, "auto");
    assert.equal(defaults.profiles[0].reasoningEffort, "medium");
    const invalid = normalizeAiSettings({ profiles: [{ id: "ungültig", reasoningMode: "nonsense", reasoningEffort: "extreme" }] });
    assert.equal(invalid.profiles[0].reasoningMode, "auto");
    assert.equal(invalid.profiles[0].reasoningEffort, "medium");
});

test("migriert frühere Standard-Timeouts einmalig auf fünfzehn Minuten", () => {
    const oldSettings = normalizeAiSettings({
        schemaVersion: 1,
        profiles: [{ id: "alt", name: "Alt", timeout: 60000 }]
    });
    assert.equal(oldSettings.schemaVersion, 5);
    assert.equal(oldSettings.profiles[0].timeout, 900000);

    const currentSettings = normalizeAiSettings({
        schemaVersion: 2,
        profiles: [{ id: "bewusst", name: "Bewusst", timeout: 60000 }]
    });
    assert.equal(currentSettings.profiles[0].timeout, 60000);

    const fiveMinuteSettings = normalizeAiSettings({
        schemaVersion: 3,
        profiles: [{ id: "alt-fünf", name: "Alt fünf", timeout: 300000 }]
    });
    assert.equal(fiveMinuteSettings.profiles[0].timeout, 900000);

    const storage = new Map([["wbsDeMonkeyFier.ai.settings.v1", {
        schemaVersion: 1,
        profiles: [{ id: "gespeichert", name: "Gespeichert", timeout: 60000 }]
    }]]);
    global.GM_getValue = (key, fallback) => storage.has(key) ? storage.get(key) : fallback;
    global.GM_setValue = (key, value) => storage.set(key, value);
    assert.equal(loadAiConfig().profiles[0].timeout, 900000);
    assert.equal(storage.get("wbsDeMonkeyFier.ai.settings.v1").schemaVersion, 5);
    delete global.GM_getValue;
    delete global.GM_setValue;
});

test("aktualisiert nur den früheren Standardprompt und erhält eigene Prompts", () => {
    const migrated = normalizeAiSettings({ schemaVersion: 2, systemPrompt: LEGACY_DEFAULT_SYSTEM_PROMPT, profiles: [defaultAiSettings().profiles[0]] });
    assert.equal(migrated.systemPrompt, DEFAULT_SYSTEM_PROMPT);
    assert.notEqual(migrated.systemPrompt, LEGACY_DEFAULT_SYSTEM_PROMPT);

    const customPrompt = "Mein bewusst angepasster Systemprompt mit neuem Schema.";
    const preserved = normalizeAiSettings({ schemaVersion: 2, systemPrompt: customPrompt, profiles: [defaultAiSettings().profiles[0]] });
    assert.equal(preserved.systemPrompt, customPrompt);
});

test("mischt getrennt gespeicherte Tokens wieder in Profile ein", () => {
    const settings = normalizeAiSettings({ profiles: [{ id: "secret-profile", name: "Secret" }] }, { "secret-profile": "nur-lokal" });
    assert.equal(settings.profiles[0].token, "nur-lokal");
});

test("speichert Tokens getrennt von normalen Profileinstellungen", () => {
    const storage = new Map();
    global.GM_setValue = (key, value) => storage.set(key, value);
    global.GM_getValue = (key, fallback) => storage.has(key) ? storage.get(key) : fallback;
    const settings = defaultAiSettings();
    settings.profiles[0].token = "streng-geheim";
    settings.profiles[0].authType = "bearer";
    saveAiConfig(settings);
    const publicSettings = storage.get("wbsDeMonkeyFier.ai.settings.v1");
    const secrets = storage.get("wbsDeMonkeyFier.ai.secrets.v1");
    assert.equal(JSON.stringify(publicSettings).includes("streng-geheim"), false);
    assert.equal(secrets["lmstudio-main"], "streng-geheim");
    assert.equal(loadAiConfig().profiles[0].token, "streng-geheim");
    delete global.GM_setValue;
    delete global.GM_getValue;
});

test("baut Endpunkt-URLs ohne doppelte Schrägstriche", () => {
    assert.equal(joinUrl("http://localhost:1234/", "/v1/models"), "http://localhost:1234/v1/models");
    assert.throws(() => joinUrl("file:///tmp/model", "/v1/models"), /HTTP und HTTPS/);
});

test("erzeugt Authentifizierungsheader ohne Tokens preiszugeben", () => {
    assert.deepEqual(buildAuthHeaders({ authType: "none", token: "" }), {});
    assert.deepEqual(buildAuthHeaders({ authType: "bearer", token: "abc" }), { Authorization: "Bearer abc" });
    assert.deepEqual(buildAuthHeaders({ authType: "api-key", token: "abc" }), { "X-API-Key": "abc" });
    assert.throws(() => buildAuthHeaders({ authType: "bearer", token: "" }), /kein Token/);
});

test("klassifiziert relevante HTTP-Fehler verständlich", () => {
    assert.match(classifyHttpError(401).message, /Authentifizierung/);
    assert.match(classifyHttpError(404).message, /Endpunkt/);
    assert.match(classifyHttpError(504).message, /serverseitigen Zeitlimits/);
    assert.equal(classifyHttpError(200), null);
});

test("testet Modellverbindung, Authentifizierungsfehler und Timeout über die Userscript-API", async () => {
    const profile = { ...defaultAiSettings().profiles[0], authType: "none" };
    global.GM_xmlhttpRequest = options => options.onload({ status: 200, responseText: '{"data":[{"id":"modell-a"}]}' });
    const connected = await testAiConnection(profile, { debug: false });
    assert.equal(connected.ok, true);
    assert.deepEqual(connected.models, ["modell-a"]);

    global.GM_xmlhttpRequest = options => options.onload({ status: 401, responseText: "" });
    const unauthorized = await testAiConnection(profile, { debug: false });
    assert.equal(unauthorized.ok, false);
    assert.match(unauthorized.message, /Authentifizierung fehlgeschlagen/);

    global.GM_xmlhttpRequest = options => options.ontimeout();
    const timedOut = await testAiConnection(profile, { debug: false });
    assert.equal(timedOut.ok, false);
    assert.match(timedOut.message, /Browser.*abgebrochen/);
    delete global.GM_xmlhttpRequest;
});

test("liest OpenAI-, Ollama-ähnliche und einfache Modelllisten", () => {
    assert.deepEqual(parseModelsResponse('{"data":[{"id":"b"},{"id":"a"}]}'), ["a", "b"]);
    assert.deepEqual(parseModelsResponse('{"models":[{"name":"llama"}]}'), ["llama"]);
    assert.deepEqual(parseModelsResponse('["x","x","y"]'), ["x", "y"]);
    assert.throws(() => parseModelsResponse("kein json"), /kein gültiges JSON/);
    assert.throws(() => parseModelsResponse("{}"), /keine Modellliste/);
});

test("liest LM-Studio-Capabilities ohne Modellnamen zu erraten", () => {
    const models = parseLmStudioModelsResponse(JSON.stringify({ models: [
        { key: "google/gemma", display_name: "Gemma", capabilities: { reasoning: { allowed_options: ["low", "medium"], default: "medium" } } },
        { key: "plain-model", capabilities: {} }
    ] }));
    assert.deepEqual(models[0].capabilities.allowedOptions, ["low", "medium"]);
    assert.equal(models[0].capabilities.default, "medium");
    assert.equal(models[1].capabilities.supported, false);
    assert.deepEqual(normalizeReasoningCapabilities({ reasoning: { allowed_options: ["unknown", "high"] } }, "x").allowedOptions, ["high"]);
});

test("verarbeitet deutsche Dezimalstunden", () => {
    assert.equal(parseHours("7,5"), 7.5);
    assert.equal(parseHours(""), null);
    assert.equal(parseHours("acht"), null);
});

test("berechnet alle deutschen Feiertagsvarianten vollständig lokal", () => {
    const holidays = getGermanHolidays(2026);
    const byName = Object.fromEntries(holidays.map(holiday => [holiday.name, holiday]));
    assert.equal(byName["Karfreitag"].date, "2026-04-03");
    assert.equal(byName["Ostermontag"].date, "2026-04-06");
    assert.equal(byName["Christi Himmelfahrt"].date, "2026-05-14");
    assert.equal(byName["Pfingstmontag"].date, "2026-05-25");
    assert.equal(byName["Fronleichnam"].date, "2026-06-04");
    assert.equal(byName["Augsburger Friedensfest"].scope, "Stadt Augsburg");
    assert.equal(byName["Buß- und Bettag"].date, "2026-11-18");
    assert.equal(getGermanHolidays(2025).some(holiday => holiday.date === "2025-05-08" && holiday.scope.includes("Berlin")), true);
    assert.equal(getGermanHolidays(2028).some(holiday => holiday.date === "2028-06-17" && holiday.scope.includes("Berlin")), true);
    assert.equal(getHolidaysInRange("2026-04-01", "2026-04-07").length, 3);
});

test("normalisiert Kursstarts und berechnet Kurswochen ab Montag", () => {
    assert.deepEqual(normalizeCourse({ id: "kurs-a", name: "Kurs A", startDate: "12.01.2026" }), { id: "kurs-a", name: "Kurs A", startDate: "2026-01-12" });
    assert.equal(normalizeDateValue("31.02.2026"), "");
    assert.equal(calculateCourseWeek("2026-01-14", "2026-01-12"), 1);
    assert.equal(calculateCourseWeek("2026-01-14", "2026-01-19"), 2);
    assert.equal(formatExpectedReportNumber("2026-01-14", "2026-04-13"), "014");
});

test("erkennt Berichtszeiträume anhand typischer Datumsfelder", () => {
    const inputs = [
        { id: "date_from", name: "date_from", value: "13.04.2026", getAttribute: () => "Von" },
        { id: "date_to", name: "date_to", value: "17.04.2026", getAttribute: () => "Bis" }
    ];
    const root = { querySelectorAll: () => inputs, querySelector: () => null };
    assert.deepEqual(extractReportPeriod(root), { periodStart: "2026-04-13", periodEnd: "2026-04-17" });
});

test("ordnet Felder anhand direkter Wochentagsmerkmale vor Containertext zu", () => {
    const input = {
        id: "dienstag_hours",
        name: "dienstag_hours",
        getAttribute: () => "Stunden / UE",
        closest: () => ({ textContent: "Montag Dienstag" })
    };
    assert.equal(detectDayIndex(input), 1);
});

test("extrahiert ausschließlich minimierte Berichtsdaten aus dem DOM-Vertrag", () => {
    const makeField = (id, name, value, ariaLabel = "") => ({
        id, name, value,
        getAttribute: attribute => attribute === "aria-label" ? ariaLabel : "",
        closest: () => ({ textContent: id })
    });
    const number = makeField("number", "number", "034", "Berichtsnummer");
    const total = makeField("total_hours", "total_hours", "16");
    const hours = [makeField("montag_hours", "montag_hours", "8", "Stunden / UE"), makeField("dienstag_hours", "dienstag_hours", "8", "Stunden / UE")];
    const entries = [makeField("montag_text_1", "montag_text_1", "Testumgebung konfiguriert"), makeField("dienstag_text_1", "dienstag_text_1", "Server")];
    const root = {
        querySelector: selector => selector.includes("Berichtsnummer") ? number : selector === "#total_hours" ? total : null,
        querySelectorAll: selector => selector.includes("Stunden / UE") ? hours : entries
    };
    const report = extractReportData(root);
    assert.deepEqual(report, {
        reportNumber: "034",
        totalHours: 16,
        days: [
            { weekday: "Montag", hours: 8, entries: ["Testumgebung konfiguriert"] },
            { weekday: "Dienstag", hours: 8, entries: ["Server"] }
        ]
    });
    assert.equal(JSON.stringify(report).includes("E-Mail"), false);
});

test("überträgt leere Wochenenden nicht, behält echte Wochenendeinträge aber bei", () => {
    const makeField = (id, name, value, ariaLabel = "") => ({
        id, name, value,
        getAttribute: attribute => attribute === "aria-label" ? ariaLabel : "",
        closest: () => ({ textContent: id })
    });
    const dayIds = ["montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag"];
    const hours = dayIds.map((day, index) => makeField(`${day}_hours`, `${day}_hours`, index < 5 ? "8" : "0", "Stunden / UE"));
    const entries = dayIds.map((day, index) => makeField(`${day}_text_1`, `${day}_text_1`, index < 5 ? `Konkrete Tätigkeit ${index + 1} nachvollziehbar bearbeitet` : ""));
    const root = {
        querySelector: selector => selector.includes("Berichtsnummer") ? makeField("number", "number", "014", "Berichtsnummer") : selector === "#total_hours" ? makeField("total_hours", "total_hours", "40") : null,
        querySelectorAll: selector => selector.includes("Stunden / UE") ? hours : entries
    };
    const report = extractReportData(root);
    assert.deepEqual(report.days.map(day => day.weekday), ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"]);
    assert.equal(JSON.stringify(report).includes("Samstag"), false);
    assert.equal(JSON.stringify(report).includes("Sonntag"), false);

    entries[5].value = "Plausible Tätigkeit am Samstag dokumentiert";
    const reportWithSaturday = extractReportData(root);
    assert.equal(reportWithSaturday.days.some(day => day.weekday === "Samstag"), true);
    assert.equal(validateReport(reportWithSaturday).some(issue => issue.type === "weekend_entry"), true);
});

test("ergänzt Feiertage im erkannten Berichtszeitraum ohne externe API", () => {
    const makeField = (id, name, value, ariaLabel = "") => ({
        id, name, value,
        getAttribute: attribute => attribute === "aria-label" ? ariaLabel : "",
        closest: () => ({ textContent: id })
    });
    const dateFrom = makeField("date_from", "date_from", "30.03.2026", "Von");
    const dateTo = makeField("date_to", "date_to", "03.04.2026", "Bis");
    const dayIds = ["montag", "dienstag", "mittwoch", "donnerstag", "freitag"];
    const hours = dayIds.map(day => makeField(`${day}_hours`, `${day}_hours`, day === "freitag" ? "0" : "8", "Stunden / UE"));
    const entries = dayIds.map(day => makeField(`${day}_text_1`, `${day}_text_1`, day === "freitag" ? "" : `Konkrete Tätigkeit für ${day} dokumentiert`));
    const root = {
        querySelector: selector => selector.includes("Berichtsnummer") ? makeField("number", "number", "001", "Berichtsnummer") : selector === "#total_hours" ? makeField("total_hours", "total_hours", "32") : null,
        querySelectorAll: selector => selector === "input" ? [dateFrom, dateTo, ...hours, ...entries] : selector.includes("Stunden / UE") ? hours : entries
    };
    const report = extractReportData(root);
    assert.equal(report.periodStart, "2026-03-30");
    assert.equal(report.periodEnd, "2026-04-03");
    assert.equal(report.holidays.some(holiday => holiday.name === "Karfreitag"), true);
    assert.equal(report.days.find(day => day.weekday === "Freitag").holiday.name, "Karfreitag");
    assert.match(report.holidayPolicy, /schulungsfrei/);
    assert.deepEqual(validateReport(report).filter(issue => issue.day === "Freitag"), []);
});

test("behandelt einen benannten gesetzlichen Feiertag mit 0 UE als neutral", () => {
    const issues = validateReport({
        reportNumber: "001",
        totalHours: 0,
        days: [{
            weekday: "Freitag",
            hours: 0,
            entries: ["Karfreitag"],
            holiday: { name: "Karfreitag", scope: "bundesweit" }
        }]
    });
    assert.deepEqual(issues, []);
});

test("findet lokale Auffälligkeiten unabhängig von einer KI", () => {
    const issues = validateReport({
        reportNumber: "9",
        totalHours: 23,
        days: [
            { weekday: "Montag", hours: 8, entries: [] },
            { weekday: "Dienstag", hours: 0, entries: ["Server"] },
            { weekday: "Mittwoch", hours: 7, entries: ["Projektarbeit"] },
            { weekday: "Donnerstag", hours: 8, entries: ["Projektarbeit"] },
            { weekday: "Freitag", hours: 0, entries: ["krank"] },
            { weekday: "Samstag", hours: 0, entries: ["Nacharbeit"] }
        ]
    });
    const types = new Set(issues.map(issue => issue.type));
    ["hours_without_entries", "entries_without_hours", "too_short", "unusual_hours", "duplicate", "weekend_entry", "keyword", "invalid_report_number"].forEach(type => assert.equal(types.has(type), true, type));
});

test("behandelt FPA, Prüfung, Test, Wiederholung und Vorbereitung als neutrale Begriffe", () => {
    const issues = validateReport({
        reportNumber: "14",
        totalHours: 40,
        days: [
            { weekday: "Montag", hours: 8, entries: ["FPA: Praktische Angriffsszenarien analysiert und TOMs abgeleitet."] },
            { weekday: "Dienstag", hours: 8, entries: ["Bausteinprüfung geschrieben und Ergebnisse anschließend besprochen."] },
            { weekday: "Mittwoch", hours: 8, entries: ["Testsimulation mit mehreren Multiple Choice Fragen durchgeführt."] },
            { weekday: "Donnerstag", hours: 8, entries: ["Wiederholung der Netzwerkgrundlagen anhand konkreter Übungen."] },
            { weekday: "Freitag", hours: 8, entries: ["Vorbereitung einer dokumentierten Präsentation zum Datenschutz."] }
        ]
    });
    assert.equal(issues.length, 1);
    assert.equal(issues[0].type, "invalid_report_number");
    assert.equal(issues[0].message, "Bitte die Berichtsnummer dreistellig als 014 eintragen.");
    assert.equal(reportNumberMessage("7"), "Bitte die Berichtsnummer dreistellig als 007 eintragen.");
});

test("gleicht Berichtsnummern mit dem aktiven Kursstart ab", () => {
    const baseReport = {
        totalHours: 8,
        periodStart: "2026-01-19",
        days: [{ weekday: "Montag", hours: 8, entries: ["Konkrete Tätigkeit nachvollziehbar dokumentiert"] }]
    };
    const course = { id: "kurs-a", name: "Kurs A", startDate: "2026-01-12" };
    assert.equal(validateReport({ ...baseReport, reportNumber: "002" }, undefined, course).some(issue => issue.type === "unexpected_report_number"), false);
    const mismatched = validateReport({ ...baseReport, reportNumber: "004" }, undefined, course);
    assert.equal(mismatched.some(issue => issue.type === "unexpected_report_number" && issue.message.includes("002")), true);
    const onlyFormatting = validateReport({ ...baseReport, reportNumber: "2" }, undefined, course);
    assert.deepEqual(onlyFormatting.map(issue => issue.type), ["invalid_report_number"]);
});

test("findet Abwesenheiten mit positiven Stunden und inkonsistente Summen", () => {
    const issues = validateReport({
        reportNumber: "001",
        totalHours: 40,
        days: [{ weekday: "Montag", hours: 8, entries: ["Krank mit Attest"] }]
    });
    assert.equal(issues.some(issue => issue.type === "absence_with_hours"), true);
    assert.equal(issues.some(issue => issue.type === "inconsistent_total"), true);
});

test("erkennt ein vollständig leeres Berichtsheft", () => {
    assert.equal(validateReport({ days: [] }).some(issue => issue.type === "empty_report"), true);
});

test("baut eine minimierte und ausgabebegrenzte Chat-Completions-Anfrage", () => {
    const profile = { model: "lokales-modell", manualModel: "", temperature: 0.2, maxTokens: 500 };
    const report = { reportNumber: "034", totalHours: 8, days: [{ weekday: "Montag", hours: 8, entries: ["Testumgebung konfiguriert"] }] };
    const request = buildAiRequest(report, profile, { systemPrompt: DEFAULT_SYSTEM_PROMPT });
    assert.equal(request.model, "lokales-modell");
    assert.equal(request.max_tokens, 500);
    assert.equal(request.messages.length, 2);
    assert.equal(request.messages[1].content.includes("Max Mustermann"), false);
    assert.equal(request.messages[1].content.includes("Testumgebung konfiguriert"), true);
    assert.throws(() => buildAiRequest(report, { model: "", manualModel: "" }, { systemPrompt: DEFAULT_SYSTEM_PROMPT }), /Kein KI-Modell/);
});

test("baut für LM Studio native Chat-Anfragen mit erlaubtem Reasoning", () => {
    const profile = {
        provider: "lm-studio", model: "gemma", manualModel: "", temperature: 0.2, maxTokens: 1000,
        reasoning: "medium", reasoningCapabilities: normalizeReasoningCapabilities({ reasoning: { allowed_options: ["low", "medium"], default: "medium" } }, "gemma")
    };
    const report = { days: [{ weekday: "Montag", hours: 8, entries: ["Konkrete Tätigkeit"] }] };
    const request = buildAiRequest(report, profile, { systemPrompt: "Prompt" });
    assert.equal(request.max_output_tokens, 1000);
    assert.equal(request.reasoning, "medium");
    assert.equal(Object.prototype.hasOwnProperty.call(request, "messages"), false);
    const automatic = buildAiRequest(report, { ...profile, reasoning: "auto" }, { systemPrompt: "Prompt" });
    assert.equal(Object.prototype.hasOwnProperty.call(automatic, "reasoning"), false);
    assert.equal(getSelectedReasoning({ ...profile, reasoning: "low" }), "low");
});

test("wendet Reasoning nur provider- und modellabhängig an", () => {
    const base = { provider: "openai-compatible", model: "o3-mini", manualModel: "", reasoningMode: "on", reasoningEffort: "high" };
    assert.deepEqual(getReasoningRequestParameters(base), { reasoning_effort: "high" });
    assert.deepEqual(getReasoningRequestParameters({ ...base, reasoningMode: "auto" }), {});
    assert.deepEqual(getReasoningRequestParameters({ ...base, model: "gpt-5.1", reasoningMode: "off" }), { reasoning_effort: "none" });
    assert.deepEqual(getReasoningRequestParameters({ ...base, reasoningMode: "off" }), {});
    assert.deepEqual(getReasoningRequestParameters({ ...base, provider: "custom" }), {});

    const lmProfile = { provider: "lm-studio", model: "openai/gpt-oss-20b", chatEndpoint: "/v1/chat/completions", reasoningMode: "on", reasoningEffort: "low" };
    assert.deepEqual(getReasoningRequestParameters(lmProfile), {});
    assert.match(buildAiSystemPrompt({ systemPrompt: "Mein Prompt" }, lmProfile), /Reasoning: low/);
    assert.equal(buildAiSystemPrompt({ systemPrompt: "Mein Prompt" }, { ...lmProfile, reasoningMode: "auto" }), "Mein Prompt");
});

test("parst valides JSON und Markdown-Codeblöcke", () => {
    const direct = parseAiResponse('{"status":"ok","summary":"Passt","issues":[],"suggestedComment":""}');
    assert.equal(direct.status, "ok");
    const fenced = parseAiResponse('```json\n{"status":"warning","summary":"Hinweis","issues":[{"day":"Dienstag","message":"Genauer beschreiben"}]}\n```');
    assert.equal(fenced.issues[0].day, "Dienstag");
    assert.throws(() => parseAiResponse("keine strukturierte Antwort"), /kein gültiges JSON/);
});

test("priorisiert und normalisiert das neue strukturierte KI-Antwortschema", () => {
    const parsed = parseAiResponse(JSON.stringify({
        status: "warning",
        summary: "Formale Auffälligkeiten im Bericht.",
        formalIssues: ["Bitte die Berichtsnummer dreistellig als 014 eintragen."],
        contentIssues: [{ day: "Dienstag", type: "too_generic", original: "Projektarbeit", message: "Die Tätigkeit ist zu allgemein.", suggestion: "Bitte kurz angeben, welche Tätigkeit durchgeführt wurde." }],
        hourIssues: [{ day: "Freitag", message: "Die Stundenangabe sollte geprüft werden." }],
        notes: ["FPA wurde nachvollziehbar beschrieben."],
        issues: [{ day: "Legacy", message: "Dieser Fallback darf nicht zusätzlich erscheinen." }],
        suggestedComment: "Bitte die Berichtsnummer korrigieren."
    }));
    assert.equal(parsed.usesStructuredSchema, true);
    assert.equal(parsed.formalIssues[0].message, "Bitte die Berichtsnummer dreistellig als 014 eintragen.");
    assert.equal(parsed.contentIssues[0].day, "Dienstag");
    assert.equal(parsed.hourIssues.length, 1);
    assert.equal(parsed.notes.length, 1);
    assert.equal(parsed.issues.some(issue => issue.day === "Legacy"), false);
    assert.equal(getAiIssueCount(parsed), 3);
    assert.equal(hasNoAiIssues(parsed), false);
});

test("meldet nur bei Status ok und leeren Auffälligkeitsarrays keine Auffälligkeiten", () => {
    const okay = parseAiResponse('{"status":"ok","formalIssues":[],"contentIssues":[],"hourIssues":[],"notes":["Neutraler Hinweis"],"suggestedComment":""}');
    assert.equal(getAiIssueCount(okay), 0);
    assert.equal(hasNoAiIssues(okay), true);
    assert.equal(okay.summary, "Keine Auffälligkeiten gemeldet.");

    const warning = parseAiResponse('{"status":"warning","summary":"Formale Auffälligkeiten im Bericht.","formalIssues":["Berichtsnummer korrigieren."],"contentIssues":[],"hourIssues":[],"notes":[]}');
    assert.equal(hasNoAiIssues(warning), false);
    assert.equal(getAiIssueCount(warning), 1);

    const emptyWarning = parseAiResponse('{"status":"warning","formalIssues":[],"contentIssues":[],"hourIssues":[],"notes":[]}');
    assert.equal(hasNoAiIssues(emptyWarning), false);
    assert.equal(emptyWarning.summary.includes("Keine Auffälligkeiten"), false);
});

test("rendert strukturierte Bereiche widerspruchsfrei und Inhalt nach Wochentag", () => {
    class FakeElement {
        constructor(tag) { this.tag = tag; this.children = []; this.textContent = ""; this.className = ""; }
        appendChild(child) { this.children.push(child); return child; }
        replaceChildren(...children) { this.children = children; }
    }
    global.document = { createElement: tag => new FakeElement(tag) };
    const container = new FakeElement("div");
    const result = parseAiResponse(JSON.stringify({
        status: "warning",
        summary: "Formale Auffälligkeiten im Bericht.",
        formalIssues: ["Bitte die Berichtsnummer dreistellig als 014 eintragen."],
        contentIssues: [
            { day: "Freitag", type: "missing_information", message: "Freitag ergänzen.", suggestion: "Thema kurz nennen." },
            { day: "Dienstag", type: "too_generic", original: "Projektarbeit", message: "Dienstag ergänzen." }
        ],
        hourIssues: ["Gesamtstunden prüfen."],
        notes: ["FPA ist hier nur ein neutraler Hinweis."],
        suggestedComment: ""
    }));
    renderAiResults(container, result);
    const flattenText = element => [element.textContent, ...element.children.flatMap(child => flattenText(child))].filter(Boolean);
    const texts = flattenText(container);
    const combined = texts.join(" | ");
    assert.equal(combined.includes("Formale Auffälligkeiten"), true);
    assert.equal(combined.includes("Stunden / UE"), true);
    assert.equal(combined.includes("Hinweise"), true);
    assert.equal(combined.includes("KI-Auffälligkeiten: 4"), true);
    assert.equal(combined.includes("Keine Auffälligkeiten gemeldet."), false);
    assert.equal(combined.indexOf("Dienstag · Tätigkeit zu allgemein") < combined.indexOf("Freitag · Fehlende Information"), true);
    assert.equal(combined.includes("Original:"), false);
    assert.equal(combined.includes("→"), true);
    assert.equal(container.children[0].className.includes("wbs-dmf-ai-status-warning"), true);
    const localContainer = new FakeElement("div");
    renderLocalResults(localContainer, [{ day: "Berichtsnummer", message: "Bitte die Berichtsnummer dreistellig als 014 eintragen.", original: "14" }]);
    assert.equal(flattenText(localContainer).includes("Lokale Prüfung: 1 Auffälligkeit"), true);
    const okayContainer = new FakeElement("div");
    renderAiResults(okayContainer, parseAiResponse('{"status":"ok","formalIssues":[],"contentIssues":[],"hourIssues":[],"notes":[]}'));
    assert.equal(okayContainer.children[0].className.includes("wbs-dmf-ai-status-ok"), true);
    const criticalContainer = new FakeElement("div");
    renderAiResults(criticalContainer, parseAiResponse('{"status":"critical","formalIssues":["Formaler Fehler"],"contentIssues":[],"hourIssues":[],"notes":[]}'));
    assert.equal(criticalContainer.children[0].className.includes("wbs-dmf-ai-status-critical"), true);
    delete global.document;
});

test("verarbeitet eine vollständige Chat-Completions-Antwort", async () => {
    global.GM_xmlhttpRequest = options => options.onload({
        status: 200,
        responseText: JSON.stringify({ choices: [{ message: { content: '```json\n{"status":"warning","summary":"Hinweis","formalIssues":[],"contentIssues":[{"day":"Montag","message":"Bitte genauer beschreiben."}],"hourIssues":[],"notes":[],"suggestedComment":"Bitte genauer beschreiben."}\n```' } }] })
    });
    const profile = { ...defaultAiSettings().profiles[0], model: "synthetic-model", authType: "none" };
    const result = await callAi({ days: [{ weekday: "Montag", hours: 8, entries: ["Server"] }] }, profile, { debug: false, systemPrompt: DEFAULT_SYSTEM_PROMPT });
    assert.equal(result.status, "warning");
    assert.equal(result.suggestedComment, "Bitte genauer beschreiben.");
    delete global.GM_xmlhttpRequest;
});

test("verarbeitet eine native LM-Studio-Antwort und sendet nur erlaubtes Reasoning", async () => {
    const requests = [];
    global.GM_xmlhttpRequest = options => {
        requests.push({ url: options.url, body: JSON.parse(options.data) });
        options.onload({ status: 200, responseText: JSON.stringify({ output: [{ type: "message", content: '{"status":"ok","formalIssues":[],"contentIssues":[],"hourIssues":[],"notes":[],"suggestedComment":""}' }] }) });
    };
    const profile = { ...defaultAiSettings().profiles[0], provider: "lm-studio", baseUrl: "http://localhost:1234", model: "gemma", authType: "none", reasoning: "high", reasoningCapabilities: normalizeReasoningCapabilities({ reasoning: { allowed_options: ["low", "medium"], default: "medium" } }, "gemma") };
    const result = await callAi({ days: [{ weekday: "Montag", hours: 8, entries: ["Konkrete Tätigkeit"] }] }, profile, { debug: false, systemPrompt: DEFAULT_SYSTEM_PROMPT });
    assert.equal(result.status, "ok");
    assert.equal(requests[0].url, "http://localhost:1234/api/v1/chat");
    assert.equal(Object.prototype.hasOwnProperty.call(requests[0].body, "reasoning"), false);
    assert.equal(requests[0].body.max_output_tokens, 500);
    delete global.GM_xmlhttpRequest;
});

test("wiederholt den Chat-Request ohne abgelehnten Reasoning-Parameter", async () => {
    const requests = [];
    global.GM_xmlhttpRequest = options => {
        requests.push(JSON.parse(options.data));
        if (requests.length === 1) options.onload({ status: 400, responseText: "unsupported reasoning_effort" });
        else options.onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content: '{"status":"ok","formalIssues":[],"contentIssues":[],"hourIssues":[],"notes":[],"suggestedComment":""}' } }] }) });
    };
    const profile = { ...defaultAiSettings().profiles[0], provider: "openai-compatible", baseUrl: "http://localhost:1234", model: "o3-mini", authType: "none", reasoningMode: "on", reasoningEffort: "high" };
    const result = await callAi({ days: [{ weekday: "Montag", hours: 8, entries: ["Konkrete Tätigkeit dokumentiert"] }] }, profile, { debug: false, systemPrompt: DEFAULT_SYSTEM_PROMPT });
    assert.equal(result.status, "ok");
    assert.equal(requests.length, 2);
    assert.equal(requests[0].reasoning_effort, "high");
    assert.equal(Object.prototype.hasOwnProperty.call(requests[1], "reasoning_effort"), false);
    delete global.GM_xmlhttpRequest;
});

test("normalisiert unbekannte Statuswerte ohne abzustürzen", () => {
    const parsed = parseAiResponse('{"status":"maybe","issues":null}');
    assert.equal(parsed.status, "warning");
    assert.deepEqual(parsed.issues, []);
    assert.equal(parseAiResponse('{"status":"OK","issues":[]}').status, "ok");
});

test("verwendet nur einen ausdrücklich gelieferten Kommentarvorschlag", () => {
    const fromServer = generateSuggestedComment({ suggestedComment: "Dienstag: Bitte genauer.", issues: [] });
    assert.equal(fromServer, "Dienstag: Bitte genauer.");
    const generated = generateSuggestedComment({ suggestedComment: "", issues: [{ day: "Freitag", message: "FPA erläutern.", suggestion: "" }] });
    assert.equal(generated, "");
});

test("unterscheidet lokale/private und möglicherweise externe Server", () => {
    ["http://localhost:1234", "http://127.0.0.1", "http://10.0.0.2", "http://172.16.1.2", "http://192.168.113.1"].forEach(url => assert.equal(isPrivateOrLocalHost(url), true, url));
    ["https://api.openai.com", "http://8.8.8.8", "https://example.local"].forEach(url => assert.equal(isPrivateOrLocalHost(url), false, url));
    assert.equal(displayHost("http://192.168.113.1:1234"), "192.168.113.1:1234");
});

test("enthält die benötigten Userscript-Rechte und stabilen WBS-DOM-Verträge", () => {
    ["GM_getValue", "GM_setValue", "GM_xmlhttpRequest"].forEach(grant => assert.match(userscriptSource, new RegExp(`@grant\\s+${grant}`)));
    assert.match(userscriptSource, /@connect\s+\*/);
    [
        'select#status',
        '#remarks',
        'input[aria-label="Berichtsnummer"]',
        'input[aria-label="Stunden / UE"]',
        '#total_hours',
        'cmd[reportstrainer.saveaccept]',
        'cmd[reportstrainer.savereject]'
    ].forEach(selectorPart => assert.equal(userscriptSource.includes(selectorPart), true, selectorPart));
    ["formalIssues", "contentIssues", "hourIssues", "notes"].forEach(field => assert.equal(userscriptSource.includes(field), true, field));
    assert.equal((userscriptSource.match(/void runModelRequest\(false\);/g) || []).length >= 2, true, "automatisches Modellladen");
});

(async () => {
    let failed = 0;
    for (const { name, callback } of tests) {
        try {
            await callback();
            console.log(`✓ ${name}`);
        } catch (error) {
            failed++;
            console.error(`✗ ${name}`);
            console.error(error.stack || error);
        }
    }

    if (failed) {
        console.error(`\n${failed} von ${tests.length} Tests fehlgeschlagen.`);
        process.exitCode = 1;
    } else {
        console.log(`\n${tests.length} Tests erfolgreich.`);
    }
})();
