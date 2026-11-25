import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';

export type AppLocale = 'en' | 'sv';

/** Swedish UI strings. Keys are the English source strings so missing keys fall back to English. */
const sv: Record<string, string> = {
  Home: 'Hem',
  Notes: 'Anteckningar',
  Insights: 'Insikter',
  Settings: 'Inställningar',
  Docs: 'Dokumentation',
  'Your thoughts, in one place': 'Dina tankar på ett ställe',
  WELCOME: 'VÄLKOMMEN',
  'KeRoDi is your simple companion for capturing ideas, reminders, and everyday thoughts. Open the Notes tab to start writing — everything you save stays on your device. If you want, the Insights tab can use AI to look for patterns across your notes.':
    'KeRoDi är din enkla hjälpreda för att samla idéer, påminnelser och vardagstankar. Öppna fliken Anteckningar för att börja skriva — allt du sparar stannar på din enhet. Om du vill kan fliken Insikter använda AI för att hitta mönster i dina anteckningar.',
  'Hi, Welcome to KeRoDi Family': 'Hej, välkommen till KeRoDi-familjen',
  'Your notepad is empty': 'Din anteckningsbok är tom',
  note: 'anteckning',
  notes: 'anteckningar',
  'Write a note…': 'Skriv en anteckning…',
  'Add note': 'Lägg till anteckning',
  Delete: 'Ta bort',
  'Nothing here yet. Write your first note above.': 'Inget här ännu. Skriv din första anteckning ovan.',

  'Something went wrong.': 'Något gick fel.',
  'Leave blank to keep your saved key': 'Lämna tomt för att behålla din sparade nyckel',
  'Paste your API key': 'Klistra in din API-nyckel',
  'Get a free key from ': 'Skaffa en gratis nyckel från ',
  'Get a key from ': 'Skaffa en nyckel från ',
  '. It is stored encrypted on this device.': '. Den sparas krypterad på den här enheten.',
  'Save key & enable': 'Spara nyckel och aktivera',
  'Save key': 'Spara nyckel',
  'NOTHING TO ANALYSE YET': 'INGET ATT ANALYSERA ÄN',
  'Write a few notes first, then come back here to see patterns across them.':
    'Skriv några anteckningar först och kom tillbaka hit för att se mönster bland dem.',
  'SET UP AI INSIGHTS': 'KONFIGURERA AI-INSIKTER',
  'Insights sends your notes to an AI model to look for patterns. You bring your own API key — it stays on this device and is sent only to the provider you choose. Nothing is sent until you tap Generate.':
    'Insikter skickar dina anteckningar till en AI-modell för att hitta mönster. Du använder din egen API-nyckel — den stannar på den här enheten och skickas bara till den leverantör du väljer. Inget skickas förrän du trycker på Skapa.',
  'Enable with saved key': 'Aktivera med sparad nyckel',
  'Enable without a key (use a hosted server)': 'Aktivera utan nyckel (använd en värdserver)',
  'Using your {{provider}} key': 'Använder din nyckel för {{provider}}',
  'Using a hosted server': 'Använder en värdserver',
  Change: 'Ändra',
  Remove: 'Ta bort',
  'INSTRUCTIONS TO THE AI': 'INSTRUKTIONER TILL AI:N',
  Close: 'Stäng',
  Edit: 'Redigera',
  "Tell the AI how to read your notes. The required response format is added automatically, so your wording can't break it.":
    'Berätta för AI:n hur den ska läsa dina anteckningar. Det obligatoriska svarformatet läggs till automatiskt, så din formulerering kan inte förstöra det.',
  Save: 'Spara',
  'Reset to default': 'Återställ till standard',
  'Using your custom instructions.': 'Använder dina egna instruktioner.',
  'Using the default instructions.': 'Använder standardinstruktionerna.',
  'Analysing…': 'Analyserar…',
  'Refresh insights': 'Uppdatera insikter',
  'Generate insights': 'Skapa insikter',
  'COULD NOT GENERATE': 'KUNDE INTE SKAPA',
  'Turn off AI insights': 'Stäng av AI-insikter',
  'Patterns in your wellbeing': 'Mönster i ditt välmående',
  'Across {{count}} note': 'Baserat på {{count}} anteckning',
  'Across {{count}} notes': 'Baserat på {{count}} anteckningar',
  SUMMARY: 'SAMMANFATTNING',
  'Mood: ': 'Stämning: ',
  positive: 'positiv',
  neutral: 'neutral',
  mixed: 'blandad',
  low: 'låg',
  THEMES: 'TEMAN',
  'POSITIVE PATTERNS': 'POSITIVA MÖNSTER',
  'THINGS TO WATCH': 'SAKER ATT HÅLLA KOLL PÅ',
  IDEAS: 'IDÉER',
  'Based on {{count}} note · {{time}} · {{provider}}':
    'Baserat på {{count}} anteckning · {{time}} · {{provider}}',
  'Based on {{count}} notes · {{time}} · {{provider}}':
    'Baserat på {{count}} anteckningar · {{time}} · {{provider}}',
  'This is not medical advice.': 'Detta är inte medicinsk rådgivning.',
  '{{count}} note': '{{count}} anteckning',
  '{{count}} notes': '{{count}} anteckningar',
  'No notes to analyse.': 'Inga anteckningar att analysera.',
  'The AI returned an unexpected response format.': 'AI:n returnerade ett oväntat svarformat.',

  From: 'Från',
  To: 'Till',
  'From {{query}}': 'Från {{query}}',
  'To {{query}}': 'Till {{query}}',
  'NO excluded': 'NO uteslutet',
  'Updated {{time}}': 'Uppdaterad {{time}}',
  'Not loaded yet': 'Inte laddad ännu',
  History: 'Historik',
  'View full history': 'Visa full historik',
  'Checking…': 'Kontrollerar…',
  'Check now': 'Kontrollera nu',
  '{{count}} new · Mark seen': '{{count}} nya · Markera som sedda',
  'Hidden: {{unavailable}} unavailable · {{expired}} expired':
    'Dolda: {{unavailable}} inte tillgängliga · {{expired}} utgångna',
  ' The site does not allow browser requests from other origins — try the native app.':
    ' Webbplatsen tillåter inte förfrågningar från andra ursprung — prova den inbyggda appen.',
  'New only': 'Endast nya',
  '{{count}} shown': '{{count}} visas',
  'Hertz routes. Alerts are sent by the worker.': 'Hertz-rutter. Aviseringar skickas av workern.',
  'No routes could be loaded.': 'Inga rutter kunde laddas.',
  'No routes are available right now.': 'Inga rutter är tillgängliga just nu.',
  'No routes match these filters.': 'Inga rutter matchar dessa filter.',
  NEW: 'NY',
  UNAVAILABLE: 'INTE TILLGÄNGLIG',
  EXPIRED: 'UTGÅNGEN',
  ACTIVE: 'AKTIV',
  'Car on request': 'Bil efter överenskommelse',
  'Available {{time}}': 'Tillgänglig {{time}}',
  'Return by {{time}}': 'Återlämnas senast {{time}}',
  'Expires {{time}}': 'Går ut {{time}}',
  'Detected {{time}}': 'Upptäckt {{time}}',
  'Baseline · time unknown': 'Baseline · tid okänd',
  ' · Gone {{time}}': ' · Försvann {{time}}',
  'Seen again {{count}}×': 'Sedd igen {{count}}×',
  ' · Last {{time}}': ' · Senast {{time}}',
  'Book on hertzfreerider.se': 'Boka på hertzfreerider.se',
  '{{duration}} left': '{{duration}} kvar',
  'Available again {{time}}': 'Tillgänglig igen {{time}}',
  'Unavailable {{time}}': 'Inte tillgänglig {{time}}',
  'Expired {{time}}': 'Utgången {{time}}',
  'Total unavailable {{duration}}': 'Totalt otillgänglig {{duration}}',
  '0m': '0m',
  '{{count}}m': '{{count}}m',
  '{{hours}}h {{minutes}}m': '{{hours}}h {{minutes}}m',
  '{{count}}h': '{{count}}h',
  '{{days}}d {{hours}}h': '{{days}}d {{hours}}h',
  '{{count}}d': '{{count}}d',

  'Enter a full URL, for example http://100.77.0.70:8787':
    'Ange en fullständig URL, till exempel http://100.77.0.70:8787',
  'Could not save the worker URL.': 'Kunde inte spara worker-URL:en.',
  'Could not reset the worker URL.': 'Kunde inte återställa worker-URL:en.',
  'Save the URL before testing it.': 'Spara URL:en innan du testar den.',
  'Worker reachable.': 'Workern är nåbar.',
  'Could not reach the worker. Check the URL and network.':
    'Kunde inte nå workern. Kontrollera URL:en och nätverket.',
  'Freerider settings': 'Freerider-inställningar',
  'Used by the routes tab and the new-route watcher.':
    'Används av rutten och bevakningen av nya rutter.',
  'SEARCH LOCATIONS': 'SÖK PLATSER',
  '{{count}} store': '{{count}} butik',
  '{{count}} stores': '{{count}} butiker',
  'Loading stores…': 'Laddar butiker…',
  'Type a city or part of a name. “Stockholm” matches every Stockholm store.':
    'Skriv en stad eller en del av ett namn. ”Stockholm” matchar alla butiker i Stockholm.',
  FROM: 'FRÅN',
  TO: 'TILL',
  'e.g. Stockholm': 't.ex. Stockholm',
  'e.g. Göteborg': 't.ex. Göteborg',
  'Clear places': 'Rensa platser',
  'Route list': 'Ruttlista',
  'Available routes are sorted A–Z by pickup location, then return location. New detections stay pinned to the top.':
    'Tillgängliga rutter sorteras A–Ö efter upphämtningsplats och sedan återlämningsplats. Nya upptäckter ligger kvar högst upp.',
  'Show unavailable routes': 'Visa inte tillgängliga rutter',
  'Show expired routes': 'Visa utgångna rutter',
  'Exclude Norway (NO)': 'Uteslut Norge (NO)',
  'Worker connection': 'Worker-anslutning',
  'Address of the machine running the Freerider worker. Use its Tailscale address when you are away from home. Notifications are set up automatically the first time you start a listener on the Freerider tab.':
    'Adressen till datorn som kör Freerider-workern. Använd dess Tailscale-adress när du är borta från hemmet. Aviseringar aktiveras automatiskt första gången du startar en bevakning på fliken Freerider.',
  'Saved: {{url}}': 'Sparad: {{url}}',
  'No worker URL saved yet.': 'Ingen worker-URL sparad ännu.',
  Test: 'Testa',
  Reset: 'Återställ',
  On: 'På',
  Off: 'Av',
  'Show fewer': 'Visa färre',
  'Show all {{count}} stores': 'Visa alla {{count}} butiker',

  'Allow notifications for Kerodi in system settings to start a listener.':
    'Tillåt aviseringar för Kerodi i systeminställningarna för att starta en bevakning.',
  'Could not reach the worker.': 'Kunde inte nå workern.',
  Stop: 'Stoppa',
  Start: 'Starta',
  'Listen for': 'Bevaka i',
  'Active listeners': 'Aktiva bevakningar',
  Any: 'Alla',
  '{{count}} listening': '{{count}} bevakar',
  'Set the worker URL in Settings first.': 'Ange worker-URL:en i Inställningar först.',
  'Worker returned {{status}}': 'Workern svarade {{status}}',
  'hertzfreerider.se returned {{status}}': 'hertzfreerider.se svarade {{status}}',
  'hertzfreerider.se returned {{status}} for locations':
    'hertzfreerider.se svarade {{status}} för platser',
  'Unexpected response from hertzfreerider.se': 'Oväntat svar från hertzfreerider.se',
  'Unexpected locations response from hertzfreerider.se':
    'Oväntat svar för platser från hertzfreerider.se',
  'Could not load routes.': 'Kunde inte ladda rutter.',
  'The request timed out. Check your connection and try again.':
    'Förfrågan tog för lång tid. Kontrollera din anslutning och försök igen.',

  'Route history': 'Rutthistorik',
  'Times are when Kerodi detected the route, to the minute. Routes present at first launch are marked Baseline because their true detection time is unknown.':
    'Tiderna visar när Kerodi upptäckte rutten, ner till minuten. Rutter som fanns vid första starten är märkta Baseline eftersom den verkliga upptäcktstiden är okänd.',
  'No detected posts for this pair yet.': 'Inga upptäckta rutter för detta par ännu.',
  '{{count}} detected · {{rate}} per week': '{{count}} upptäckta · {{rate}} per vecka',
  '{{count}} reappearances recorded': '{{count}} återkomster registrerade',
  'Busiest day {{day}} · {{percent}}': 'Hetaste dag {{day}} · {{percent}}',
  'Busiest hour {{hour}} · {{percent}}': 'Hetaste timme {{hour}} · {{percent}}',
  'Last detected {{time}}': 'Senast upptäckt {{time}}',
  'Most seen pairs': 'Vanligaste par',
  'Recent routes': 'Senaste rutter',
  'Tap a route to see its state changes.': 'Tryck på en rutt för att se dess statusändringar.',
  'Nothing recorded yet.': 'Inget registrerat ännu.',
  'No state changes recorded yet.': 'Inga statusändringar registrerade ännu.',
  Sun: 'Sön',
  Mon: 'Mån',
  Tue: 'Tis',
  Wed: 'Ons',
  Thu: 'Tor',
  Fri: 'Fre',
  Sat: 'Lör',

  '← Back': '← Tillbaka',
  'Forward →': 'Framåt →',
  Reload: 'Ladda om',
  Route: 'Rutt',
  'Try editing': 'Prova att redigera',
};

export function resolveLocale(languageCode?: string | null): AppLocale {
  return languageCode === 'sv' ? 'sv' : 'en';
}

export function deviceLocale(): AppLocale {
  return resolveLocale(getLocales()[0]?.languageCode);
}

function createTranslator(locale: AppLocale) {
  const instance = new I18n({ en: {}, sv });
  instance.defaultLocale = 'en';
  instance.enableFallback = true;
  instance.locale = locale;
  return instance;
}

const translators: Record<AppLocale, I18n> = {
  en: createTranslator('en'),
  sv: createTranslator('sv'),
};

export function translatorFor(locale: AppLocale) {
  return (key: string, options?: Record<string, string | number>): string => {
    const instance = translators[locale];
    const value = instance.t(key, { ...(options ?? {}), defaultValue: options?.defaultValue ?? key });
    return typeof value === 'string' ? value : key;
  };
}

export function translate(key: string, options?: Record<string, string | number>): string {
  return translatorFor(deviceLocale())(key, options);
}
