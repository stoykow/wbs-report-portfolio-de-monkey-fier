# Technische Architektur

Stand: Version 2.1.0

## Unterstützte Seiten und Seitenerkennung

Das Userscript läuft ausschließlich unter `*://ecampus.wbstraining.de/*`. Der eCampus bildet die Navigation über Query-Parameter ab. `initialize()` liest deshalb `location.search` mit `URLSearchParams` und prüft sowohl `cmd` als auch `fallbackCmd`.

| Seite | Erkennungswert | Erweiterungen |
| --- | --- | --- |
| Berichtsheftübersicht | `reportstrainer.list` | Autofilter, gesperrte Annahme-/Rückgabeaktionen, Navigation zum nächsten Bericht, KI-Einstellungen |
| Einzelnes Berichtsheft | `reportstrainer.viewreport` | Buttons, Markierungen, lokale Validierung, KI-Assistent, Kurs- und KI-Einstellungen |

Andere eCampus-Seiten werden nicht verändert.

## Bestehende Funktionen

Die ursprüngliche Funktionalität bleibt erhalten:

- Auf der Übersicht wird bei der Auswahl „Alle“ der Filter mit Index `3` gewählt und ausgelöst.
- Die Annahme- und Rückgabeaktionen der Tabellenzeilen werden als Schutz vor versehentlichen Klicks deaktiviert und durchgestrichen.
- Zwei Schaltflächen öffnen den jeweils nächsten Bericht im selben beziehungsweise in einem neuen Tab.
- In der Einzelansicht werden die Buttons als „✅ Annehmen“ und „👎 Zurückgeben“ beschriftet.
- Konfigurierbare Schlagwörter markieren Fundstellen mit `🔎`.
- Berichtsnummer, Tagesstunden und Gesamtstunden werden lokal geprüft und mit `⚠️` markiert.
- Ein zusammenfassendes Symbol erscheint bei den Formularaktionen.

Die aus der Upstream-Version stammende Leiste mit festen Kommentarvorlagen wurde in Version 2.1.0 entfernt.

## Verwendete DOM-Selektoren

| Zweck | Selektor |
| --- | --- |
| Statusfilter | `select#status` |
| Filterbutton und Navigationsleiste | `#tfil_rstg_ > fieldset > span` beziehungsweise dessen erstes `input` |
| Aktionsmenü je Tabellenzeile | `tbody > tr > .std:nth-child(7) > .btn-group > #ilAdvSelListTable_asl_` |
| Kommentar | `#remarks` |
| Formularfuß | `#form_ > div > div.ilFormFooter.clearfix` |
| Formularaktionen | `#form_ > div > div.ilFormFooter.clearfix > div.col-sm-6.ilFormCmds` |
| Annahme | `input[name="cmd[reportstrainer.saveaccept]"]` |
| Rückgabe | `input[name="cmd[reportstrainer.savereject]"]` |
| Berichtsnummer | `input[aria-label="Berichtsnummer"], #number` |
| Tätigkeiten | `input[name*="_text"], textarea[name*="_text"]` |
| Tagesstunden | `input[aria-label="Stunden / UE"]` |
| Gesamtstunden | `#total_hours` |
| Zugehörige Feldbeschriftung | `label[for="<Feld-ID>"]` |

Alle neuen Zugriffe auf möglicherweise veränderte WBS-Strukturen werden auf fehlende Elemente geprüft. Fällt ein Ziel aus, bleiben die übrigen Funktionen aktiv.

## Berichtsverarbeitung und Datenminimierung

`extractReportData()` liest nur:

- die Berichtsnummer,
- die Gesamtstunden,
- Wochentag, Tagesstunden und nicht leere Tätigkeitsbeschreibungen.
- einen erkennbaren Berichtszeitraum sowie dafür relevante Feiertage.

Namen, E-Mail-Adressen, Benutzer-IDs, Account-IDs und Kommentare werden nicht ausgelesen und daher nicht an die KI gesendet. Berichtsheftinhalte werden weder mit `GM_setValue` noch anderweitig dauerhaft gespeichert.

Die Tageszuordnung verwendet zunächst Feld-ID, Feldname, `aria-label`, zugehöriges Label und den nächsten Formularcontainer. Wenn daraus kein Wochentag erkennbar ist, wird die bestehende Reihenfolge der Stunden- und Tätigkeitsfelder verwendet. Es werden höchstens sieben Tage verarbeitet und keine fehlenden Werte erfunden.

Samstag und Sonntag werden bei 0 Stunden und ohne Tätigkeit nicht an die KI übertragen, weil dieser erwartete Leerzustand keine prüfungsrelevante Information ist. Sobald dort Stunden oder eine Tätigkeit vorhanden sind, bleibt der betreffende Wochenendtag in den minimierten Daten und kann lokal sowie durch die KI geprüft werden.

## Kurswochen und Feiertage

Mehrere Kurse werden mit ID, Name und Startdatum im Userscript-Speicher verwaltet. Der Montag der Kursstartwoche bildet Berichtswoche `001`. `calculateCourseWeek()` vergleicht ihn mit dem Montag des erkannten Berichtszeitraums; Berichte vor dem Kursstart oder Berichte ohne erkennbaren Zeitraum erhalten keine berechnete Nummer.

`getGermanHolidays()` berechnet die Vereinigungsmenge der bundesweiten, landesweiten, örtlichen und bekannten einmaligen gesetzlichen Feiertage vollständig lokal. Bewegliche Feiertage werden vom Osterdatum abgeleitet. Die Oberfläche zeigt die Liste für ein frei wählbares Jahr; Berichtszeiträume werden mit passenden Feiertagen und dem Hinweis angereichert, dass sie in diesem WBS-Ablauf unabhängig vom regionalen Geltungsbereich als schulungsfrei gelten. Datenbasis sind die Feiertagsübersicht der Deutschen Bundesbank und ergänzend die offiziellen Regelungen der Länder Bayern, Berlin und Sachsen.

## Lokale Prüfungen

`validateReport()` arbeitet vollständig offline. Es prüft:

- leere Arbeitstage beziehungsweise Stunden ohne Tätigkeiten,
- Tätigkeiten bei 0 Stunden,
- sehr kurze Tätigkeitsbeschreibungen,
- identische und häufig wiederholte Tätigkeiten,
- ungewöhnliche Stundenwerte,
- Abwesenheiten zusammen mit positiven Stunden,
- Wochenendeinträge,
- inkonsistente Gesamtstunden,
- dreistellige Berichtsnummern,
- leere Berichte,
- auffällige Schlagwörter.

`FPA`, `Prüfung`, `Test`, `Wiederholung` und `Vorbereitung` gelten nicht als auffällige Schlagwörter und erzeugen allein weder Zähler noch Warnmarkierung. Ungültige ein- oder zweistellige Berichtsnummern erhalten einen konkret auf drei Stellen aufgefüllten Korrekturhinweis.

Diese Hinweise sind keine Entscheidung über Annahme oder Rückgabe.

## KI-Konfiguration

Die Konfiguration trennt globale Einstellungen von Profilen. Mehrere Profile können erstellt, gewählt, bearbeitet und gelöscht werden. Jedes Profil enthält Anbieter, Server, Chat- und Models-Endpunkt, Modell, manuelles Modell, Temperature, maximale Ausgabetokens, Timeout, Authentifizierungstyp und Token.

Normale Einstellungen liegen unter `wbsDeMonkeyFier.ai.settings.v1`. Tokens liegen getrennt unter `wbsDeMonkeyFier.ai.secrets.v1`. Beide Speicher verwenden `GM_getValue` und `GM_setValue`. Der Userscript-Speicher ist bequem, aber kein vollwertiger Passwort-Tresor.

Die Standardkonfiguration verwendet das OpenAI-kompatible Gateway `https://llm.nik0.de` mit Bearer-Authentifizierung, enthält aber ausdrücklich kein Token. Eine Anfrage erfolgt erst durch „Verbindung testen“, „Modelle neu laden“ oder „Mit KI prüfen“. Weil der Host außerhalb des lokalen Netzes liegen kann, zeigt die Oberfläche eine Datenschutzwarnung. Alternativ lassen sich weiterhin rein lokale LM-Studio-Profile anlegen.

Der Standard-Timeout beträgt 900.000 ms beziehungsweise fünfzehn Minuten. Beim Update werden Profile mit einem früheren Standardwert von 60.000 oder 300.000 ms einmalig auf den neuen Wert migriert; andere manuell gewählte Werte bleiben unverändert. HTTP 408 und 504 werden ausdrücklich als server- beziehungsweise proxyseitige Zeitlimits gemeldet, weil der Browser-Timeout diese Abbrüche nicht beheben kann.

## KI-Kommunikation und Fehlerbehandlung

`GM_xmlhttpRequest` führt originübergreifende HTTP-Anfragen aus. Da Profile beliebige, bewusst konfigurierte Hosts unterstützen, benötigt das Script `@connect *`. Das Script kontaktiert trotzdem ausschließlich die im aktiven Profil gespeicherte Adresse und enthält keine Telemetrie, Analytics oder Fehlerberichte.

`testAiConnection()` ruft den Models-Endpunkt auf, prüft HTTP-Status und JSON-Struktur und extrahiert IDs beziehungsweise Namen. Unterstützt werden OpenAI-Listen unter `data`, Listen unter `models` sowie direkte Arrays. Bearer Tokens werden als `Authorization: Bearer …`, API Keys als `X-API-Key` gesendet.

Der Einstellungsdialog lädt die Modelle des aktiven Profils direkt beim Öffnen und erneut bei einem Profilwechsel. Die manuelle Aktualisierung bleibt zusätzlich verfügbar.

`callAi()` sendet eine OpenAI-kompatible Chat-Completions-Anfrage. Der zentrale, editierbare Systemprompt verbietet erfundene Inhalte und automatische Entscheidungen. `parseAiResponse()` akzeptiert reines JSON sowie JSON in Markdown-Codeblöcken. Das bevorzugte Schema trennt `formalIssues`, `contentIssues`, `hourIssues` und neutrale `notes`; das frühere Feld `issues` bleibt als Fallback erhalten. Nur die drei Auffälligkeitsarrays fließen in den KI-Zähler ein. Ungültige oder leere Antworten werden als verständlicher Fehler angezeigt; das restliche Userscript läuft weiter.

Die Einstellungsmigration ersetzt ausschließlich den unveränderten früheren Standardprompt. Benutzerdefinierte Systemprompts werden nicht überschrieben.

Der optionale Debug-Modus protokolliert nur technische Ereignisse und Statuscodes. Tokens, Berichtsheftinhalte und personenbezogene Daten werden nicht protokolliert.

## Kommentarworkflow und Entscheidungsgrenzen

Ein KI-Kommentar wird zunächst in einer bearbeitbaren Vorschau angezeigt. „Kommentar übernehmen“ trägt ihn erst nach einer bewussten Aktion in `#remarks` ein. Bei vorhandenem Text stehen „Anhängen“, „Ersetzen“ und „Abbrechen“ zur Wahl. Das Script speichert oder sendet das Formular niemals automatisch und löst weder Annahme noch Rückgabe aus.

## Userscript-APIs

- `GM_getValue`: lokale Einstellungen und getrennte Secrets lesen
- `GM_setValue`: lokale Einstellungen und getrennte Secrets schreiben
- `GM_xmlhttpRequest`: Models- und Chat-Endpunkte originübergreifend aufrufen

Vor Version 2.0.0 wurden keine Userscript-APIs verwendet.
