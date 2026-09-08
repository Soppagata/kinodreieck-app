/* Derselbe tatsächlich darstellbare A–Z-Pool gilt beim Tageswurf und bei der
   Landung. Zahlentitel weichen nur auf einen passenden Originaltitel aus. */
export function buchstabeUndTitel(film) {
  for (const titel of [film.titel, film.originaltitel]) {
    const text = (titel || "").trim();
    const b = text.charAt(0).toUpperCase();
    if (b >= "A" && b <= "Z") return { b, titel: text, jahr: film.jahr, film };
  }
  return null;
}
