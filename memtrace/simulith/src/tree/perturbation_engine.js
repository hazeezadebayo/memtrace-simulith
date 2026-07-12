/* ==================================================================
   simulith/src/tree/perturbation_engine.js
   Module 7: Perturbation Engine
   Injects stochastic noise (Black Swan events, shocks) into operators.
   ================================================================== */
import { getRandomShock } from "../data/shocks.js";

/**
 * Probabilistically injects a wildcard shock operator into the operator list.
 * The output remains an array of operator IDs so the physics layer can execute it.
 */
export function injectPerturbations(operators, domainName = "COMMON") {
    const result = Array.isArray(operators) ? [...operators] : [];
    const threshold = 0.85; // 15% chance of a shock event.

    const roll = Math.random();
    if (roll <= threshold) {
        return result;
    }

    const shockData = getRandomShock({ domain: domainName });

    if (!shockData || typeof shockData.id !== "string" || !shockData.id.trim()) {
        console.warn("[PerturbationEngine] Shock registry returned no executable id.");
        return result;
    }

    const shockOperator = shockData.id.trim();
    const shockObj = { operator_id: shockOperator, action_label: shockData.title || shockOperator };

    if (result.length > 0) {
        result[result.length - 1] = shockObj;
    } else {
        result.push(shockObj);
    }

    console.log(
        `[PerturbationEngine] ⚡ SHOCK INJECTED: ${shockData.id ?? shockOperator} - ${shockData.title ?? shockOperator}`
    );

    return result;
}