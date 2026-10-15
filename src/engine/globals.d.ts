/** structuredClone exists in every target runtime; declared here so the engine type-checks without the DOM lib. */
declare function structuredClone<T>(value: T): T;
