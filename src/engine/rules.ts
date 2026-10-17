/** Opt-in house rules. Every flag defaults off, which gives the original Empire Deluxe rules. */
export interface HouseRules {
  /** Neutral cities defend with strength 1 instead of 2. */
  easierNeutralCities: boolean;
  /** No city produces on turn 1, so every player's first tick is on turn 2. */
  fairFirstTurn: boolean;
  /** A transport leaving a city does not auto-load armies that have orders (Sentry). */
  sentriedStayAsGarrison: boolean;
}

export const CLASSIC_RULES: HouseRules = {
  easierNeutralCities: false,
  fairFirstTurn: false,
  sentriedStayAsGarrison: false,
};

/** Bumped whenever a change alters how an old command log replays. 4: units arriving in a route city take the route. */
export const RULES_VERSION = 4;
