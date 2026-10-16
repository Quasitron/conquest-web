/** Opt-in house rules. Every flag defaults off, which gives the original Empire Deluxe rules. */
export interface HouseRules {
  /** Neutral cities defend with strength 1 instead of 2. */
  easierNeutralCities: boolean;
  /** No city produces on turn 1, so every player's first tick is on turn 2. */
  fairFirstTurn: boolean;
  /** Sentried units stay as a garrison when their city is captured. */
  sentriedStayAsGarrison: boolean;
}

export const CLASSIC_RULES: HouseRules = {
  easierNeutralCities: false,
  fairFirstTurn: false,
  sentriedStayAsGarrison: false,
};

export const RULES_VERSION = 2;
