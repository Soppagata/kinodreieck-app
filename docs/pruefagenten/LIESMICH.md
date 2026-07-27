# Prüfagenten für den Bau der KI-Funktionen (Etappen 6–10)

**Ablage:** Diese Dateien liegen als Vorlage in `docs/pruefagenten/`, weil
`.claude/` über die Gerätebrücke bewusst schreibgeschützt ist (gleiche Regel
wie `.github/workflows/`: ausführbare Instruktionen legt nur Max ab). Nach
Durchsicht aktivieren mit:

```
mkdir -p .claude/agents && cp docs/pruefagenten/*-pruefer.md docs/pruefagenten/scope-waechter.md .claude/agents/
```

Die Kopien unter `docs/pruefagenten/` bleiben die reviewbare Quelle im Repo.

Angelegt 26.07.2026 (Zwischenplanungs-Session, Entscheid Max). Vier
read-only Prüfrollen, die Bau-Sessions als Subagenten spawnen, damit
KI-Funktionen nachweislich sauber gebaut werden — statt dass die
Bau-Session sich selbst benotet.

| Agent | Prüft | Pflicht-Gate |
|---|---|---|
| `scope-waechter` | Steckbrief-/Plan-Treue, Nicht-Ziele, eingefrorene Pfade, additive Migrationen | nach JEDER Bauphase, vor jeder Fertig-Meldung |
| `ki-datenpfad-pruefer` | Modellantwort → Validierung → DB; Prognose≠Bewertung; RLS; Matching-Guards | vor jedem STOP mit DB-/Antwortpfad-Bezug |
| `kosten-limit-pruefer` | alles durch `ai-task`, Limits vor dem Call, Protokoll lückenlos, keine stillen Kostenpfade, Tests gemockt | vor jedem STOP, der KI-Aufrufe ändert |
| `privatsphaere-pruefer` | Log-Verbote, Bilder temporär, Opt-ins, KI-Schalter, Sitzungsbindung | vor STOPs mit Log-/Bild-/Profilbezug + vor der Abnahme |

## Spielregeln

1. **Beweis-Pflicht:** Jeder Befund braucht Datei:Zeile oder Diff-Ausschnitt.
   „Nichts gefunden" zählt nur mit vollständiger Prüfliste. Verdikt je Gate:
   PASS/FAIL.
2. **BLOCKER blockieren:** Ein CONFIRMED-BLOCKER stoppt die Fertig-Meldung
   der Phase. Fixen, denselben Prüfer erneut laufen lassen, erst dann STOP
   zur Freigabe an Max. HINWEISE kommen als Liste an den STOP — Max
   entscheidet.
3. **Eingaben bereitstellen:** Die Bau-Session gibt jedem Prüfer die Pfade
   zu Steckbrief und Plan-Doc mit (Steckbriefe liegen im Claude-Projekt;
   der Auftrag legt sie zu Sessionbeginn als Dateien in den Arbeitsordner).
   Ohne diese Eingaben brechen die Prüfer ab — absichtlich.
4. **Read-only:** Prüfagenten ändern nie Code. Fixes macht die Bau-Session.
5. **Fallback:** Erscheinen die Agenten in einer Session nicht in der
   Agent-Liste, wird stattdessen ein general-purpose-Subagent mit dem
   vollständigen Inhalt der jeweiligen Datei als Auftrag gespawnt —
   die Dateien hier sind die einzige Quelle der Rollen.

## Ehrliche Grenze

Die Prüfagenten ersetzen NICHT die empirischen Proben des Projekts:
Rauchprobe gegen die deployte Function, `npm run test:rls` gegen die echte
Datenbank, komplette Testsuite grün (release-gate). Sie prüfen Code und
Belege — die Abnahme einer Etappe braucht weiterhin beides. Ebenso bleibt
der adversariale End-Review vor der Abnahme bestehen; die vier Rollen
machen ihn schärfer, nicht überflüssig.

## Pflege

Neue Funktionsblöcke ergänzen die Prüflisten der Rollen (z. B. neue
Log-Verbote), statt neue Rollen zu erfinden. Änderungen an diesen Dateien
sind Auftragsbestandteil und werden im Etappen-Plan vermerkt.
