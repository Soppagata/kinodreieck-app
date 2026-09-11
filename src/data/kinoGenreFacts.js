/* Optionale, belegte Ergänzungen für Programmeinträge ohne API-Genre.
   Jeder Record braucht eine eindeutige film_at_id; Titel/Jahr werden nie zum
   Matching verwendet. Programmblöcke und Sneak Previews bleiben ohne Genre,
   solange kein werkbezogener Beleg vorliegt. */
export const KINO_GENRE_FACTS = Object.freeze([
  Object.freeze({
    film_at_id: 403137796,
    title: "All My Sisters",
    year: 2025,
    genres: Object.freeze(["Dokumentarfilm"]),
    evidence: Object.freeze([
      "https://filminstitut.at/filme/all-my-sisters",
      "https://littledream-pictures.com/portfolio/all-my-sisters/",
    ]),
  }),
  ...[
    [403187925, "In These Moments I Feel Safe: At The End of the Day", "https://dotdotdot.at/programm/at-the-end-of-the-day/"],
    [403187926, "In These Moments I Feel Safe: Before Your Were My Mother", "https://dotdotdot.at/programm/before-you-were-my-mother/"],
    [403187924, "In These Moments I Feel Safe: Doctor's Orders", "https://dotdotdot.at/programm/doctors-orders/"],
    [403187928, "In These Moments I Feel Safe: I Can See It Now", "https://dotdotdot.at/programm/i-can-see-it-now/"],
    [403187929, "In These Moments I Feel Safe: Mothering Heights", "https://dotdotdot.at/programm/mothering-heights/"],
    [403187927, "In These Moments I Feel Safe: Radical Proximities", "https://dotdotdot.at/programm/radical-proximities/"],
    [403187923, "In These Moments I Feel Safe: Where We Belong", "https://dotdotdot.at/programm/where-we-belong/"],
  ].map(([film_at_id, title, url]) => Object.freeze({
    film_at_id, title, genres: Object.freeze(["Kurzfilm"]),
    evidence: Object.freeze([url, "https://www.film.at/amp/news/dotdotdot-sonderausgabe-2026-palais-auersperg/403189556"]),
  })),
  ...[
    [403186008, "Peggy Ahwesh - Programm 1"],
    [403186009, "Peggy Ahwesh - Programm 2"],
    [403186010, "Peggy Ahwesh - Programm 3"],
    [403186011, "Peggy Ahwesh - Programm 4"],
  ].map(([film_at_id, title]) => Object.freeze({
    film_at_id, title, genres: Object.freeze(["Kurzfilm"]),
    evidence: Object.freeze(["https://www.uncut.at/wien/filmmuseum/kinoprogramm/", "https://www.esel.at/de/event/in-person-peggy-ahwesh--0348fNKsG9Kf4GN1XLTzKu"]),
  })),
  Object.freeze({
    film_at_id: 403186013,
    title: "Kino für die Kleinsten - Tierisch was los!",
    genres: Object.freeze(["Kinderfilm", "Kurzfilm"]),
    evidence: Object.freeze(["https://cinephilia.at/movies/6567", "https://nonstopkino.at/collections/kino-fuer-die-kleinsten/"]),
  }),
  Object.freeze({
    film_at_id: 402968908,
    title: "Kurzfilm-Programm",
    genres: Object.freeze(["Kurzfilm"]),
    evidence: Object.freeze(["https://www.film.at/kurzfilm-programm"]),
  }),
]);

export const KINO_GENRE_GAPS = Object.freeze([
  Object.freeze({
    film_at_id: 400201602,
    title: "Was ist Film - Programm 5",
    reason: "Programm enthält Zemlja; die Quelle belegt kein gemeinsames Genre für den Programmblock.",
    evidence: "https://www.filmmuseum.at/jart/prj3/filmmuseum/data/uploads/Programm/2024_0910_Programmheft_2024-08-13_1808786.pdf",
  }),
  Object.freeze({
    film_at_id: 400201599,
    title: "Was ist Film - Programm 6",
    reason: "Programm kombiniert Flaming Creatures und Triumph des Willens; kein gemeinsames Genre wird behauptet.",
    evidence: "https://www.filmmuseum.at/jart/prj3/filmmuseum/data/uploads/Programm/2024_0910_Programmheft_2024-08-13_1808786.pdf",
  }),
  Object.freeze({
    film_at_id: 400302105,
    title: "sneak preview",
    reason: "Der gezeigte Titel ist vorab nicht veröffentlicht; ein Genre wäre erfunden.",
    evidence: "https://www.film.at/sneak-preview",
  }),
]);
