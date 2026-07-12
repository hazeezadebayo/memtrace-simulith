/* ==================================================================
   simulith/src/tree/elasticity.js
   Pure Math — Zero LLM, Zero Imports.
   Computes context-conditioned deltas for state transitions.

   Elasticity Models:
     "flat"          → delta is the constant magnitude, ignoring state.
     "inverse"       → delta is amplified when variable is near the direction of push.
                       (e.g. pushing morale DOWN is strongest when morale is HIGH)
     "proportional"  → delta scales with current value.
                       (e.g. pushing attrition UP is strongest when attrition is already HIGH)
   ================================================================== */
import { clamp, toFiniteNumber } from "../utils/tree_runtime_utils.js";

/**
 * Computes the actual delta for a state variable given elasticity model.
 *
 * @param {number} currentValue  - Current S_t value of the variable (in [min, max])
 * @param {number} magnitude     - Raw causal delta from ontology (can be negative)
 * @param {string} elasticityModel - "flat" | "inverse" | "proportional"
 * @param {number} min           - Variable's minimum bound (default 0.0)
 * @param {number} max           - Variable's maximum bound (default 1.0)
 * @returns {number}             - The actual delta to apply
 */

/**
 * Compute the context-sensitive delta produced by an operator.
 *
 * This function is intentionally deterministic.
 * It does not call an LLM and does not sample randomness.
 */
export function computeElasticDelta(
    currentValue,
    magnitude,
    elasticityModel,
    min = 0.0,
    max = 1.0
) {
    const lo = toFiniteNumber(min, 0.0);
    const hi = toFiniteNumber(max, 1.0);
    const current = clamp(currentValue, lo, hi);

    const range = hi - lo;
    if (range <= 0) return 0;

    const magnitudeValue = toFiniteNumber(magnitude, 0);

    // Normalise current value to [0, 1] within its own range.
    const normalised = clamp((current - lo) / range, 0, 1);

    let delta = magnitudeValue;

    switch (elasticityModel) {
        case "flat":
            // No context sensitivity.
            delta = magnitudeValue;
            break;

        case "inverse": {
            // Strongest when the push goes against the current position.
            // Negative magnitude is strongest when the variable is already high.
            // Positive magnitude is strongest when the variable is already low.
            const headroom = magnitudeValue < 0 ? normalised : 1 - normalised;
            const multiplier = 0.15 + 1.35 * headroom;
            delta = magnitudeValue * multiplier;
            break;
        }

        case "proportional": {
            // Scales with the current variable level.
            const multiplier = 0.2 + 1.6 * normalised;
            delta = magnitudeValue * multiplier;
            break;
        }

        default:
            // Unknown model falls back to flat.
            delta = magnitudeValue;
            break;
    }

    // Make sure the delta cannot push past the hard bounds.
    const minDelta = lo - current;
    const maxDelta = hi - current;
    delta = clamp(delta, minDelta, maxDelta);

    return delta;
}
