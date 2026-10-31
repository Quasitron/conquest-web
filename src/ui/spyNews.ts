import { UNIT_STATS, type GameEvent, type PlayerId, type UnitType } from '../engine';

/** One newspaper front page: a headline in capitals, a line under it, and the story. */
export interface NewsItem {
  headline: string;
  subhead: string;
  text: string;
}

/** What a city building this unit is called in the papers: a Bomber Factory, a Destroyer Shipyard. */
function works(type: UnitType): string {
  return `${UNIT_STATS[type].name} ${UNIT_STATS[type].domain === 'sea' ? 'Shipyard' : 'Factory'}`;
}

/**
 * The front pages for what spies did in a batch of new events, from player `me`'s point of view: sabotage, an operative
 * found hiding, a revolt. Spies' own movements make no news.
 */
export function spyHeadlines(events: readonly GameEvent[], me: PlayerId, cityName: (id: number) => string | undefined): NewsItem[] {
  const out: NewsItem[] = [];
  for (const e of events) {
    const city = cityName(e.type === 'citySabotaged' || e.type === 'garrisonHurt' || e.type === 'spyFound' || e.type === 'cityIncited' ? e.cityId : -1) ?? 'the city';
    const place = city.toUpperCase();
    if (e.type === 'citySabotaged') {
      if (e.owner === me) {
        out.push({
          headline: `${works(e.production).toUpperCase()} SABOTAGED IN ${place}!`,
          subhead: 'An enemy agent strikes at the factories',
          text: `All the work under way in ${city} has been wrecked. ${e.caught ? 'The saboteur was caught and shot.' : 'The saboteur slipped away.'}`,
        });
      } else if (e.by === me) {
        out.push(e.caught
          ? { headline: `${works(e.production).toUpperCase()} SABOTAGED IN ${place}!`, subhead: 'Suspect killed', text: `Production in ${city} was wrecked, but our agent was discovered and shot.` }
          : { headline: `${works(e.production).toUpperCase()} SABOTAGED IN ${place}!`, subhead: 'Foreign agent suspected, suspect at large', text: `Production in ${city} is wrecked, and our agent remains in place.` });
      }
    } else if (e.type === 'garrisonHurt') {
      const unit = UNIT_STATS[e.unitType].name;
      if (e.owner === me) {
        out.push({ headline: `GARRISON SABOTAGED IN ${place}!`, subhead: 'Saboteurs strike the defenders', text: `The ${unit} in ${city} was damaged in the night. ${e.caught ? 'The saboteur was caught and shot.' : 'The saboteur slipped away.'}` });
      } else if (e.by === me) {
        out.push(e.caught
          ? { headline: `GARRISON HIT IN ${place}!`, subhead: 'Suspect killed', text: `The ${unit} in ${city} was damaged, but our agent was discovered and shot.` }
          : { headline: `GARRISON HIT IN ${place}!`, subhead: 'Foreign agent suspected, suspect at large', text: `The ${unit} in ${city} was damaged, and our agent remains in place.` });
      }
    } else if (e.type === 'spyFound') {
      if (e.owner === me) {
        out.push({ headline: `ENEMY OPERATIVE FOUND IN ${place}!`, subhead: 'A spy is uncovered', text: `A foreign agent was found hiding in ${city} and has been shot.` });
      } else if (e.by === me) {
        out.push({ headline: `OUR AGENT EXPOSED IN ${place}!`, subhead: 'Cover blown', text: `Our operative in ${city} was discovered and shot.` });
      }
    } else if (e.type === 'cityIncited') {
      if (e.success && (e.by === me || e.owner === me)) {
        out.push(e.by === me
          ? { headline: `${place} RISES UP!`, subhead: 'The people have had enough', text: `Our agent has turned ${city} against its masters. The city is ours!` }
          : { headline: `REVOLT IN ${place}!`, subhead: 'Agitators win over the people', text: `${city} has risen against us and been lost.` });
      } else if (e.by === me) {
        out.push({ headline: `REVOLT FAILS IN ${place}!`, subhead: 'The people stayed home', text: `Our agent failed to stir up ${city} and was caught.` });
      } else if (e.owner === me) {
        out.push({ headline: `REVOLT PUT DOWN IN ${place}!`, subhead: 'An agitator is taken', text: `A foreign agent tried to stir up ${city} and was caught.` });
      }
    }
  }
  return out;
}
