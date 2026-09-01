// ==UserScript==
// @name          WBS Berichtsheft Serienprüfung
// @namespace     https://github.com/stoykow/wbs-report-portfolio-de-monkey-fier
// @match         *://ecampus.wbstraining.de/*
// @run-at        document-end
// @version       1.0.0
// @description   Arbeitet eingereichte WBS-Berichtshefte nacheinander mit dem de-monkey-fier ab
// @downloadURL   https://github.com/stoykow/wbs-report-portfolio-de-monkey-fier/raw/refs/heads/master/wbs-berichtsheft-serienpruefung.user.js
// @updateURL     https://github.com/stoykow/wbs-report-portfolio-de-monkey-fier/raw/refs/heads/master/wbs-berichtsheft-serienpruefung.user.js
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_deleteValue
// ==/UserScript==

(() => {
    "use strict";

    const QUEUE_KEY = "wbsSerienpruefung.queue.v1";
    const SUMMARY_KEY = "wbsSerienpruefung.summary.v1";
    const QUEUE_VERSION = 1;
    const MAX_VISIBLE_REPORTS = 50;

    function normalizeText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function isSubmittedStatus(value) {
        return /^eingereicht$/i.test(normalizeText(value));
    }

    function isSuccessfulSaveMessage(value) {
        const text = normalizeText(value).toLocaleLowerCase("de-DE");
        return text.includes("erfolgreich gespeichert") && (text.includes("angenommen") || text.includes("zurückgegeben") || text.includes("zurueckgegeben"));
    }

    function outcomeFromSuccessMessage(value) {
        const text = normalizeText(value).toLocaleLowerCase("de-DE");
        if (!isSuccessfulSaveMessage(text)) return "";
        return text.includes("angenommen") ? "accepted" : "returned";
    }

    function normalizeComparableUrl(value, baseUrl = "https://ecampus.wbstraining.de/") {
        try {
            const url = new URL(String(value || ""), baseUrl);
            url.hash = "";
            const sorted = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
                leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
            url.search = "";
            sorted.forEach(([key, itemValue]) => url.searchParams.append(key, itemValue));
            return url.href;
        } catch (_error) {
            return String(value || "");
        }
    }

    function isSameReportUrl(left, right) {
        return normalizeComparableUrl(left) === normalizeComparableUrl(right);
    }

    function normalizeQueue(raw) {
        if (!raw || typeof raw !== "object" || Number(raw.version) !== QUEUE_VERSION || !Array.isArray(raw.items)) return null;
        const items = raw.items.slice(0, MAX_VISIBLE_REPORTS).map((item, index) => ({
            url: String(item && item.url || ""),
            label: String(item && item.label || `Bericht ${index + 1}`),
            period: String(item && item.period || ""),
            status: ["pending", "accepted", "returned", "skipped", "failed"].includes(item && item.status) ? item.status : "pending",
            aiStarted: item && item.aiStarted === true,
            aiStatus: ["pending", "running", "ok", "error"].includes(item && item.aiStatus) ? item.aiStatus : "pending",
            action: ["accepted", "returned"].includes(item && item.action) ? item.action : "",
            awaitingSave: item && item.awaitingSave === true
        })).filter(item => item.url);
        if (!items.length) return null;
        const index = Math.min(Math.max(Number(raw.index) || 0, 0), items.length);
        return {
            version: QUEUE_VERSION,
            createdAt: String(raw.createdAt || new Date().toISOString()),
            sourceUrl: String(raw.sourceUrl || ""),
            index,
            paused: raw.paused === true,
            continueOnList: raw.continueOnList === true,
            autoStartAi: raw.autoStartAi !== false,
            items
        };
    }

    function getCurrentItem(queue) {
        return queue && queue.items && queue.index < queue.items.length ? queue.items[queue.index] : null;
    }

    function advanceQueue(queue, outcome) {
        const normalized = normalizeQueue(queue);
        if (!normalized) return null;
        const current = getCurrentItem(normalized);
        if (current) {
            current.status = ["accepted", "returned", "skipped", "failed"].includes(outcome) ? outcome : "skipped";
            current.awaitingSave = false;
        }
        let nextIndex = normalized.index + 1;
        while (nextIndex < normalized.items.length && normalized.items[nextIndex].status !== "pending") nextIndex++;
        normalized.index = nextIndex;
        return normalized;
    }

    function summarizeQueue(queue) {
        const items = queue && Array.isArray(queue.items) ? queue.items : [];
        const count = status => items.filter(item => item.status === status).length;
        return {
            total: items.length,
            accepted: count("accepted"),
            returned: count("returned"),
            skipped: count("skipped"),
            failed: count("failed")
        };
    }

    function classifyDecisionTarget(target) {
        const control = target && target.closest ? target.closest("input, button") : target;
        if (!control) return "";
        const descriptor = normalizeText([control.name, control.id, control.value, control.textContent].filter(Boolean).join(" ")).toLocaleLowerCase("de-DE");
        if (descriptor.includes("reportstrainer.saveaccept") || /(^|\s)annehmen($|\s)/.test(descriptor)) return "accepted";
        if (descriptor.includes("reportstrainer.savereject") || descriptor.includes("zurückgeben") || descriptor.includes("zurueckgeben")) return "returned";
        return "";
    }

    function isPageCommand(command) {
        if (typeof location === "undefined") return false;
        const params = new URLSearchParams(location.search);
        return params.get("cmd") === command || params.get("fallbackCmd") === command;
    }

    function safeGetValue(key, fallback) {
        try { return typeof GM_getValue === "function" ? GM_getValue(key, fallback) : fallback; } catch (_error) { return fallback; }
    }

    function safeSetValue(key, value) {
        if (typeof GM_setValue === "function") GM_setValue(key, value);
    }

    function safeDeleteValue(key) {
        try {
            if (typeof GM_deleteValue === "function") GM_deleteValue(key);
            else if (typeof GM_setValue === "function") GM_setValue(key, null);
        } catch (_error) {
            // Die Warteschlange darf die WBS-Seite bei einem Speicherfehler nicht blockieren.
        }
    }

    function loadQueue() {
        return normalizeQueue(safeGetValue(QUEUE_KEY, null));
    }

    function saveQueue(queue) {
        const normalized = normalizeQueue(queue);
        if (normalized) safeSetValue(QUEUE_KEY, normalized);
        return normalized;
    }

    function createElement(tag, options = {}) {
        const element = document.createElement(tag);
        if (options.className) element.className = options.className;
        if (options.text !== undefined) element.textContent = options.text;
        if (options.type) element.type = options.type;
        if (options.title) element.title = options.title;
        return element;
    }

    function injectStyles() {
        if (document.querySelector("#wbs-srq-styles")) return;
        const style = createElement("style");
        style.id = "wbs-srq-styles";
        style.textContent = `
            .wbs-srq-button { margin: 4px; padding: 7px 12px; border: 1px solid #526779; border-radius: 4px; background: #fff; color: #172a3a; cursor: pointer; }
            .wbs-srq-button:hover { background: #edf3f7; }
            .wbs-srq-button:disabled { opacity: .55; cursor: not-allowed; }
            .wbs-srq-primary { background: #0b4a7f; border-color: #0b4a7f; color: #fff; }
            .wbs-srq-danger { color: #991b1b; }
            .wbs-srq-bar { position: sticky; top: 0; z-index: 9997; margin: 0 0 12px; padding: 10px 14px; border-left: 5px solid #0b4a7f; background: #eef6fc; box-shadow: 0 2px 8px rgba(0,0,0,.18); color: #172a3a; }
            .wbs-srq-title { font-weight: 700; margin-right: 12px; }
            .wbs-srq-status { margin: 5px 0; }
            .wbs-srq-actions { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
            .wbs-srq-list-button { margin-left: 5px !important; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function findViewLink(row) {
        const links = [...row.querySelectorAll("a[href]")];
        return links.find(link => /(?:cmd|fallbackCmd)=reportstrainer\.viewreport/i.test(link.href)) ||
            links.find(link => /(anzeigen|ansehen|öffnen|bericht bearbeiten)/i.test(normalizeText(link.textContent))) ||
            row.querySelector("td:last-child li:first-child a[href]");
    }

    function extractSubmittedReportFromRow(row, fallbackIndex = 0) {
        const cells = [...row.querySelectorAll(":scope > td")];
        if (cells.length < 6) return null;
        const status = normalizeText(cells[4] && cells[4].textContent);
        if (!isSubmittedStatus(status)) return null;
        const link = findViewLink(row);
        if (!link || !link.href || /^javascript:/i.test(link.href)) return null;
        return {
            url: link.href,
            label: normalizeText(cells[0] && cells[0].textContent) || `Bericht ${fallbackIndex + 1}`,
            period: normalizeText(cells[2] && cells[2].textContent),
            status: "pending",
            aiStarted: false,
            aiStatus: "pending",
            action: "",
            awaitingSave: false
        };
    }

    function collectSubmittedReports(root = document) {
        const rows = [...root.querySelectorAll("tbody > tr")];
        return rows.map((row, index) => extractSubmittedReportFromRow(row, index)).filter(Boolean).slice(0, MAX_VISIBLE_REPORTS);
    }

    function findSuccessMessage(root = document) {
        const candidates = [...root.querySelectorAll(".alert-success, .ilSystemSuccess, .ilSystemMessage, [class*='success']")];
        return candidates.map(element => normalizeText(element.textContent)).find(isSuccessfulSaveMessage) || "";
    }

    function createQueueBar(queue, statusText = "") {
        document.querySelector("#wbs-srq-bar")?.remove();
        const bar = createElement("section", { className: "wbs-srq-bar" });
        bar.id = "wbs-srq-bar";
        const current = getCurrentItem(queue);
        const position = Math.min(queue.index + 1, queue.items.length);
        bar.appendChild(createElement("div", { className: "wbs-srq-title", text: `Serienprüfung: ${position} von ${queue.items.length}${current ? ` · ${current.label}${current.period ? ` · ${current.period}` : ""}` : ""}` }));
        const status = createElement("div", { className: "wbs-srq-status", text: statusText });
        status.id = "wbs-srq-status";
        bar.appendChild(status);
        const actions = createElement("div", { className: "wbs-srq-actions" });
        bar.appendChild(actions);
        (document.querySelector("main, #mainspacekeeper, #il_center_col") || document.body).prepend(bar);
        return { bar, status, actions };
    }

    function finishQueue(queue, navigateToList = false) {
        const summary = summarizeQueue(queue);
        safeSetValue(SUMMARY_KEY, { ...summary, completedAt: new Date().toISOString() });
        safeDeleteValue(QUEUE_KEY);
        if (navigateToList && queue.sourceUrl) location.assign(queue.sourceUrl);
        return summary;
    }

    function goToCurrentReport(queue) {
        const current = getCurrentItem(queue);
        if (!current) {
            finishQueue(queue, true);
            return;
        }
        queue.paused = false;
        queue.continueOnList = false;
        saveQueue(queue);
        location.assign(current.url);
    }

    function abortQueue(queue, navigateToList = false) {
        if (!window.confirm("Serienprüfung wirklich abbrechen und die Warteschlange löschen?")) return;
        safeDeleteValue(QUEUE_KEY);
        if (navigateToList && queue && queue.sourceUrl) location.assign(queue.sourceUrl);
        else document.querySelector("#wbs-srq-bar")?.remove();
    }

    function renderListSummary(container) {
        const summary = safeGetValue(SUMMARY_KEY, null);
        if (!summary || typeof summary !== "object") return;
        const message = `Letzte Serienprüfung: ${summary.total || 0} Berichte · ${summary.accepted || 0} angenommen · ${summary.returned || 0} zurückgegeben · ${summary.skipped || 0} übersprungen · ${summary.failed || 0} fehlgeschlagen.`;
        container.appendChild(createElement("div", { className: "wbs-srq-status", text: message }));
        safeDeleteValue(SUMMARY_KEY);
    }

    function addListStartButton(reports) {
        if (document.querySelector("#wbs-srq-start")) return;
        const host = document.querySelector("#tfil_rstg_ > fieldset > span") || document.querySelector("#tfil_rstg_") || document.querySelector("main, #mainspacekeeper, #il_center_col") || document.body;
        const button = createElement("button", {
            className: "btn btn-default wbs-srq-list-button",
            type: "button",
            text: `▶ Serienprüfung starten (${reports.length})`,
            title: "Alle sichtbaren Berichte mit Status „Eingereicht“ nacheinander öffnen"
        });
        button.id = "wbs-srq-start";
        button.disabled = reports.length === 0;
        button.addEventListener("click", () => {
            if (!reports.length) return;
            const activeQueue = loadQueue();
            if (activeQueue && !window.confirm("Es gibt bereits eine laufende Serienprüfung. Soll sie verworfen und durch eine neue Warteschlange ersetzt werden?")) return;
            if (!window.confirm(`${reports.length} eingereichte Berichte dieser Seite nacheinander prüfen? Annahme und Rückgabe bleiben immer deine Entscheidung.`)) return;
            const queue = saveQueue({
                version: QUEUE_VERSION,
                createdAt: new Date().toISOString(),
                sourceUrl: location.href,
                index: 0,
                paused: false,
                continueOnList: false,
                autoStartAi: true,
                items: reports
            });
            safeDeleteValue(SUMMARY_KEY);
            goToCurrentReport(queue);
        });
        host.appendChild(button);
        renderListSummary(host);
    }

    function scheduleNextReport(queue, message) {
        const ui = createQueueBar(queue, message);
        const pause = createElement("button", { className: "wbs-srq-button", type: "button", text: "Pausieren" });
        let navigationTimer = setTimeout(() => goToCurrentReport(queue), 900);
        pause.addEventListener("click", () => {
            clearTimeout(navigationTimer); navigationTimer = null;
            queue.paused = true; queue.continueOnList = false; saveQueue(queue);
            ui.status.textContent = "Serienprüfung pausiert."; pause.remove();
            const resume = createElement("button", { className: "wbs-srq-button wbs-srq-primary", type: "button", text: "Fortsetzen" });
            resume.addEventListener("click", () => goToCurrentReport(queue)); ui.actions.appendChild(resume);
        });
        ui.actions.appendChild(pause);
    }

    function handleListPage() {
        const reports = collectSubmittedReports();
        let queue = loadQueue();
        if (queue) {
            const current = getCurrentItem(queue);
            const successMessage = findSuccessMessage();
            if (current && current.awaitingSave && isSuccessfulSaveMessage(successMessage)) {
                queue = advanceQueue(queue, outcomeFromSuccessMessage(successMessage) || current.action || "returned");
                queue.continueOnList = true;
                if (!getCurrentItem(queue)) {
                    const summary = finishQueue(queue, false);
                    safeDeleteValue(SUMMARY_KEY);
                    const completed = createQueueBar({ ...queue, index: Math.max(queue.items.length - 1, 0) }, `Abgeschlossen: ${summary.accepted} angenommen, ${summary.returned} zurückgegeben, ${summary.skipped} übersprungen, ${summary.failed} fehlgeschlagen.`);
                    const close = createElement("button", { className: "wbs-srq-button", type: "button", text: "Schließen" });
                    close.addEventListener("click", () => completed.bar.remove()); completed.actions.appendChild(close);
                } else {
                    saveQueue(queue);
                    scheduleNextReport(queue, "WBS hat die letzte Aktion bestätigt. Der nächste Bericht wird geöffnet …");
                }
            } else if (queue.continueOnList && !queue.paused) {
                scheduleNextReport(queue, "Die Serienprüfung wird nach dem erneuten Laden der Liste fortgesetzt …");
            } else {
                const ui = createQueueBar(queue, current && current.awaitingSave
                    ? "Die letzte WBS-Aktion wurde nicht als erfolgreich bestätigt. Der aktuelle Bericht bleibt in der Warteschlange."
                    : "Serienprüfung ist pausiert und kann fortgesetzt werden.");
                const resume = createElement("button", { className: "wbs-srq-button wbs-srq-primary", type: "button", text: "Fortsetzen" });
                resume.addEventListener("click", () => goToCurrentReport(queue));
                const abort = createElement("button", { className: "wbs-srq-button wbs-srq-danger", type: "button", text: "Abbrechen" });
                abort.addEventListener("click", () => abortQueue(queue));
                ui.actions.append(resume, abort);
            }
        }
        addListStartButton(reports);
    }

    function findAiCheckButton() {
        return [...document.querySelectorAll("#wbs-dmf-ai-panel button")]
            .find(button => normalizeText(button.textContent) === "Mit KI prüfen") || null;
    }

    function waitForAiButton(timeoutMs = 15000) {
        return new Promise(resolve => {
            const immediate = findAiCheckButton();
            if (immediate) { resolve(immediate); return; }
            const startedAt = Date.now();
            const timer = setInterval(() => {
                const button = findAiCheckButton();
                if (button || Date.now() - startedAt >= timeoutMs) {
                    clearInterval(timer);
                    resolve(button || null);
                }
            }, 250);
        });
    }

    function observeAiStatus(queue, ui) {
        const statusElement = document.querySelector("#wbs-dmf-ai-panel .wbs-dmf-status");
        if (!statusElement) return;
        const applyStatus = () => {
            const text = normalizeText(statusElement.textContent);
            const current = getCurrentItem(queue);
            if (!current) return;
            if (text.includes("KI-Antwort erfolgreich verarbeitet")) current.aiStatus = "ok";
            else if (text.startsWith("🔴")) current.aiStatus = "error";
            else if (text.includes("KI-Prüfung läuft")) current.aiStatus = "running";
            else return;
            const queueAiButton = document.querySelector("#wbs-srq-ai");
            if (queueAiButton) {
                queueAiButton.disabled = current.aiStatus === "running";
                queueAiButton.textContent = current.aiStatus === "running" ? "KI-Prüfung läuft …" : "KI erneut prüfen";
            }
            saveQueue(queue);
            ui.status.textContent = text;
        };
        applyStatus();
        new MutationObserver(applyStatus).observe(statusElement, { childList: true, characterData: true, subtree: true });
    }

    async function startAiCheck(queue, ui, force = false) {
        const current = getCurrentItem(queue);
        if (!current || (!force && current.aiStarted)) return;
        const queueAiButton = document.querySelector("#wbs-srq-ai");
        if (queueAiButton) { queueAiButton.disabled = true; queueAiButton.textContent = "KI-Assistent wird gesucht …"; }
        ui.status.textContent = "Der KI-Assistent wird gesucht …";
        const button = await waitForAiButton();
        if (!button) {
            current.aiStatus = "error"; saveQueue(queue);
            if (queueAiButton) { queueAiButton.disabled = false; queueAiButton.textContent = "KI erneut versuchen"; }
            ui.status.textContent = "Der KI-Assistent wurde nicht gefunden. Ist das Hauptscript installiert und aktiviert?";
            return;
        }
        if (button.disabled) {
            current.aiStatus = "error"; saveQueue(queue);
            if (queueAiButton) { queueAiButton.disabled = false; queueAiButton.textContent = "KI erneut versuchen"; }
            ui.status.textContent = "Die KI-Prüfung ist im Hauptscript deaktiviert oder noch nicht konfiguriert.";
            return;
        }
        current.aiStarted = true; current.aiStatus = "running"; saveQueue(queue);
        if (queueAiButton) queueAiButton.textContent = "KI-Prüfung läuft …";
        button.click();
        ui.status.textContent = "KI-Prüfung läuft …";
        setTimeout(() => observeAiStatus(queue, ui), 0);
    }

    function handleDecision(queue, outcome) {
        const current = getCurrentItem(queue);
        if (!current) return;
        current.action = outcome;
        current.awaitingSave = true;
        saveQueue(queue);
        const status = document.querySelector("#wbs-srq-status");
        if (status) status.textContent = outcome === "accepted"
            ? "Annahme wird von WBS gespeichert …"
            : "Rückgabe wird von WBS gespeichert …";
    }

    function installDecisionListeners(queue) {
        document.addEventListener("click", event => {
            const outcome = classifyDecisionTarget(event.target);
            if (outcome) handleDecision(queue, outcome);
        }, true);
        document.addEventListener("submit", event => {
            const outcome = classifyDecisionTarget(event.submitter);
            if (outcome) handleDecision(queue, outcome);
        }, true);
    }

    function handleReportPage() {
        const queue = loadQueue();
        if (!queue) return;
        const current = getCurrentItem(queue);
        if (!current) { finishQueue(queue, true); return; }
        const ui = createQueueBar(queue, "Lokale Prüfung wird durch das Hauptscript vorbereitet …");
        const matches = isSameReportUrl(location.href, current.url);
        if (!matches) {
            queue.paused = true; saveQueue(queue);
            ui.status.textContent = "Dieser Bericht gehört nicht zur aktuellen Warteschlangenposition.";
            const openCurrent = createElement("button", { className: "wbs-srq-button wbs-srq-primary", type: "button", text: "Aktuellen Queue-Bericht öffnen" });
            openCurrent.addEventListener("click", () => goToCurrentReport(queue));
            const abort = createElement("button", { className: "wbs-srq-button wbs-srq-danger", type: "button", text: "Abbrechen" });
            abort.addEventListener("click", () => abortQueue(queue, true)); ui.actions.append(openCurrent, abort);
            return;
        }

        installDecisionListeners(queue);
        const aiButton = createElement("button", { className: "wbs-srq-button wbs-srq-primary", type: "button", text: current.aiStarted ? "KI erneut prüfen" : "KI-Prüfung starten" });
        aiButton.id = "wbs-srq-ai";
        aiButton.addEventListener("click", () => startAiCheck(queue, ui, true));
        const skip = createElement("button", { className: "wbs-srq-button", type: "button", text: "Überspringen" });
        skip.addEventListener("click", () => {
            const advanced = advanceQueue(queue, "skipped");
            if (getCurrentItem(advanced)) { saveQueue(advanced); goToCurrentReport(advanced); }
            else finishQueue(advanced, true);
        });
        const list = createElement("button", { className: "wbs-srq-button", type: "button", text: "Zur Liste" });
        list.addEventListener("click", () => { queue.paused = true; queue.continueOnList = false; saveQueue(queue); location.assign(queue.sourceUrl); });
        const abort = createElement("button", { className: "wbs-srq-button wbs-srq-danger", type: "button", text: "Abbrechen" });
        abort.addEventListener("click", () => abortQueue(queue, true));
        ui.actions.append(aiButton, skip, list, abort);
        if (queue.autoStartAi && !current.aiStarted) void startAiCheck(queue, ui, false);
        else {
            ui.status.textContent = current.aiStatus === "ok" ? "KI-Prüfung wurde erfolgreich verarbeitet."
                : current.aiStatus === "error" ? "Die letzte KI-Prüfung ist fehlgeschlagen. Du kannst sie erneut starten."
                    : "Bericht ist bereit zur Prüfung.";
            setTimeout(() => observeAiStatus(queue, ui), 0);
        }
    }

    function initialize() {
        injectStyles();
        if (isPageCommand("reportstrainer.list")) handleListPage();
        else if (isPageCommand("reportstrainer.viewreport")) handleReportPage();
    }

    const testExports = {
        normalizeText, isSubmittedStatus, isSuccessfulSaveMessage, outcomeFromSuccessMessage, normalizeComparableUrl, isSameReportUrl,
        normalizeQueue, getCurrentItem, advanceQueue, summarizeQueue, classifyDecisionTarget, extractSubmittedReportFromRow
    };
    if (typeof module !== "undefined" && module.exports) { module.exports = testExports; return; }
    initialize();
})();
