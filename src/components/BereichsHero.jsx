const BEREICHE = Object.freeze({
  kino: {
    kicker: "Wien · Programm & Termine",
    titel: "Kino",
    text: "Was läuft, was passt zu dir und welche Termine willst du dir merken?",
  },
  mediathek: {
    kicker: "Deine Sammlung",
    titel: "Mediathek",
    text: "Bewertungen, Besitz, Must-Watch und alle persönlichen Einträge.",
  },
  streaming: {
    kicker: "Deine Dienste · neue Funde",
    titel: "Streaming",
    text: "Dein Programm und Entdeckungen aus den verbundenen Katalogen.",
  },
  blog: {
    kicker: "Texte · Listen · Verknüpfungen",
    titel: "Blog",
    text: "Filme festhalten, einordnen und mit deiner Mediathek verbinden.",
  },
  finder: {
    kicker: "Filme · App-Hilfe · Orientierung",
    titel: "Suche",
    text: "Durchsuche deine Inhalte oder frag, wo du eine Funktion findest.",
  },
  daten: {
    kicker: "Konto · Darstellung · Daten",
    titel: "Settings",
    text: "Passe Kinodreieck an und verwalte Konto, Sicherungen und Quellen.",
  },
});

export function BereichsHero({ bereich }) {
  const inhalt = BEREICHE[bereich];
  if (!inhalt) return null;
  return (
    <header className="kd-bereichshero">
      <span className="kd-dash-bulbs" aria-hidden="true" />
      <div className="kd-bereichshero-kicker">{inhalt.kicker}</div>
      <h1>{inhalt.titel}</h1>
      <p>{inhalt.text}</p>
    </header>
  );
}
