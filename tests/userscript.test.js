"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    DEFAULT_SYSTEM_PROMPT,
    defaultAiSettings,
    normalizeAiSettings,
    loadAiConfig,
    saveAiConfig,
    getActiveAiProfile,
    joinUrl,
    buildAuthHeaders,
    testAiConnection,
    classifyHttpError,
    parseModelsResponse,
    detectDayIndex,
    parseHours,
    extractReportData,
    validateReport,
    buildAiRequest,
    callAi,
    parseAiResponse,
    generateSuggestedComment,
    isPrivateOrLocalHost,
    displayHost
} = require("../wbs-report-portfolio-de-monkey-fier.user.js");

const userscriptPath = path.join(__dirname, "..", "wbs-report-portfolio-de-monkey-fier.user.js");
const userscriptSource = fs.readFileSync(userscriptPath, "utf8");

const tests = [];
const test = (name, callback) => tests.push({ name, callback });

test("liefert die lokale LM-Studio-Standardkonfiguration", () => {
    const settings = defaultAiSettings();
    assert.equal(settings.enabled, true);
    assert.equal(settings.profiles[0].baseUrl, "http://192.168.113.1:1234");
    assert.equal(settings.profiles[0].chatEndpoint, "/v1/chat/completions");
    assert.equal(settings.profiles[0].modelsEndpoint, "/v1/models");
});

test("normalisiert Profile und setzt ein gültiges aktives Profil", () => {
    const settings = normalizeAiSettings({
        activeProfileId: "nicht-vorhanden",
        profiles: [{ id: "test", name: "Test", baseUrl: "http://localhost:1234/", timeout: 5 }]
    });
    assert.equal(settings.activeProfileId, "test");
    assert.equal(settings.profiles[0].baseUrl, "http://localhost:1234");
    assert.equal(settings.profiles[0].timeout, 60000);
    assert.equal(getActiveAiProfile(settings).id, "test");
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
    assert.match(classifyHttpError(504).message, /Zeitüberschreitung/);
    assert.equal(classifyHttpError(200), null);
});

test("testet Modellverbindung, Authentifizierungsfehler und Timeout über die Userscript-API", async () => {
    const profile = defaultAiSettings().profiles[0];
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
    assert.match(timedOut.message, /Zeitüberschreitung/);
    delete global.GM_xmlhttpRequest;
});

test("liest OpenAI-, Ollama-ähnliche und einfache Modelllisten", () => {
    assert.deepEqual(parseModelsResponse('{"data":[{"id":"b"},{"id":"a"}]}'), ["a", "b"]);
    assert.deepEqual(parseModelsResponse('{"models":[{"name":"llama"}]}'), ["llama"]);
    assert.deepEqual(parseModelsResponse('["x","x","y"]'), ["x", "y"]);
    assert.throws(() => parseModelsResponse("kein json"), /kein gültiges JSON/);
    assert.throws(() => parseModelsResponse("{}"), /keine Modellliste/);
});

test("verarbeitet deutsche Dezimalstunden", () => {
    assert.equal(parseHours("7,5"), 7.5);
    assert.equal(parseHours(""), null);
    assert.equal(parseHours("acht"), null);
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

test("baut eine minimierte Chat-Completions-Anfrage", () => {
    const profile = { model: "lokales-modell", manualModel: "", temperature: 0.2 };
    const report = { reportNumber: "034", totalHours: 8, days: [{ weekday: "Montag", hours: 8, entries: ["Testumgebung konfiguriert"] }] };
    const request = buildAiRequest(report, profile, { systemPrompt: DEFAULT_SYSTEM_PROMPT });
    assert.equal(request.model, "lokales-modell");
    assert.equal(request.messages.length, 2);
    assert.equal(request.messages[1].content.includes("Max Mustermann"), false);
    assert.equal(request.messages[1].content.includes("Testumgebung konfiguriert"), true);
    assert.throws(() => buildAiRequest(report, { model: "", manualModel: "" }, { systemPrompt: DEFAULT_SYSTEM_PROMPT }), /Kein KI-Modell/);
});

test("parst valides JSON und Markdown-Codeblöcke", () => {
    const direct = parseAiResponse('{"status":"ok","summary":"Passt","issues":[],"suggestedComment":""}');
    assert.equal(direct.status, "ok");
    const fenced = parseAiResponse('```json\n{"status":"warning","summary":"Hinweis","issues":[{"day":"Dienstag","message":"Genauer beschreiben"}]}\n```');
    assert.equal(fenced.issues[0].day, "Dienstag");
    assert.throws(() => parseAiResponse("keine strukturierte Antwort"), /kein gültiges JSON/);
});

test("verarbeitet eine vollständige Chat-Completions-Antwort", async () => {
    global.GM_xmlhttpRequest = options => options.onload({
        status: 200,
        responseText: JSON.stringify({ choices: [{ message: { content: '```json\n{"status":"warning","summary":"Hinweis","issues":[],"suggestedComment":"Bitte genauer beschreiben."}\n```' } }] })
    });
    const profile = { ...defaultAiSettings().profiles[0], model: "synthetic-model" };
    const result = await callAi({ days: [{ weekday: "Montag", hours: 8, entries: ["Server"] }] }, profile, { debug: false, systemPrompt: DEFAULT_SYSTEM_PROMPT });
    assert.equal(result.status, "warning");
    assert.equal(result.suggestedComment, "Bitte genauer beschreiben.");
    delete global.GM_xmlhttpRequest;
});

test("normalisiert unbekannte Statuswerte ohne abzustürzen", () => {
    const parsed = parseAiResponse('{"status":"maybe","issues":null}');
    assert.equal(parsed.status, "warning");
    assert.deepEqual(parsed.issues, []);
    assert.equal(parseAiResponse('{"status":"OK","issues":[]}').status, "ok");
});

test("erzeugt nur aus gelieferten Hinweisen einen Kommentar", () => {
    const fromServer = generateSuggestedComment({ suggestedComment: "Dienstag: Bitte genauer.", issues: [] });
    assert.equal(fromServer, "Dienstag: Bitte genauer.");
    const generated = generateSuggestedComment({ suggestedComment: "", issues: [{ day: "Freitag", message: "FPA erläutern.", suggestion: "" }] });
    assert.equal(generated, "Freitag: FPA erläutern.");
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
