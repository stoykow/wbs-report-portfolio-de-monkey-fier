# WBS Berichtsheft de-monkey-fier

Ein Violentmonkey-Userscript für Ausbilderinnen und Ausbilder im WBS eCampus. Es ergänzt den bestehenden Berichtsheft-Workflow um lokale Prüfungen, Kommentarhilfen und einen optionalen KI-Assistenten für OpenAI-kompatible Server.

Die KI ist eine Assistenzfunktion. Sie nimmt keine Berichtshefte an, gibt keine Berichtshefte zurück und sendet keine WBS-Formulare. Eine Auswertung kann ausschließlich nach einem zusätzlichen ausdrücklichen Klick anonymisiert an den eigenen Feedbackdienst gemeldet werden.

## Installation

1. [Violentmonkey](https://violentmonkey.github.io/) installieren.
2. [Userscript aus diesem Fork öffnen](https://github.com/stoykow/wbs-report-portfolio-de-monkey-fier/raw/refs/heads/master/wbs-report-portfolio-de-monkey-fier.user.js).
3. In Violentmonkey „Installieren“ wählen.
4. Die Berichtsheftübersicht oder ein Berichtsheft im WBS eCampus öffnen.

![Installation in Violentmonkey](./docs/installieren.png)

Bei einer neuen Version kann das Script in Violentmonkey über „Aktualisieren“ neu geladen werden.

### Optionale Serienprüfung

Für die sequenzielle Bearbeitung der bis zu 50 aktuell sichtbaren Berichte gibt es ein separates Begleit-Userscript:

1. Zuerst das Hauptscript wie oben beschrieben installieren und konfigurieren.
2. [WBS Berichtsheft Serienprüfung installieren](https://github.com/stoykow/wbs-report-portfolio-de-monkey-fier/raw/refs/heads/master/wbs-berichtsheft-serienpruefung.user.js).
3. In der Berichtsübersicht den gewünschten Filter anwenden.
4. „Angezeigte Berichte prüfen (X)“ anklicken.

Das Begleitscript übernimmt alle aktuell sichtbaren Zeilen mit einem aufrufbaren Bericht – unabhängig davon, ob ihr Status „Eingereicht“, „Angenommen“ oder „Zurückgegeben“ lautet. Es öffnet immer nur einen Bericht im selben Tab und startet dort den KI-Assistenten des Hauptscripts. Bei bereits erledigten Berichten führt „Geprüft → Nächster Bericht“ unmittelbar zum nächsten Eintrag. Nach einer von dir ausdrücklich ausgelösten und durch WBS bestätigten Annahme oder Rückgabe öffnet es den nächsten Bericht automatisch. „Überspringen“, „Zur Liste“ und „Abbrechen“ bleiben jederzeit verfügbar.

Annahme, Rückgabe, Kommentarübernahme und Formularspeicherung werden niemals eigenständig ausgelöst. Die aktive Warteschlange liegt ausschließlich im lokalen Userscript-Speicher und wird nach Abschluss oder Abbruch entfernt. Das Hauptscript [wbs-report-portfolio-de-monkey-fier.user.js](./wbs-report-portfolio-de-monkey-fier.user.js) bleibt von dieser Erweiterung unabhängig.

## Bestehende Workflow-Hilfen

### Berichtsheftübersicht

- Schnellzugriff auf das nächste Berichtsheft im aktuellen oder in einem neuen Tab
- automatischer Filter auf eingereichte Berichtshefte, wenn zuvor „Alle“ gewählt war
- Warnung bei einem abweichenden Filter
- deaktivierte Annahme- und Rückgabeaktionen im Kontextmenü zum Schutz vor versehentlichen Klicks

### Einzelnes Berichtsheft

- deutlich unterscheidbare Buttons für „Annehmen“ und „Zurückgeben“
- konfigurierbare Schlagwortsuche mit Markierungen
- Prüfung der dreistelligen Berichtsnummer
- Prüfung von Tages- und Gesamtstunden
- zusätzliche lokale Hinweise zu leeren Arbeitstagen, kurzen oder wiederholten Beschreibungen, Tätigkeiten ohne Stunden, ungewöhnlichen Stunden, Wochenendeinträgen und Abwesenheiten

Die Begriffe `FPA`, `Prüfung`, `Test`, `Wiederholung` und `Vorbereitung` erzeugen für sich allein keine lokale Auffälligkeit.

Alle Prüfungen sind Hinweise und ersetzen keine manuelle Beurteilung.

Die frühere Leiste mit festen Kommentarvorlagen wurde ab Version 2.1.0 entfernt. KI-Kommentarvorschläge bleiben weiterhin bewusst übernehmbar.

## KI-Assistent

Auf einem geöffneten Berichtsheft erscheint der Bereich „🤖 KI-Assistent“. Die Schaltfläche „⚙ KI-Einstellungen“ ist außerdem unten rechts verfügbar.

Der Assistent kann unter anderem auf folgende Punkte hinweisen:

- zu allgemeine oder sehr kurze Tätigkeitsbeschreibungen
- fehlende Informationen und mögliche Rückfragen
- Wiederholungen und erkennbare Widersprüche
- unklare FPA-Einträge
- auffällige Abwesenheiten
- Stundenangaben

Im Hauptscript startet eine KI-Prüfung ausschließlich nach einem Klick auf „Mit KI prüfen“. Wenn das optionale Begleitscript verwendet wird, gilt der ausdrückliche Klick auf „Angezeigte Berichte prüfen“ für die nacheinander geöffneten Berichte als Startfreigabe; es wird weiterhin immer nur eine KI-Prüfung gleichzeitig ausgeführt.

## KI-Konfiguration

Die Standardkonfiguration ist für das OpenAI-kompatible LM-Studio-Gateway vorbereitet:

```text
Anbieter:        LM Studio
Server:          https://llm.nik0.de
Models Endpoint: /v1/models
Chat Endpoint:   /v1/chat/completions
Temperature:     0.2
Ausgabetokens:   500
Timeout:         900000 ms
Authentifizierung: Bearer Token
```

Das Token wird nicht mit dem Userscript ausgeliefert und muss im eigenen Violentmonkey-Speicher eingetragen werden. Weil das Gateway außerhalb des lokalen Netzes liegen kann, zeigt das Script dafür eine Datenschutzwarnung.

In den Einstellungen lassen sich folgende Werte ohne Änderung des Quellcodes bearbeiten:

- KI-Unterstützung aktivieren oder deaktivieren
- Anbieter: LM Studio, OpenAI-kompatible API oder benutzerdefiniert
- Serveradresse und Endpunkte
- automatisch geladene oder manuell eingegebene Modelle
- Temperature, maximale Ausgabetokens, Reasoning / Thinking und Timeout
- keine Authentifizierung, Bearer Token oder API Key
- zentraler Systemprompt
- optionaler Debug-Modus

Der eingebaute Systemprompt verlangt außerdem eine vollständig ausgeschriebene und eindeutige Modulbezeichnung; eine alleinstehende Abkürzung reicht nicht aus. Rückmeldungen werden in direkter Du-Ansprache formuliert. Der Kommentarvorschlag enthält nur konkrete Korrekturen und notwendige Rückfragen, keine positiven oder neutralen Punkte. Lediglich bei den ersten fünf Berichten darf genau ein kurzer ermutigender Satz ergänzt werden.

Auch vollständig oder weitgehend leere Berichte können mit der KI geprüft werden. Die lokale Prüfung kennzeichnet den fehlenden Inhalt weiterhin; die KI kann daraus einen passenden, ausschließlich auf die fehlenden Angaben bezogenen Kommentarvorschlag erstellen.

Beim Öffnen der KI-Einstellungen und beim Wechsel des Profils wird die Modellliste automatisch geladen. „Verbindung testen“ prüft den Models-Endpunkt zusätzlich; „Modelle neu laden“ bleibt für eine manuelle Aktualisierung verfügbar. Wenn ein Server keine Modellliste unterstützt, kann der Modellname manuell eingetragen werden.

Jedes KI-Profil besitzt die Auswahl „Reasoning / Thinking“. Bei LM Studio werden die Optionen des ausgewählten Modells automatisch über `/api/v1/models` aus `capabilities.reasoning.allowed_options` geladen; der Modellstandard wird neben „Automatisch“ angezeigt. „Automatisch“ sendet keine Reasoning-Vorgabe. Nicht unterstützte Optionen werden nicht angeboten beziehungsweise deaktiviert. Fällt der native Capabilities-Endpunkt aus, bleibt die Auswahl sicher auf „Automatisch“ und der konfigurierbare `/v1/models`-Endpunkt wird als Fallback verwendet. LM-Studio-Anfragen gehen anschließend nativ an `/api/v1/chat` und verwenden `max_output_tokens`; andere Provider bleiben bei Chat-Completions mit `max_tokens`.

Die KI-Details werden kompakt als Tageszeile mit Original und kurzer Erläuterung beziehungsweise Vorschlag dargestellt. Neutrale Hinweise bleiben separat und werden nicht als Auffälligkeiten gezählt.

### Feedback zu einer Auswertung

Nach einer erfolgreich verarbeiteten KI-Prüfung wird „Auswertung melden“ verfügbar. Der Dialog erfasst eine Gesamtbewertung, mindestens eine Fehlerkategorie, eine freie Einschätzung und das erwartete Ergebnis. Vor dem Senden wird das vollständige JSON angezeigt. Erst „Feedback senden“ überträgt die Vorschau an `https://llmfeedback.nik0.de/api/v1/feedback.php`.

Der Teilnehmername, die WBS-URL und interne WBS-Kennungen werden nicht in den Feedback-Payload übernommen. Das vorhandene LLM-Token wird ausschließlich lokal zu einem SHA-256-Fingerabdruck verarbeitet. Nur dieser nicht rücklesbare Fingerabdruck dient zur Gruppierung zusammengehöriger Rückmeldungen; das echte Token wird weder an den Feedbackdienst gesendet noch dort gespeichert. Beim Wechsel des LLM-Tokens entsteht eine neue anonyme Zuordnung.

### KI-Profile

Mehrere Serverkonfigurationen werden vollständig unterstützt. Profile können erstellt, ausgewählt, bearbeitet und gelöscht werden, beispielsweise für Büro, Zuhause oder einen Testserver. Das aktive Profil bestimmt Server, Modell und Authentifizierung.

### Kurse und Berichtsnummern

In den Einstellungen können mehrere Kurse mit Name und Startdatum angelegt werden. Für den aktiven Kurs gilt die Kalenderwoche des Kursstarts als Berichtswoche `001`. Erkennt das Script den Berichtszeitraum auf der WBS-Seite, berechnet es die erwartete dreistellige Berichtsnummer und vergleicht sie lokal mit dem eingetragenen Wert. Ohne erkennbaren Berichtszeitraum wird keine Nummer vermutet.

### Feiertage

Der Einstellungsdialog enthält eine nach Jahr wählbare Liste der gesetzlichen Feiertage in Deutschland einschließlich landesweiter, örtlicher und bekannter einmaliger Sonderfälle. Die Berechnung erfolgt vollständig lokal und benötigt keine Kalender-API. Die Vereinigungsmenge wird entsprechend dem vorgesehenen WBS-Ablauf unabhängig vom regionalen Geltungsbereich als schulungsfrei behandelt und zusammen mit dem erkannten Berichtszeitraum an die KI übergeben. Leere Wochenenden werden nicht an die KI übertragen.

Die Feiertagsdaten orientieren sich an der [Feiertagsübersicht der Deutschen Bundesbank](https://www.bundesbank.de/resource/blob/749314/05f64c15196c20776ae7c22a2739b03c/mL/feiertage-in-deutschland-1-data.pdf). Örtliche und besondere Fälle sind zusätzlich anhand offizieller Quellen für [Bayern](https://www.stmi.bayern.de/staat-und-verfassung/feiertage/), [Berlin](https://gesetze.berlin.de/bsbe/document/jlr-FeiertGBEV9P1) und [Sachsen](https://www.revosax.sachsen.de/vorschrift_gesamt/3997/26160.pdf) erfasst.

## LM Studio einrichten

1. LM Studio starten.
2. Ein geeignetes Chat-Modell herunterladen und laden.
3. Den lokalen API-Server starten.
4. Für Zugriff von einem anderen Rechner den Netzwerkzugriff in LM Studio erlauben.
5. Standardmäßig Port `1234` verwenden.
6. Im Userscript `http://192.168.113.1:1234` beziehungsweise die tatsächliche lokale IP-Adresse konfigurieren.
7. „Verbindung testen“ und anschließend ein Modell auswählen.

Firewall und LM-Studio-Einstellungen müssen Verbindungen aus dem lokalen Netzwerk zulassen. Falls nur derselbe Rechner zugreift, kann beispielsweise `http://localhost:1234` verwendet werden.

## Authentifizierung

Aktuell benötigt die vorbereitete LM-Studio-Konfiguration kein Token. Für andere Server stehen zwei Varianten bereit:

- Bearer Token: `Authorization: Bearer <Token>`
- API Key: `X-API-Key: <Token>`

Tokens gehören niemals in den Quellcode, in Git, in Screenshots oder in Fehlerberichte. Das Script speichert Tokens getrennt von den normalen Profileinstellungen im lokalen Violentmonkey-Speicher. Dieser Speicher ist kein vollwertiger Passwort-Tresor; auf gemeinsam genutzten oder nicht vertrauenswürdigen Browserprofilen sollten keine dauerhaften Tokens hinterlegt werden. Für Feedback wird nur ein lokal berechneter Fingerabdruck verwendet, niemals das Token selbst.

## Datenschutz und Datenminimierung

Berichtsheftdaten können personenbezogen sein. Deshalb gilt:

- Das vorbereitete Gateway `llm.nik0.de` kann sich außerhalb des lokalen Netzes befinden und wird deshalb sichtbar gekennzeichnet.
- Bei möglicherweise externen Servern erscheint eine deutliche Warnung.
- Übertragen werden nur Berichtsnummer, Gesamtstunden sowie Wochentage mit Stunden und vorhandenen Tätigkeitsbeschreibungen.
- Namen, E-Mail-Adressen, Benutzer-IDs, Account-IDs und sonstige Metadaten werden nicht extrahiert.
- Berichtsheftinhalte werden nicht dauerhaft gespeichert.
- Es gibt keine Telemetrie, Analytics oder externen Fehlerberichte.
- Der Debug-Modus protokolliert keine Tokens, Berichtsheftinhalte oder personenbezogenen Daten.

Das Metadata-Feld `@connect *` ist erforderlich, damit bewusst angelegte Profile unterschiedliche Hosts verwenden können. Das Script sendet dennoch ausschließlich an die im aktiven Profil konfigurierte Adresse und nur nach einer ausdrücklichen Benutzeraktion.

## Strukturierte KI-Antwort

Der Systemprompt fordert ein JSON-Objekt mit `status`, `summary`, `formalIssues`, `contentIssues`, `hourIssues`, `notes` und `suggestedComment`. Formale, inhaltliche und Stundenauffälligkeiten werden getrennt dargestellt. `notes` erscheinen als neutrale Hinweise und werden nicht zur Zahl der KI-Auffälligkeiten addiert. Das frühere Feld `issues` bleibt als Fallback kompatibel.

„Keine Auffälligkeiten gemeldet“ erscheint ausschließlich bei Status `ok`, wenn `formalIssues`, `contentIssues` und `hourIssues` leer sind. JSON in Markdown-Codeblöcken wird ebenfalls verarbeitet. Ungültige oder leere Antworten führen nur zu einer Fehlermeldung im KI-Bereich; lokale Prüfungen und der restliche Workflow bleiben funktionsfähig.

Der Standardprompt verbietet ausdrücklich, fehlende Tätigkeiten oder Zusammenhänge zu erfinden. Bei unklaren Einträgen soll die KI eine genauere Beschreibung anfordern.

Bei Updates werden nur bekannte, unveränderte frühere Standardprompts auf die aktuelle Fassung aktualisiert. Eigene oder bereits angepasste Systemprompts bleiben erhalten.

Der Einstellungsdialog zeigt an, ob der Standardprompt oder ein eigener gespeicherter Prompt aktiv ist. Ein eigener Prompt bleibt auch bei weiteren Script-Updates erhalten. Nur „Standardprompt wiederherstellen“ ersetzt ihn bewusst.

## Kommentarvorschläge

Ein nicht leerer KI-Vorschlag erscheint zunächst in einem bearbeitbaren Vorschaufeld. Bei leerem `suggestedComment` erzeugt das Script keinen künstlichen Kommentar. Erst „Kommentar übernehmen“ schreibt einen vorhandenen Vorschlag in das Kommentarfeld. Wenn dort bereits Text steht, kann zwischen „Anhängen“, „Ersetzen“ und „Abbrechen“ gewählt werden. Das Formular wird dabei nicht gespeichert oder abgesendet.

## Entwicklung und Tests

Voraussetzung für die automatisierten Tests ist eine aktuelle Node.js-Version.

```powershell
node --check .\wbs-report-portfolio-de-monkey-fier.user.js
node .\tests\userscript.test.js
```

Die Tests decken Konfigurationsnormalisierung, URL- und Authentifizierungslogik, Modelllisten, Stundenwerte, lokale Prüfungen, Anfrageaufbau, JSON-Parsing, Kommentarerzeugung und die Erkennung lokaler Server ab.

Die vollständige Bestandsanalyse, DOM-Selektoren und Modulgrenzen stehen in [docs/ARCHITEKTUR.md](./docs/ARCHITEKTUR.md).

## Erweiterte klassische Konfiguration

Die Liste `commentPOIs` am Anfang des Userscripts kann weiterhin direkt angepasst werden. Profile, Kurse und KI-Einstellungen sollten dagegen über die Oberfläche verwaltet werden, damit sie bei Script-Updates im Violentmonkey-Speicher erhalten bleiben.

## FAQ

### Verändert das Script WBS-Serverdaten?

Das Script erweitert nach dem Laden lokal die Darstellung im Browser. Nur vorhandene WBS-Formularaktionen können wie zuvor durch den Benutzer ausgelöst werden. Der KI-Assistent selbst löst keine Annahme, Rückgabe, Speicherung oder Übermittlung aus.

### Warum funktioniert es möglicherweise nicht mit Chrome?

Je nach Browser- und Manifest-Version kann es Einschränkungen bei Userscript-Erweiterungen geben. In diesem Fall einen unterstützten Browser oder alternativ eine kompatible Userscript-Verwaltung wie ScriptCat prüfen.
