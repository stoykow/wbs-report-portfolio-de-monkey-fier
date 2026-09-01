"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    normalizeText,
    isSubmittedStatus,
    isSuccessfulSaveMessage,
    outcomeFromSuccessMessage,
    normalizeComparableUrl,
    isSameReportUrl,
    normalizeQueue,
    getCurrentItem,
    advanceQueue,
    summarizeQueue,
    classifyDecisionTarget,
    extractVisibleReportFromRow
} = require("../wbs-berichtsheft-serienpruefung.user.js");

const userscriptSource = fs.readFileSync(path.join(__dirname, "..", "wbs-berichtsheft-serienpruefung.user.js"), "utf8");

const tests = [];
const test = (name, callback) => tests.push({ name, callback });

function makeQueue(count = 3) {
    return {
        version: 1,
        createdAt: "2026-09-01T12:00:00.000Z",
        sourceUrl: "https://ecampus.wbstraining.de/ilias.php?cmd=reportstrainer.list",
        index: 0,
        paused: false,
        continueOnList: false,
        autoStartAi: true,
        items: Array.from({ length: count }, (_unused, index) => ({
            url: `https://ecampus.wbstraining.de/ilias.php?cmd=reportstrainer.viewreport&id=${index + 1}`,
            label: `Bericht ${index + 1}`,
            period: "01. Sep 2026 - 07. Sep 2026",
            status: "pending"
        }))
    };
}

test("erkennt ausschließlich tatsächlich eingereichte Zeilen", () => {
    assert.equal(isSubmittedStatus(" Eingereicht "), true);
    assert.equal(isSubmittedStatus("Angenommen"), false);
    assert.equal(isSubmittedStatus("Zurückgegeben"), false);
    assert.equal(isSubmittedStatus("Nicht eingereicht"), false);
});

test("übernimmt alle sichtbaren Berichte unabhängig vom Status", () => {
    const cells = ["Mustermann, Max", "US_FISI", "01. Sep - 07. Sep", "09. Sep", "Eingereicht", "", ""]
        .map(textContent => ({ textContent }));
    const viewLink = { href: "https://ecampus.wbstraining.de/ilias.php?cmd=reportstrainer.viewreport&id=7", textContent: "Anzeigen" };
    const row = {
        querySelectorAll: selector => selector === ":scope > td" ? cells : selector === "a[href]" ? [viewLink] : [],
        querySelector: () => null
    };
    const report = extractVisibleReportFromRow(row);
    assert.equal(report.label, "Mustermann, Max");
    assert.equal(report.status, "pending");
    assert.equal(report.originalStatus, "Eingereicht");
    cells[4].textContent = "Angenommen";
    assert.equal(extractVisibleReportFromRow(row).originalStatus, "Angenommen");
});

test("erkennt bestätigte WBS-Speichermeldungen", () => {
    const returned = "Die Daten wurden erfolgreich gespeichert, der Bericht wurde zurückgegeben.";
    const accepted = "Die Daten wurden erfolgreich gespeichert, der Bericht wurde angenommen.";
    assert.equal(isSuccessfulSaveMessage(returned), true);
    assert.equal(isSuccessfulSaveMessage(accepted), true);
    assert.equal(outcomeFromSuccessMessage(returned), "returned");
    assert.equal(outcomeFromSuccessMessage(accepted), "accepted");
    assert.equal(isSuccessfulSaveMessage("Der Bericht konnte nicht gespeichert werden."), false);
});

test("vergleicht Berichtslinks unabhängig von der Parameterreihenfolge", () => {
    const left = "https://ecampus.wbstraining.de/ilias.php?id=7&cmd=reportstrainer.viewreport";
    const right = "https://ecampus.wbstraining.de/ilias.php?cmd=reportstrainer.viewreport&id=7";
    assert.equal(isSameReportUrl(left, right), true);
    assert.notEqual(normalizeComparableUrl(left), "");
    assert.equal(isSameReportUrl(left, right.replace("id=7", "id=8")), false);
});

test("normalisiert die Warteschlange und begrenzt sie auf 50 Berichte", () => {
    const queue = normalizeQueue(makeQueue(55));
    assert.equal(queue.items.length, 50);
    assert.equal(queue.index, 0);
    assert.equal(queue.autoStartAi, true);
    assert.equal(queue.continueOnList, false);
    assert.equal(getCurrentItem(queue).label, "Bericht 1");
});

test("arbeitet Prüfung, Annahme, Rückgabe und Überspringen nacheinander ab", () => {
    let queue = advanceQueue(makeQueue(4), "reviewed");
    assert.equal(queue.index, 1);
    assert.equal(queue.items[0].status, "reviewed");
    queue = advanceQueue(queue, "accepted");
    assert.equal(queue.index, 2);
    queue = advanceQueue(queue, "returned");
    assert.equal(queue.index, 3);
    queue = advanceQueue(queue, "skipped");
    assert.equal(getCurrentItem(queue), null);
    assert.deepEqual(summarizeQueue(queue), { total: 4, reviewed: 1, accepted: 1, returned: 1, skipped: 1, failed: 0 });
});

test("erkennt nur die ausdrücklichen WBS-Entscheidungsbuttons", () => {
    const target = control => ({ closest: () => control });
    assert.equal(classifyDecisionTarget(target({ name: "cmd[reportstrainer.saveaccept]", value: "✅ Annehmen" })), "accepted");
    assert.equal(classifyDecisionTarget(target({ name: "cmd[reportstrainer.savereject]", value: "👎 Zurückgeben" })), "returned");
    assert.equal(classifyDecisionTarget(target({ name: "", value: "Mit KI prüfen" })), "");
});

test("normalisiert sichtbare Texte ohne Inhalte zu verändern", () => {
    assert.equal(normalizeText("  Bericht\n  1  "), "Bericht 1");
});

test("ist ein eigenständiges Begleitscript ohne automatische WBS-Entscheidung", () => {
    assert.equal(userscriptSource.includes("// @name          WBS Berichtsheft Serienprüfung"), true);
    assert.equal(userscriptSource.includes("// @grant         GM_deleteValue"), true);
    assert.equal(userscriptSource.includes("wbs-report-portfolio-de-monkey-fier.user.js"), false);
    assert.equal(/saveaccept[^\n]*\.click\s*\(/i.test(userscriptSource), false);
    assert.equal(/savereject[^\n]*\.click\s*\(/i.test(userscriptSource), false);
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
