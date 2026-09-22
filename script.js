// ===== Cambio lingua IT/EN =====
// Idea semplice: ogni testo del sito esiste in due copie nell'HTML,
// una con classe "it" e una con classe "en" (nascosta di default con
// l'attributo "hidden"). Questo script si limita ad accendere/spegnere
// quell'attributo a seconda del bottone cliccato. Nessuna libreria,
// nessun framework: solo JavaScript "vanilla".

const btnIt = document.getElementById("lang-it");
const btnEn = document.getElementById("lang-en");

function setLanguage(lang) {
  const isItalian = lang === "it";

  // Mostra/nasconde tutti i blocchi di testo con classe .it / .en
  document.querySelectorAll(".it").forEach((el) => {
    el.hidden = !isItalian;
  });
  document.querySelectorAll(".en").forEach((el) => {
    el.hidden = isItalian;
  });

  // Aggiorna l'attributo lang della pagina (utile per accessibilità/SEO)
  document.documentElement.lang = lang;

  // Aggiorna lo stile dei due bottoni IT/EN per mostrare quale è attivo
  btnIt.classList.toggle("active", isItalian);
  btnEn.classList.toggle("active", !isItalian);
}

btnIt.addEventListener("click", () => setLanguage("it"));
btnEn.addEventListener("click", () => setLanguage("en"));

// Lingua di partenza: italiano. (Se un giorno vorrai ricordare la scelta
// dell'utente tra una visita e l'altra, questo è il punto in cui si
// aggiungerebbe il salvataggio della preferenza — ma per ora teniamo
// tutto semplice, come richiesto.)