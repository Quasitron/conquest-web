/** The picture file (public/art/flags/<code>.webp) of each country's flag, by the country name used in the theaters. Made by tools/make-flags.mjs. */
const FLAG_CODES: Record<string, string> = {
  'Afghanistan': 'af', 'Algeria': 'dz', 'Angola': 'ao', 'Argentina': 'ar', 'Australia': 'au', 'Austria': 'at', 'Bangladesh': 'bd',
  'Belarus': 'by', 'Bolivia': 'bo', 'Brazil': 'br', 'Bulgaria': 'bg', 'Canada': 'ca', 'Chile': 'cl', 'China': 'cn', 'Colombia': 'co',
  'Croatia': 'hr', 'Cuba': 'cu', 'Denmark': 'dk', 'Dominican Republic': 'do', 'Egypt': 'eg', 'Ethiopia': 'et', 'Finland': 'fi',
  'France': 'fr', 'Georgia': 'ge', 'Germany': 'de', 'Greece': 'gr', 'Haiti': 'ht', 'Honduras': 'hn', 'Iceland': 'is', 'India': 'in',
  'Indonesia': 'id', 'Iran': 'ir', 'Iraq': 'iq', 'Ireland': 'ie', 'Italy': 'it', 'Japan': 'jp', 'Libya': 'ly', 'Malaysia': 'my',
  'Mexico': 'mx', 'Mongolia': 'mn', 'Morocco': 'ma', 'Mozambique': 'mz', 'Myanmar': 'mm', 'New Zealand': 'nz', 'Nigeria': 'ng',
  'North Korea': 'kp', 'Norway': 'no', 'Oman': 'om', 'Pakistan': 'pk', 'Panama': 'pa', 'Papua New Guinea': 'pg', 'Peru': 'pe',
  'Philippines': 'ph', 'Poland': 'pl', 'Portugal': 'pt', 'Romania': 'ro', 'Russia': 'ru', 'Saudi Arabia': 'sa', 'Serbia': 'rs',
  'South Africa': 'za', 'South Korea': 'kr', 'Spain': 'es', 'Sri Lanka': 'lk', 'Sudan': 'sd', 'Sweden': 'se', 'Syria': 'sy',
  'Taiwan': 'tw', 'Tanzania': 'tz', 'Thailand': 'th', 'Tunisia': 'tn', 'Turkey': 'tr', 'Ukraine': 'ua', 'United Kingdom': 'gb',
  'United States of America': 'us', 'Union': 'us', 'Venezuela': 've', 'Vietnam': 'vn', 'Yemen': 'ye',
};

/** The flag picture of a country by name, or null when the name is not a known country (a player's own name, a random map). The Confederate States have their own. */
export function flagUrl(nation: string): string | null {
  if (nation === 'Confederate States') return '/art/flags/csa.webp';
  const code = FLAG_CODES[nation];
  return code ? `/art/flags/${code}.webp` : null;
}
