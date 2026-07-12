/* ==================================================================
   simulith/src/extra.js
   Environmental state simulator for multi-agent runs.
   Defaults to 72 hours (3 days) total duration.
   ================================================================== */

export let TOTAL_SIMULATION_HOURS = 72; // default: 3 days

/**
 * Configure the total simulation hours.
 * @param {number} hours
 */
export function setTotalSimulationHours(hours) {
  TOTAL_SIMULATION_HOURS = Number(hours) || 72;
}

/**
 * Get the simulated environmental state for a specific action index within a round.
 *
 * @param {number} round        - current round/tick (1-indexed)
 * @param {number} maxRounds    - total rounds/ticks in this simulation
 * @param {number} actionIndex  - sequential index of this action (0-indexed)
 * @param {number} totalActions - total estimated actions in this round
 * @param {string} simId        - simulation UUID (for seeded weather variance)
 * @returns {object} environmental state
 */
export function getEnvironmentalState(round, maxRounds, actionIndex, totalActions, simId) {
  const hoursPerRound = TOTAL_SIMULATION_HOURS / Math.max(1, maxRounds);
  const startHour = (round - 1) * hoursPerRound;

  // Calculate fractional offset within this round
  const actionFraction = actionIndex / Math.max(1, totalActions);
  const cumulativeHour = startHour + (actionFraction * hoursPerRound);

  const day = Math.floor(cumulativeHour / 24) + 1;
  const hourOfDay = Math.floor(cumulativeHour) % 24;
  const minute = Math.floor((cumulativeHour % 1) * 60);

  // Map hourOfDay to a human-readable time of day
  let timeOfDay = 'Morning';
  if (hourOfDay >= 6 && hourOfDay < 12) {
    timeOfDay = 'Morning';
  } else if (hourOfDay >= 12 && hourOfDay < 17) {
    timeOfDay = 'Afternoon';
  } else if (hourOfDay >= 17 && hourOfDay < 21) {
    timeOfDay = 'Evening';
  } else {
    timeOfDay = 'Night';
  }

  // Format visual clock representation (e.g. 09:15 AM)
  const ampm = hourOfDay >= 12 ? 'PM' : 'AM';
  const displayHour = hourOfDay % 12 === 0 ? 12 : hourOfDay % 12;
  const displayMinute = String(minute).padStart(2, '0');
  const formattedTime = `${String(displayHour).padStart(2, '0')}:${displayMinute} ${ampm}`;

  // Seeded deterministic weather per day using a simple string hash
  const weatherPatterns = [
    'Sunny and clear',
    'Heavy rain and overcast',
    'Partly cloudy',
    'Stormy and windy',
    'Dense fog'
  ];
  let hash = 0;
  const seedStr = `${simId || 'default'}-day-${day}`;
  for (let i = 0; i < seedStr.length; i++) {
    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const weather = weatherPatterns[Math.abs(hash) % weatherPatterns.length];

  return {
    day,
    hour: hourOfDay,
    minute,
    timeOfDay,
    formattedTime,
    weather,
    cumulativeHour: +cumulativeHour.toFixed(2)
  };
}

/**
 * Returns formatted string representing environmental state for injection into prompts.
 */
export function getEnvironmentPromptString(round, maxRounds, actionIndex, totalActions, simId) {
  const state = getEnvironmentalState(round, maxRounds, actionIndex, totalActions, simId);
  return `[ENVIRONMENTAL CONTEXT]
- Day of Simulation: Day ${state.day}
- Current Time: ${state.formattedTime} (${state.timeOfDay})
- Weather Conditions: ${state.weather}
`;
}
