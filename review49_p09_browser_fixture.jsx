import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StartTab } from './src/tabs/StartTab.jsx';
import { setzeTheme, T } from './src/lib/tokens.js';
import { normalisiereWochenplan, neuerFolgenReminder, reminderFaellig, datumPlusTage } from './src/lib/wochenplan.js';
import { reminderIcsEvent, erstelleIcs } from './src/lib/kalenderExport.js';
const theme = new URLSearchParams(location.search).get('theme') || 'dunkel';
setzeTheme(theme);
document.documentElement.dataset.kdSchrift = 'normal';
window.writes = [];
window.rejections = [];
window.addEventListener('unhandledrejection', e => window.rejections.push(String(e.reason)));
window.saved = { version: 1, eintraege: [] };
const root = createRoot(document.getElementById('root'));
let generation = 0;
function Fixture({ initial }) {
  const [plan, setPlan] = useState(initial);
  window.replacePlan = setPlan;
  return <div data-fixture-generation={generation} className={'kd-wrap kd-schrift-normal' + (theme === 'showa' ? ' kd-showa' : theme === 'neon-noir' ? ' kd-neon-noir' : '')}
    style={{ minHeight: '100dvh', background: T.saal, color: T.leinwand, fontFamily: "'Space Grotesk', sans-serif", padding: '0 0 60px' }}>
    <div className="kd-app" data-session-mode="account"><main style={{ maxWidth: 860, margin: '0 auto', padding: '20px 22px 0' }}>
      <StartTab wochenplan={plan} onWochenplanAendern={async next => {
        window.writes.push(JSON.parse(JSON.stringify(next)));
        localStorage.setItem('review49-p09-plan', JSON.stringify(normalisiereWochenplan(next)));
        window.saved = JSON.parse(localStorage.getItem('review49-p09-plan'));
        setPlan(window.saved);
        return window.saved;
      }} />
    </main></div>
  </div>;
}
window.reset = (entries = []) => {
  window.saved = normalisiereWochenplan({ version: 1, eintraege: entries });
  window.writes = [];
  root.render(<Fixture key={++generation} initial={window.saved} />);
  return generation;
};
window.seed = (ende = {typ: 'nie'}) => neuerFolgenReminder({id: 'existing', titel: 'Vorhanden', art: 'termin', startdatum: '2026-12-31', wochentage: [4], ende});
window.inspectSaved = () => {
  const entry = window.saved.eintraege.at(-1);
  return { entry, twelfthDue: reminderFaellig(entry, datumPlusTage(new Date(entry.startdatum + 'T12:00:00'), 77)),
    thirteenthDue: reminderFaellig(entry, datumPlusTage(new Date(entry.startdatum + 'T12:00:00'), 84)), ics: erstelleIcs([reminderIcsEvent(entry)]) };
};
window.reset();
