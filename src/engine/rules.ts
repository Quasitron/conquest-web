/** Opt-in house rules. Every flag defaults off, which gives the original Empire Deluxe rules. */
export interface HouseRules {
  /** Neutral cities defend with strength 1 instead of 2. */
  easierNeutralCities: boolean;
  /** No city produces on turn 1, so every player's first tick is on turn 2. */
  fairFirstTurn: boolean;
  /** A transport leaving a city does not auto-load armies that have orders (Sentry); likewise carriers and fighters. */
  sentriedStayAsGarrison: boolean;
}

export const CLASSIC_RULES: HouseRules = {
  easierNeutralCities: false,
  fairFirstTurn: false,
  sentriedStayAsGarrison: false,
};

/** Bumped whenever a change alters how an old command log replays. 4: units arriving in a route city take the route. 5: a carrier leaving a city takes the fighters there. 6: a patrol tied to a carrier moves with it. 7: aircraft wait a turn when blocked. 8: equal-length paths prefer the straight line. 9: fighters aboard a carrier await orders instead of sleeping. */
export const RULES_VERSION = 9;
