/* ==================================================================
   simulith/src/data/ontology.js
   Domain Ontology Registry — Hybrid Constraint Graph
   base_effects now carry elasticity models, not flat scalars.
   ================================================================== */

// simulith/src/data/ontology.js

/**
 * Tree Mode ontology:
 * - Defines bounded state variables
 * - Defines operators as causal transformations
 * - Defines interaction edges for secondary propagation
 * - Defines stakeholder sets for utility evaluation
 *
 * This file intentionally keeps the data shape simple and readable.
 * The rest of the engine can normalize further if needed.
 */
/**
 * Tree Mode ontology, upgraded.
 *
 * Goals:
 * - Keep the original public API stable:
 *   - getDomainOntology(domainName)
 *   - DOMAIN_ONTOLOGY
 * - Expand support to the full domain set provided by the user.
 * - Keep the data shape simple, deterministic, bounded, and easy to normalize.
 * - Provide richer variables, operators, interactions, and stakeholders so the
 *   tree engine can forecast with better structure and less generic output.
 */

function deepClone(value) {
    if (value === null || value === undefined) return value;

    if (typeof structuredClone === "function") {
        try {
            return structuredClone(value);
        } catch {
            // fall through
        }
    }

    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return value;
    }
}

function isPlainObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
}

function toFiniteNumber(value, fallback = 0.0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;

    let lo = Number(min);
    let hi = Number(max);

    if (!Number.isFinite(lo)) lo = 0;
    if (!Number.isFinite(hi)) hi = 1;

    if (lo > hi) {
        const tmp = lo;
        lo = hi;
        hi = tmp;
    }

    return Math.min(hi, Math.max(lo, n));
}

function midpoint(min, max) {
    const lo = Number.isFinite(min) ? min : 0.0;
    const hi = Number.isFinite(max) ? max : 1.0;
    return (lo + hi) / 2;
}

function humanizeKey(value) {
    return String(value ?? "")
        .replace(/[_\-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (m) => m.toUpperCase());
}

function variable(name, min, max, defaultValue, description, type = "continuous") {
    return {
        min,
        max,
        defaultValue,
        description,
        type,
        name,
    };
}

function operator(description, base_effects, dynamic_effects = [], tags = []) {
    return {
        description,
        base_effects,
        dynamic_effects,
        tags,
    };
}

function interaction(source, target, coefficient, description = "") {
    return {
        source,
        target,
        coefficient,
        description,
    };
}

function buildStakeholders(factionWeights = {}) {
    const stakeholders = [];

    for (const [id, weight] of Object.entries(factionWeights)) {
        stakeholders.push({
            id,
            label: humanizeKey(id),
            weight: toFiniteNumber(weight, 1.0),
            description: "",
        });
    }

    return stakeholders;
}

function enrichVariables(variables) {
    const result = {};
    for (const [name, def] of Object.entries(variables || {})) {
        const min = Number.isFinite(def?.min) ? def.min : 0.0;
        const max = Number.isFinite(def?.max) ? def.max : 1.0;
        const defaultValue = Number.isFinite(def?.defaultValue)
            ? def.defaultValue
            : midpoint(min, max);

        result[name] = {
            min,
            max,
            defaultValue: clamp(defaultValue, min, max),
            description: typeof def?.description === "string" ? def.description : "",
            type: typeof def?.type === "string" ? def.type : "continuous",
        };
    }
    return result;
}

function enrichOperators(operators) {
    const result = {};
    for (const [name, def] of Object.entries(operators || {})) {
        const baseEffects = isPlainObject(def?.base_effects) ? deepClone(def.base_effects) : {};
        const dynamicEffects = Array.isArray(def?.dynamic_effects)
            ? def.dynamic_effects.filter((x) => typeof x === "string" && x.trim())
            : [];
        const tags = Array.isArray(def?.tags)
            ? def.tags.filter((x) => typeof x === "string" && x.trim())
            : [];

        result[name] = {
            description: typeof def?.description === "string" ? def.description : "",
            base_effects: baseEffects,
            dynamic_effects: dynamicEffects,
            tags,
        };
    }
    return result;
}

function enrichInteractions(interactions) {
    if (!Array.isArray(interactions)) return [];
    return interactions
        .map((entry) => ({
            source: typeof entry?.source === "string" ? entry.source : "",
            target: typeof entry?.target === "string" ? entry.target : "",
            coefficient: toFiniteNumber(entry?.coefficient, 0.0),
            description: typeof entry?.description === "string" ? entry.description : "",
        }))
        .filter((entry) => entry.source && entry.target);
}

function enrichDomain(domainName, domainDef) {
    return {
        domain_name: domainName,
        variables: enrichVariables(domainDef?.variables || {}),
        operators: enrichOperators(domainDef?.operators || {}),
        interactions: enrichInteractions(domainDef?.interactions || []),
        stakeholders: buildStakeholders(domainDef?.factionWeights || {}),
        domain_label: typeof domainDef?.label === "string" ? domainDef.label : humanizeKey(domainName),
        domain_description: typeof domainDef?.description === "string" ? domainDef.description : "",
        domain_prefix: typeof domainDef?.prefix === "string" ? domainDef.prefix : "",
    };
}

/**
 * The user's domain taxonomy, preserved and expanded into stable ontology scaffolding.
 * This is intentionally explicit so the engine remains interpretable and deterministic.
 */
export const DOMAINS = {
    governance: {
        label: "Governance",
        description: "Policy, state, voting, courts.",
        prefix: "Enact Policy",
        factionWeights: {
            Regulators: 2.5,
            Politicians: 2.2,
            Legal: 1.8,
            Citizens: 1.0,
            NGOs: 1.2,
            Corporates: 1.5,
            Activists: 1.5,
            Media: 1.5,
        },
    },
    security: {
        label: "Security",
        description: "Cybersecurity, military, risk, defense.",
        prefix: "Deploy Defenses",
        factionWeights: {
            Regulators: 2.5,
            Geopolitics: 2.2,
            Politicians: 1.8,
            Legal: 1.5,
            Citizens: 1.0,
            Techies: 1.5,
        },
    },
    capital: {
        label: "Capital",
        description: "Liquidity, assets, wealth, banking.",
        prefix: "Allocate Funds",
        factionWeights: {
            Investors: 2.5,
            Financials: 2.2,
            Analysts: 2.0,
            Speculators: 1.5,
            Property: 1.5,
            Corporates: 1.5,
            Consumers: 0.8,
        },
    },
    labor: {
        label: "Labor",
        description: "Unions, workers, jobs, salaries.",
        prefix: "Restructure Workforce",
        factionWeights: {
            Labor: 2.5,
            Corporates: 2.0,
            Regulators: 1.5,
            Founders: 1.5,
            Consumers: 0.8,
            Operations: 1.8,
        },
    },
    consumption: {
        label: "Consumption",
        description: "Retail, shopping, luxury, spending.",
        prefix: "Launch Product",
        factionWeights: {
            Consumers: 2.5,
            Corporates: 2.0,
            Sales: 1.8,
            Marketing: 1.5,
            Investors: 1.0,
        },
    },
    productivity: {
        label: "Productivity",
        description: "Habits, time management, daily schedules.",
        prefix: "Upgrade Systems",
        factionWeights: {
            Planners: 2.5,
            Product: 2.0,
            Operations: 1.8,
            Techies: 1.5,
            Founders: 1.5,
        },
    },
    technology: {
        label: "Technology",
        description: "Software, AI, developers, cloud.",
        prefix: "Adopt Tech Stack",
        factionWeights: {
            Techies: 2.5,
            Investors: 2.0,
            Academics: 1.8,
            Corporates: 1.5,
            Legal: 1.2,
            Planners: 1.5,
        },
    },
    environment: {
        label: "Environment",
        description: "Climate, resources, energy, conservation.",
        prefix: "Shift Location",
        factionWeights: {
            Activists: 2.5,
            Regulators: 2.2,
            NGOs: 1.8,
            Geopolitics: 1.5,
            Corporates: 1.0,
            Citizens: 1.0,
        },
    },
    knowledge: {
        label: "Knowledge",
        description: "Research, academia, data, history.",
        prefix: "Publish Research",
        factionWeights: {
            Academics: 2.5,
            Media: 2.0,
            NGOs: 1.5,
            Regulators: 1.2,
            Techies: 1.0,
        },
    },
    media: {
        label: "Media",
        description: "News, journalism, broadcasting, platforms.",
        prefix: "Broadcast Campaign",
        factionWeights: {
            Media: 2.5,
            Marketing: 2.0,
            Politicians: 1.8,
            Consumers: 1.0,
            Regulators: 1.2,
            Activists: 1.5,
        },
    },
    education: {
        label: "Education",
        description: "Schools, learning, students, teachers.",
        prefix: "Revise Curriculum",
        factionWeights: {
            Teachers: 2.5,
            Administrators: 2.0,
            Academics: 1.8,
            Regulators: 1.2,
            Students: 0.8,
            Citizens: 1.0,
        },
    },
    culture: {
        label: "Culture",
        description: "Art, heritage, identity, slang.",
        prefix: "Shift Paradigm",
        factionWeights: {
            Artists: 2.5,
            Critics: 2.0,
            Media: 1.5,
            Consumers: 1.2,
            Marketing: 1.0,
        },
    },
    community: {
        label: "Community",
        description: "Neighborhood, charity, spiritual, family.",
        prefix: "Mobilize Base",
        factionWeights: {
            Organizers: 2.5,
            Elders: 2.0,
            Neighbors: 1.8,
            NGOs: 1.5,
            Citizens: 1.2,
        },
    },
    health: {
        label: "Health",
        description: "Food, workouts, longevity, medical choices.",
        prefix: "Intervene Medically",
        factionWeights: {
            Doctors: 2.5,
            Biohackers: 1.8,
            Regulators: 1.8,
            Legal: 1.2,
            Consumers: 0.8,
            Support: 1.0,
        },
    },
    societal: {
        label: "Societal",
        description: "Politics, macroeconomics, laws, public crises.",
        prefix: "Drive Movement",
        factionWeights: {
            Regulators: 2.5,
            Corporates: 2.0,
            Activists: 1.8,
            Consumers: 0.8,
            Financials: 1.5,
            Techies: 1.2,
            Media: 1.5,
            Citizens: 1.0,
            Labor: 1.2,
            Geopolitics: 1.8,
            Academics: 1.5,
            Planners: 1.5,
            Politicians: 2.2,
            NGOs: 1.5,
        },
    },
    business: {
        label: "Business",
        description: "Corporate strategy, startups, hiring, marketing.",
        prefix: "Execute Strategy",
        factionWeights: {
            Investors: 2.5,
            Corporates: 2.0,
            Operations: 1.5,
            Support: 0.5,
            Legal: 1.5,
            Product: 2.0,
            Founders: 2.2,
            Marketing: 1.0,
            Sales: 1.2,
        },
    },
    finance: {
        label: "Finance",
        description: "Investments, housing, stocks, frugal budgeting.",
        prefix: "Hedge Portfolio",
        factionWeights: {
            Investors: 2.5,
            Speculators: 2.0,
            Property: 1.5,
            Consumers: 0.8,
            Analysts: 2.0,
            Legal: 1.2,
        },
    },
    relationship: {
        label: "Relationship",
        description: "Family, dating, marriage, social conflict.",
        prefix: "Commit Deeply",
        factionWeights: {
            Advisors: 2.5,
            Optimists: 1.8,
            Skeptics: 1.2,
        },
    },
    creative: {
        label: "Creative",
        description: "Content creation, art, branding, writing.",
        prefix: "Ship Artifact",
        factionWeights: {
            Creators: 2.5,
            Marketing: 1.8,
            Consumers: 0.8,
        },
    },
    career: {
        label: "Career",
        description: "Job changes, promotions, university majors.",
        prefix: "Make the Move",
        factionWeights: {
            Advisors: 2.2,
            Corporates: 2.0,
            Labor: 1.5,
        },
    },
    entertainment: {
        label: "Entertainment",
        description: "Entertainment, movies, music, games, media, shows.",
        prefix: "Produce Show",
        factionWeights: {
            Creators: 2.5,
            Media: 2.0,
            Consumers: 1.5,
            Marketing: 1.2,
        },
    },
};

function buildCommonDomain() {
    return {
        label: "Common",
        description: "Fallback broad domain for mixed-context prompts.",
        prefix: "Stabilize System",
        factionWeights: {
            Constituents: 2.0,
            Regulators: 2.0,
            Corporates: 1.5,
            Citizens: 1.0,
            Media: 1.2,
            NGOs: 1.2,
            Techies: 1.2,
            Investors: 1.2,
        },
        variables: {
            institutional_trust: variable("institutional_trust", 0, 1, 0.55, "Confidence in institutions and institutions' credibility."),
            coordination_quality: variable("coordination_quality", 0, 1, 0.50, "How well actors align and cooperate."),
            crisis_intensity: variable("crisis_intensity", 0, 1, 0.35, "Magnitude of active shock pressure."),
            execution_speed: variable("execution_speed", 0, 1, 0.55, "How quickly plans become real outcomes."),
            public_support: variable("public_support", 0, 1, 0.50, "Broad acceptance from the affected base."),
            optionality: variable("optionality", 0, 1, 0.50, "Ability to change course without major loss."),
        },
        operators: {
            stabilize_system: operator(
                "Reduce volatility, preserve baseline function, and protect trust.",
                {
                    institutional_trust: { magnitude: 0.14, elasticity: "inverse" },
                    crisis_intensity: { magnitude: -0.16, elasticity: "flat" },
                    coordination_quality: { magnitude: 0.10, elasticity: "proportional" },
                },
                ["public_support", "execution_speed"],
                ["stabilization", "trust", "risk-control"]
            ),
            accelerate_rollout: operator(
                "Move faster and accept some near-term friction in exchange for speed.",
                {
                    execution_speed: { magnitude: 0.18, elasticity: "proportional" },
                    coordination_quality: { magnitude: -0.06, elasticity: "flat" },
                    optionality: { magnitude: -0.04, elasticity: "flat" },
                },
                ["public_support", "institutional_trust"],
                ["speed", "growth", "execution"]
            ),
            targeted_reform: operator(
                "Change one high-leverage lever without destabilizing the rest of the system.",
                {
                    coordination_quality: { magnitude: 0.12, elasticity: "inverse" },
                    public_support: { magnitude: 0.08, elasticity: "flat" },
                    institutional_trust: { magnitude: 0.06, elasticity: "proportional" },
                },
                ["optionality"],
                ["reform", "alignment", "policy"]
            ),
            external_shock: operator(
                "Unexpected disturbance that strains the system.",
                {
                    crisis_intensity: { magnitude: 0.20, elasticity: "flat" },
                    institutional_trust: { magnitude: -0.10, elasticity: "flat" },
                    execution_speed: { magnitude: -0.08, elasticity: "flat" },
                },
                ["public_support", "optionality"],
                ["shock", "risk", "volatility"]
            ),
        },
        interactions: [
            interaction("institutional_trust", "public_support", 0.34, "Trust tends to convert into support."),
            interaction("coordination_quality", "execution_speed", 0.31, "Better coordination increases speed."),
            interaction("crisis_intensity", "institutional_trust", -0.38, "Crisis pressure lowers trust."),
            interaction("optionality", "coordination_quality", 0.20, "More options can improve alignment."),
        ],
    };
}

function buildGovernanceDomain() {
    return {
        label: DOMAINS.governance.label,
        description: DOMAINS.governance.description,
        prefix: DOMAINS.governance.prefix,
        factionWeights: DOMAINS.governance.factionWeights,
        variables: {
            institutional_trust: variable("institutional_trust", 0, 1, 0.55, "Confidence that institutions behave credibly and predictably."),
            policy_effectiveness: variable("policy_effectiveness", 0, 1, 0.50, "How well policy translates into outcomes."),
            civic_participation: variable("civic_participation", 0, 1, 0.45, "How actively the public engages in governance."),
            legal_constraint: variable("legal_constraint", 0, 1, 0.50, "How strongly law constrains action."),
            elite_alignment: variable("elite_alignment", 0, 1, 0.52, "How aligned major decision-makers are."),
            media_attention: variable("media_attention", 0, 1, 0.48, "Visibility and scrutiny from media systems."),
        },
        operators: {
            enact_reform: operator(
                "Pass a credible reform package with clear implementation steps.",
                {
                    policy_effectiveness: { magnitude: 0.18, elasticity: "proportional" },
                    institutional_trust: { magnitude: 0.10, elasticity: "inverse" },
                    civic_participation: { magnitude: 0.05, elasticity: "flat" },
                },
                ["elite_alignment", "media_attention"],
                ["policy", "reform", "governance"]
            ),
            tighten_enforcement: operator(
                "Increase enforcement and procedural strictness.",
                {
                    legal_constraint: { magnitude: 0.16, elasticity: "flat" },
                    policy_effectiveness: { magnitude: 0.05, elasticity: "flat" },
                    institutional_trust: { magnitude: -0.08, elasticity: "flat" },
                },
                ["media_attention", "civic_participation"],
                ["enforcement", "law", "compliance"]
            ),
            open_dialogue: operator(
                "Increase civic dialogue and negotiation across factions.",
                {
                    civic_participation: { magnitude: 0.14, elasticity: "inverse" },
                    elite_alignment: { magnitude: 0.08, elasticity: "proportional" },
                    institutional_trust: { magnitude: 0.06, elasticity: "flat" },
                },
                ["media_attention"],
                ["dialogue", "consensus", "participation"]
            ),
            anti_corruption_drive: operator(
                "Reduce leakage, favoritism, and legitimacy drag.",
                {
                    institutional_trust: { magnitude: 0.18, elasticity: "inverse" },
                    policy_effectiveness: { magnitude: 0.10, elasticity: "flat" },
                    media_attention: { magnitude: 0.04, elasticity: "flat" },
                },
                ["elite_alignment"],
                ["integrity", "anti-corruption", "legitimacy"]
            ),
        },
        interactions: [
            interaction("institutional_trust", "civic_participation", 0.30, "Trust boosts participation."),
            interaction("media_attention", "institutional_trust", -0.18, "High scrutiny can reduce trust when events turn negative."),
            interaction("elite_alignment", "policy_effectiveness", 0.26, "Aligned elites implement policy better."),
            interaction("policy_effectiveness", "institutional_trust", 0.22, "Effective policy increases credibility."),
        ],
    };
}

function buildSecurityDomain() {
    return {
        label: DOMAINS.security.label,
        description: DOMAINS.security.description,
        prefix: DOMAINS.security.prefix,
        factionWeights: DOMAINS.security.factionWeights,
        variables: {
            threat_level: variable("threat_level", 0, 1, 0.45, "Intensity of credible threat."),
            defensive_readiness: variable("defensive_readiness", 0, 1, 0.55, "Preparedness to absorb or repel threats."),
            intelligence_quality: variable("intelligence_quality", 0, 1, 0.50, "Quality of situational awareness and forecasting."),
            escalation_risk: variable("escalation_risk", 0, 1, 0.40, "Probability of conflict broadening."),
            alliance_support: variable("alliance_support", 0, 1, 0.50, "Strength of cooperative backing."),
            public_anxiety: variable("public_anxiety", 0, 1, 0.42, "Population stress and anxiety under threat."),
        },
        operators: {
            harden_defenses: operator(
                "Improve defenses, perimeter controls, and resilience.",
                {
                    defensive_readiness: { magnitude: 0.18, elasticity: "proportional" },
                    threat_level: { magnitude: -0.06, elasticity: "flat" },
                    public_anxiety: { magnitude: -0.04, elasticity: "flat" },
                },
                ["alliance_support", "intelligence_quality"],
                ["defense", "resilience", "security"]
            ),
            intelligence_surge: operator(
                "Expand monitoring, analysis, and early warning.",
                {
                    intelligence_quality: { magnitude: 0.18, elasticity: "inverse" },
                    threat_level: { magnitude: -0.04, elasticity: "flat" },
                    escalation_risk: { magnitude: -0.05, elasticity: "flat" },
                },
                ["defensive_readiness"],
                ["intel", "forecasting", "risk"]
            ),
            deescalate_tensions: operator(
                "Reduce confrontation, signaling, and force posture.",
                {
                    escalation_risk: { magnitude: -0.18, elasticity: "flat" },
                    public_anxiety: { magnitude: -0.08, elasticity: "inverse" },
                    alliance_support: { magnitude: 0.04, elasticity: "flat" },
                },
                ["threat_level"],
                ["deescalation", "stability", "diplomacy"]
            ),
            alliance_coordination: operator(
                "Coordinate with allies and shared institutions.",
                {
                    alliance_support: { magnitude: 0.20, elasticity: "proportional" },
                    defensive_readiness: { magnitude: 0.08, elasticity: "flat" },
                    escalation_risk: { magnitude: -0.05, elasticity: "flat" },
                },
                ["intelligence_quality"],
                ["alliance", "coordination", "deterrence"]
            ),
        },
        interactions: [
            interaction("intelligence_quality", "defensive_readiness", 0.30, "Better intelligence improves readiness."),
            interaction("threat_level", "public_anxiety", 0.34, "Threat increases stress."),
            interaction("alliance_support", "escalation_risk", -0.25, "Alliance backing can suppress escalation."),
            interaction("defensive_readiness", "escalation_risk", -0.20, "Strong defenses reduce escalation odds."),
        ],
    };
}

function buildCapitalDomain() {
    return {
        label: DOMAINS.capital.label,
        description: DOMAINS.capital.description,
        prefix: DOMAINS.capital.prefix,
        factionWeights: DOMAINS.capital.factionWeights,
        variables: {
            liquidity: variable("liquidity", 0, 1, 0.60, "Ease of converting assets to usable cash."),
            solvency: variable("solvency", 0, 1, 0.55, "Ability to remain balance-sheet healthy."),
            credit_availability: variable("credit_availability", 0, 1, 0.52, "Availability of borrowing capacity."),
            risk_appetite: variable("risk_appetite", 0, 1, 0.50, "Willingness to hold uncertainty or leverage."),
            asset_prices: variable("asset_prices", 0, 1, 0.58, "Valuation pressure across assets."),
            sentiment: variable("sentiment", 0, 1, 0.54, "Market mood and confidence."),
        },
        operators: {
            inject_liquidity: operator(
                "Add liquidity to stabilize funding and flows.",
                {
                    liquidity: { magnitude: 0.20, elasticity: "flat" },
                    credit_availability: { magnitude: 0.10, elasticity: "proportional" },
                    sentiment: { magnitude: 0.06, elasticity: "inverse" },
                },
                ["asset_prices"],
                ["liquidity", "stability", "funding"]
            ),
            deleverage: operator(
                "Reduce leverage and lower balance-sheet fragility.",
                {
                    solvency: { magnitude: 0.16, elasticity: "inverse" },
                    risk_appetite: { magnitude: -0.10, elasticity: "flat" },
                    liquidity: { magnitude: 0.05, elasticity: "flat" },
                },
                ["asset_prices"],
                ["risk-control", "capital", "stability"]
            ),
            raise_credit_standards: operator(
                "Tighten lending standards and reduce marginal risk.",
                {
                    credit_availability: { magnitude: -0.16, elasticity: "flat" },
                    solvency: { magnitude: 0.08, elasticity: "proportional" },
                    sentiment: { magnitude: -0.04, elasticity: "flat" },
                },
                ["risk_appetite"],
                ["credit", "underwriting", "prudence"]
            ),
            rotate_assets: operator(
                "Shift toward stronger or more defensive assets.",
                {
                    asset_prices: { magnitude: 0.08, elasticity: "flat" },
                    sentiment: { magnitude: 0.06, elasticity: "inverse" },
                    risk_appetite: { magnitude: -0.05, elasticity: "flat" },
                },
                ["liquidity", "solvency"],
                ["rotation", "portfolio", "allocation"]
            ),
        },
        interactions: [
            interaction("liquidity", "sentiment", 0.28, "Liquidity often improves mood."),
            interaction("credit_availability", "asset_prices", 0.31, "Easy credit lifts valuations."),
            interaction("solvency", "credit_availability", 0.22, "Healthy balance sheets improve access."),
            interaction("risk_appetite", "asset_prices", 0.24, "Risk appetite affects prices."),
        ],
    };
}

function buildLaborDomain() {
    return {
        label: DOMAINS.labor.label,
        description: DOMAINS.labor.description,
        prefix: DOMAINS.labor.prefix,
        factionWeights: DOMAINS.labor.factionWeights,
        variables: {
            bargaining_power: variable("bargaining_power", 0, 1, 0.48, "Strength of worker bargaining position."),
            wage_pressure: variable("wage_pressure", 0, 1, 0.52, "Pressure for higher compensation."),
            retention: variable("retention", 0, 1, 0.54, "Ability to keep talent in place."),
            morale: variable("morale", 0, 1, 0.50, "Confidence and commitment in the workforce."),
            automation_pressure: variable("automation_pressure", 0, 1, 0.44, "Pressure to automate tasks."),
            hiring_friction: variable("hiring_friction", 0, 1, 0.45, "Difficulty recruiting replacements."),
        },
        operators: {
            raise_wages: operator(
                "Increase compensation to improve worker response.",
                {
                    wage_pressure: { magnitude: 0.18, elasticity: "flat" },
                    morale: { magnitude: 0.14, elasticity: "inverse" },
                    retention: { magnitude: 0.12, elasticity: "proportional" },
                },
                ["bargaining_power"],
                ["compensation", "retention", "labor"]
            ),
            restructure_workflow: operator(
                "Change schedules, process design, and workload distribution.",
                {
                    retention: { magnitude: 0.08, elasticity: "flat" },
                    morale: { magnitude: 0.10, elasticity: "inverse" },
                    hiring_friction: { magnitude: -0.05, elasticity: "flat" },
                },
                ["automation_pressure"],
                ["operations", "productivity", "workflow"]
            ),
            automate_tasks: operator(
                "Replace or assist labor with automation.",
                {
                    automation_pressure: { magnitude: 0.20, elasticity: "proportional" },
                    hiring_friction: { magnitude: -0.08, elasticity: "flat" },
                    morale: { magnitude: -0.06, elasticity: "flat" },
                },
                ["retention"],
                ["automation", "efficiency", "technology"]
            ),
            negotiate_with_workers: operator(
                "Open bargaining and reduce conflict through negotiation.",
                {
                    bargaining_power: { magnitude: 0.12, elasticity: "inverse" },
                    morale: { magnitude: 0.10, elasticity: "flat" },
                    retention: { magnitude: 0.06, elasticity: "flat" },
                },
                ["wage_pressure"],
                ["negotiation", "labor-relations", "alignment"]
            ),
        },
        interactions: [
            interaction("bargaining_power", "wage_pressure", 0.28, "Power raises wage pressure."),
            interaction("morale", "retention", 0.34, "Higher morale improves retention."),
            interaction("automation_pressure", "hiring_friction", -0.14, "Automation can reduce hiring needs."),
            interaction("retention", "bargaining_power", 0.18, "Retention stabilizes bargaining leverage."),
        ],
    };
}

function buildConsumptionDomain() {
    return {
        label: DOMAINS.consumption.label,
        description: DOMAINS.consumption.description,
        prefix: DOMAINS.consumption.prefix,
        factionWeights: DOMAINS.consumption.factionWeights,
        variables: {
            demand_strength: variable("demand_strength", 0, 1, 0.55, "Strength of consumer demand."),
            price_sensitivity: variable("price_sensitivity", 0, 1, 0.50, "Sensitivity to price changes."),
            brand_loyalty: variable("brand_loyalty", 0, 1, 0.48, "Repeat preference for a brand."),
            discretionary_spending: variable("discretionary_spending", 0, 1, 0.50, "Flexible spending capacity."),
            channel_reach: variable("channel_reach", 0, 1, 0.52, "Distribution and exposure breadth."),
            inventory_depth: variable("inventory_depth", 0, 1, 0.54, "Stock availability and buffer depth."),
        },
        operators: {
            launch_campaign: operator(
                "Push marketing to stimulate demand.",
                {
                    demand_strength: { magnitude: 0.16, elasticity: "proportional" },
                    channel_reach: { magnitude: 0.14, elasticity: "inverse" },
                    brand_loyalty: { magnitude: 0.06, elasticity: "flat" },
                },
                ["discretionary_spending"],
                ["marketing", "demand", "growth"]
            ),
            discount_push: operator(
                "Use promotions to move product and reduce friction.",
                {
                    price_sensitivity: { magnitude: 0.08, elasticity: "flat" },
                    demand_strength: { magnitude: 0.12, elasticity: "proportional" },
                    inventory_depth: { magnitude: -0.12, elasticity: "flat" },
                },
                ["channel_reach"],
                ["pricing", "promotion", "conversion"]
            ),
            premium_reposition: operator(
                "Shift the offer upward in perceived value.",
                {
                    brand_loyalty: { magnitude: 0.10, elasticity: "inverse" },
                    price_sensitivity: { magnitude: -0.08, elasticity: "flat" },
                    demand_strength: { magnitude: 0.06, elasticity: "flat" },
                },
                ["channel_reach"],
                ["brand", "positioning", "value"]
            ),
            inventory_clearance: operator(
                "Clear aged inventory and free working capital.",
                {
                    inventory_depth: { magnitude: -0.18, elasticity: "flat" },
                    demand_strength: { magnitude: 0.04, elasticity: "flat" },
                    brand_loyalty: { magnitude: -0.04, elasticity: "flat" },
                },
                ["discretionary_spending"],
                ["inventory", "operations", "liquidity"]
            ),
        },
        interactions: [
            interaction("channel_reach", "demand_strength", 0.30, "Reach expands demand."),
            interaction("price_sensitivity", "demand_strength", -0.24, "Price sensitivity suppresses demand."),
            interaction("brand_loyalty", "demand_strength", 0.22, "Loyalty boosts repeat demand."),
            interaction("inventory_depth", "demand_strength", 0.16, "Healthy inventory supports fulfillment."),
        ],
    };
}

function buildProductivityDomain() {
    return {
        label: DOMAINS.productivity.label,
        description: DOMAINS.productivity.description,
        prefix: DOMAINS.productivity.prefix,
        factionWeights: DOMAINS.productivity.factionWeights,
        variables: {
            focus_quality: variable("focus_quality", 0, 1, 0.55, "Depth and continuity of attention."),
            workflow_efficiency: variable("workflow_efficiency", 0, 1, 0.52, "How much friction exists in the workflow."),
            time_leakage: variable("time_leakage", 0, 1, 0.45, "Unproductive time loss and context switching."),
            habit_stability: variable("habit_stability", 0, 1, 0.50, "Consistency of useful routines."),
            tool_fit: variable("tool_fit", 0, 1, 0.48, "How well tools match the task."),
            burnout_risk: variable("burnout_risk", 0, 1, 0.42, "Risk of fatigue and collapse."),
        },
        operators: {
            enforce_routine: operator(
                "Lock in a repeatable routine to reduce entropy.",
                {
                    habit_stability: { magnitude: 0.18, elasticity: "proportional" },
                    time_leakage: { magnitude: -0.10, elasticity: "flat" },
                    focus_quality: { magnitude: 0.08, elasticity: "inverse" },
                },
                ["burnout_risk"],
                ["habits", "routine", "discipline"]
            ),
            remove_distractions: operator(
                "Reduce interruptions and attention leakage.",
                {
                    time_leakage: { magnitude: -0.18, elasticity: "flat" },
                    focus_quality: { magnitude: 0.12, elasticity: "inverse" },
                    burnout_risk: { magnitude: -0.04, elasticity: "flat" },
                },
                ["workflow_efficiency"],
                ["focus", "attention", "execution"]
            ),
            upgrade_tooling: operator(
                "Improve tools and systems that support work.",
                {
                    tool_fit: { magnitude: 0.16, elasticity: "proportional" },
                    workflow_efficiency: { magnitude: 0.10, elasticity: "inverse" },
                    time_leakage: { magnitude: -0.06, elasticity: "flat" },
                },
                ["focus_quality"],
                ["tools", "systems", "productivity"]
            ),
            recovery_break: operator(
                "Intentionally rest to lower burnout and restore capacity.",
                {
                    burnout_risk: { magnitude: -0.16, elasticity: "flat" },
                    focus_quality: { magnitude: 0.05, elasticity: "flat" },
                    habit_stability: { magnitude: 0.04, elasticity: "flat" },
                },
                ["time_leakage"],
                ["recovery", "rest", "sustainability"]
            ),
        },
        interactions: [
            interaction("focus_quality", "workflow_efficiency", 0.34, "Better focus improves efficiency."),
            interaction("time_leakage", "workflow_efficiency", -0.30, "Time leakage hurts workflow."),
            interaction("habit_stability", "focus_quality", 0.22, "Stable habits support focus."),
            interaction("burnout_risk", "focus_quality", -0.26, "Burnout erodes attention quality."),
        ],
    };
}

function buildTechnologyDomain() {
    return {
        label: DOMAINS.technology.label,
        description: DOMAINS.technology.description,
        prefix: DOMAINS.technology.prefix,
        factionWeights: DOMAINS.technology.factionWeights,
        variables: {
            adoption_rate: variable("adoption_rate", 0, 1, 0.50, "Rate of adoption into the ecosystem."),
            technical_debt: variable("technical_debt", 0, 1, 0.48, "Accumulated friction and future cost."),
            model_quality: variable("model_quality", 0, 1, 0.55, "Capability, reliability, and output quality."),
            infra_resilience: variable("infra_resilience", 0, 1, 0.52, "Ability to withstand load and failures."),
            compliance_burden: variable("compliance_burden", 0, 1, 0.44, "Regulatory and governance drag."),
            developer_velocity: variable("developer_velocity", 0, 1, 0.53, "Speed of engineering output."),
        },
        operators: {
            deploy_model: operator(
                "Ship a model or software capability into production.",
                {
                    adoption_rate: { magnitude: 0.18, elasticity: "proportional" },
                    developer_velocity: { magnitude: 0.06, elasticity: "flat" },
                    technical_debt: { magnitude: 0.04, elasticity: "flat" },
                },
                ["model_quality", "infra_resilience"],
                ["deployment", "ai", "product"]
            ),
            refactor_stack: operator(
                "Reduce complexity and remove technical debt.",
                {
                    technical_debt: { magnitude: -0.18, elasticity: "flat" },
                    infra_resilience: { magnitude: 0.08, elasticity: "proportional" },
                    developer_velocity: { magnitude: 0.08, elasticity: "inverse" },
                },
                ["model_quality"],
                ["engineering", "cleanup", "architecture"]
            ),
            patch_vulnerabilities: operator(
                "Harden the system against known weaknesses.",
                {
                    infra_resilience: { magnitude: 0.16, elasticity: "flat" },
                    compliance_burden: { magnitude: 0.06, elasticity: "flat" },
                    technical_debt: { magnitude: -0.05, elasticity: "flat" },
                },
                ["adoption_rate"],
                ["security", "patching", "hardening"]
            ),
            scale_infra: operator(
                "Increase throughput and service capacity.",
                {
                    infra_resilience: { magnitude: 0.14, elasticity: "proportional" },
                    developer_velocity: { magnitude: 0.08, elasticity: "flat" },
                    technical_debt: { magnitude: 0.03, elasticity: "flat" },
                },
                ["adoption_rate"],
                ["scale", "reliability", "capacity"]
            ),
        },
        interactions: [
            interaction("technical_debt", "developer_velocity", -0.30, "Debt slows engineering."),
            interaction("infra_resilience", "adoption_rate", 0.24, "Reliability improves adoption."),
            interaction("model_quality", "adoption_rate", 0.28, "Better models attract adoption."),
            interaction("compliance_burden", "developer_velocity", -0.18, "Compliance can slow teams."),
        ],
    };
}

function buildEnvironmentDomain() {
    return {
        label: DOMAINS.environment.label,
        description: DOMAINS.environment.description,
        prefix: DOMAINS.environment.prefix,
        factionWeights: DOMAINS.environment.factionWeights,
        variables: {
            resource_abundance: variable("resource_abundance", 0, 1, 0.52, "Availability of critical natural resources."),
            carbon_pressure: variable("carbon_pressure", 0, 1, 0.58, "Pressure from emissions and climate load."),
            energy_transition: variable("energy_transition", 0, 1, 0.46, "Progress toward cleaner energy systems."),
            climate_risk: variable("climate_risk", 0, 1, 0.50, "Exposure to climate-related harm."),
            regulatory_pressure: variable("regulatory_pressure", 0, 1, 0.48, "Policy pressure and environmental regulation."),
            ecosystem_health: variable("ecosystem_health", 0, 1, 0.54, "Condition of ecological systems."),
        },
        operators: {
            invest_green_energy: operator(
                "Deploy capital toward cleaner energy infrastructure.",
                {
                    energy_transition: { magnitude: 0.18, elasticity: "proportional" },
                    carbon_pressure: { magnitude: -0.10, elasticity: "flat" },
                    ecosystem_health: { magnitude: 0.06, elasticity: "flat" },
                },
                ["climate_risk"],
                ["energy", "transition", "decarbonization"]
            ),
            restrict_emissions: operator(
                "Apply tighter emissions constraints and limits.",
                {
                    carbon_pressure: { magnitude: -0.16, elasticity: "flat" },
                    regulatory_pressure: { magnitude: 0.08, elasticity: "flat" },
                    ecosystem_health: { magnitude: 0.05, elasticity: "flat" },
                },
                ["resource_abundance"],
                ["policy", "emissions", "regulation"]
            ),
            conservation_push: operator(
                "Protect ecosystems and reduce depletion.",
                {
                    ecosystem_health: { magnitude: 0.18, elasticity: "inverse" },
                    resource_abundance: { magnitude: 0.08, elasticity: "flat" },
                    climate_risk: { magnitude: -0.05, elasticity: "flat" },
                },
                ["carbon_pressure"],
                ["conservation", "resilience", "nature"]
            ),
            climate_response: operator(
                "Fund adaptation and rapid response capacity.",
                {
                    climate_risk: { magnitude: -0.16, elasticity: "flat" },
                    regulatory_pressure: { magnitude: 0.06, elasticity: "flat" },
                    ecosystem_health: { magnitude: 0.04, elasticity: "flat" },
                },
                ["resource_abundance"],
                ["adaptation", "resilience", "emergency"]
            ),
        },
        interactions: [
            interaction("carbon_pressure", "climate_risk", 0.32, "More emissions drive risk."),
            interaction("energy_transition", "carbon_pressure", -0.28, "Energy transition lowers carbon load."),
            interaction("ecosystem_health", "climate_risk", -0.18, "Healthy ecosystems reduce risk."),
            interaction("regulatory_pressure", "energy_transition", 0.22, "Regulation can accelerate transition."),
        ],
    };
}

function buildKnowledgeDomain() {
    return {
        label: DOMAINS.knowledge.label,
        description: DOMAINS.knowledge.description,
        prefix: DOMAINS.knowledge.prefix,
        factionWeights: DOMAINS.knowledge.factionWeights,
        variables: {
            research_quality: variable("research_quality", 0, 1, 0.55, "Rigor and usefulness of research output."),
            evidence_strength: variable("evidence_strength", 0, 1, 0.52, "Strength of the underlying evidence base."),
            replication_rate: variable("replication_rate", 0, 1, 0.44, "How often findings replicate."),
            publication_velocity: variable("publication_velocity", 0, 1, 0.50, "Speed of publishing and dissemination."),
            access: variable("access", 0, 1, 0.48, "Accessibility of research and knowledge."),
            credibility: variable("credibility", 0, 1, 0.54, "Perceived trustworthiness of the output."),
        },
        operators: {
            publish_research: operator(
                "Release new findings into the public or professional domain.",
                {
                    publication_velocity: { magnitude: 0.18, elasticity: "proportional" },
                    access: { magnitude: 0.10, elasticity: "flat" },
                    credibility: { magnitude: 0.06, elasticity: "inverse" },
                },
                ["research_quality", "evidence_strength"],
                ["research", "publication", "knowledge"]
            ),
            peer_review_drive: operator(
                "Increase validation, critique, and methodological scrutiny.",
                {
                    evidence_strength: { magnitude: 0.16, elasticity: "inverse" },
                    replication_rate: { magnitude: 0.10, elasticity: "flat" },
                    publication_velocity: { magnitude: -0.05, elasticity: "flat" },
                },
                ["credibility"],
                ["peer-review", "validation", "rigor"]
            ),
            open_data_release: operator(
                "Make data and methods widely available.",
                {
                    access: { magnitude: 0.18, elasticity: "flat" },
                    credibility: { magnitude: 0.08, elasticity: "proportional" },
                    publication_velocity: { magnitude: 0.04, elasticity: "flat" },
                },
                ["replication_rate"],
                ["open-data", "transparency", "access"]
            ),
            replication_campaign: operator(
                "Prioritize reproducibility and independent confirmation.",
                {
                    replication_rate: { magnitude: 0.16, elasticity: "inverse" },
                    credibility: { magnitude: 0.08, elasticity: "flat" },
                    publication_velocity: { magnitude: -0.04, elasticity: "flat" },
                },
                ["research_quality"],
                ["replication", "science", "robustness"]
            ),
        },
        interactions: [
            interaction("research_quality", "credibility", 0.30, "Quality improves credibility."),
            interaction("evidence_strength", "replication_rate", 0.24, "Evidence supports replication."),
            interaction("access", "publication_velocity", 0.20, "Access improves dissemination."),
            interaction("replication_rate", "credibility", 0.26, "Replication improves trust."),
        ],
    };
}

function buildMediaDomain() {
    return {
        label: DOMAINS.media.label,
        description: DOMAINS.media.description,
        prefix: DOMAINS.media.prefix,
        factionWeights: DOMAINS.media.factionWeights,
        variables: {
            reach: variable("reach", 0, 1, 0.56, "How many people the content touches."),
            trust: variable("trust", 0, 1, 0.48, "Audience belief in the message source."),
            polarization: variable("polarization", 0, 1, 0.50, "Degree of audience fragmentation."),
            engagement: variable("engagement", 0, 1, 0.54, "Depth of audience interaction."),
            narrative_control: variable("narrative_control", 0, 1, 0.50, "Ability to shape the frame."),
            moderation_pressure: variable("moderation_pressure", 0, 1, 0.42, "Pressure from platform moderation."),
        },
        operators: {
            broadcast_campaign: operator(
                "Run a broad messaging push to increase reach.",
                {
                    reach: { magnitude: 0.18, elasticity: "proportional" },
                    engagement: { magnitude: 0.10, elasticity: "inverse" },
                    narrative_control: { magnitude: 0.08, elasticity: "flat" },
                },
                ["trust"],
                ["broadcast", "campaign", "media"]
            ),
            fact_check_drive: operator(
                "Reduce misinformation and restore source quality.",
                {
                    trust: { magnitude: 0.16, elasticity: "inverse" },
                    polarization: { magnitude: -0.08, elasticity: "flat" },
                    moderation_pressure: { magnitude: 0.04, elasticity: "flat" },
                },
                ["reach"],
                ["truth", "verification", "credibility"]
            ),
            tighten_moderation: operator(
                "Clamp down on harmful or unstable content distribution.",
                {
                    moderation_pressure: { magnitude: 0.16, elasticity: "flat" },
                    polarization: { magnitude: -0.06, elasticity: "flat" },
                    reach: { magnitude: -0.05, elasticity: "flat" },
                },
                ["trust"],
                ["moderation", "safety", "platform"]
            ),
            influencer_partnership: operator(
                "Use trusted intermediaries to amplify message spread.",
                {
                    reach: { magnitude: 0.14, elasticity: "proportional" },
                    engagement: { magnitude: 0.08, elasticity: "flat" },
                    trust: { magnitude: 0.05, elasticity: "inverse" },
                },
                ["narrative_control"],
                ["influencer", "distribution", "amplification"]
            ),
        },
        interactions: [
            interaction("trust", "engagement", 0.30, "Trust drives engagement."),
            interaction("polarization", "trust", -0.28, "Polarization erodes trust."),
            interaction("narrative_control", "reach", 0.20, "Control can broaden reach."),
            interaction("moderation_pressure", "reach", -0.18, "Moderation can reduce reach."),
        ],
    };
}

function buildEducationDomain() {
    return {
        label: DOMAINS.education.label,
        description: DOMAINS.education.description,
        prefix: DOMAINS.education.prefix,
        factionWeights: DOMAINS.education.factionWeights,
        variables: {
            learning_outcomes: variable("learning_outcomes", 0, 1, 0.55, "Measured educational progress."),
            teacher_capacity: variable("teacher_capacity", 0, 1, 0.52, "Ability of educators to deliver quality instruction."),
            curriculum_fit: variable("curriculum_fit", 0, 1, 0.50, "How well content matches learner needs."),
            attendance: variable("attendance", 0, 1, 0.54, "Student participation and presence."),
            cost_burden: variable("cost_burden", 0, 1, 0.46, "Financial burden on learners and institutions."),
            student_motivation: variable("student_motivation", 0, 1, 0.48, "Energy and drive to learn."),
        },
        operators: {
            revise_curriculum: operator(
                "Change what is taught and how it is sequenced.",
                {
                    curriculum_fit: { magnitude: 0.18, elasticity: "inverse" },
                    learning_outcomes: { magnitude: 0.10, elasticity: "proportional" },
                    teacher_capacity: { magnitude: -0.04, elasticity: "flat" },
                },
                ["student_motivation"],
                ["curriculum", "learning", "education"]
            ),
            teacher_training: operator(
                "Improve teacher capability and instructional quality.",
                {
                    teacher_capacity: { magnitude: 0.18, elasticity: "inverse" },
                    learning_outcomes: { magnitude: 0.08, elasticity: "flat" },
                    cost_burden: { magnitude: 0.04, elasticity: "flat" },
                },
                ["attendance"],
                ["teachers", "training", "instruction"]
            ),
            tutoring_drive: operator(
                "Target additional support at struggling learners.",
                {
                    learning_outcomes: { magnitude: 0.16, elasticity: "proportional" },
                    attendance: { magnitude: 0.08, elasticity: "flat" },
                    student_motivation: { magnitude: 0.06, elasticity: "inverse" },
                },
                ["curriculum_fit"],
                ["tutoring", "support", "achievement"]
            ),
            assessment_reform: operator(
                "Change assessment to better measure actual learning.",
                {
                    learning_outcomes: { magnitude: 0.10, elasticity: "flat" },
                    student_motivation: { magnitude: 0.08, elasticity: "inverse" },
                    curriculum_fit: { magnitude: 0.06, elasticity: "flat" },
                },
                ["teacher_capacity"],
                ["assessment", "measurement", "accountability"]
            ),
        },
        interactions: [
            interaction("teacher_capacity", "learning_outcomes", 0.32, "Teacher capacity improves outcomes."),
            interaction("curriculum_fit", "student_motivation", 0.24, "Relevant curriculum improves motivation."),
            interaction("attendance", "learning_outcomes", 0.26, "Attendance drives outcomes."),
            interaction("cost_burden", "attendance", -0.20, "Higher cost reduces attendance."),
        ],
    };
}

function buildCultureDomain() {
    return {
        label: DOMAINS.culture.label,
        description: DOMAINS.culture.description,
        prefix: DOMAINS.culture.prefix,
        factionWeights: DOMAINS.culture.factionWeights,
        variables: {
            identity_alignment: variable("identity_alignment", 0, 1, 0.52, "Match between message and audience identity."),
            trend_velocity: variable("trend_velocity", 0, 1, 0.48, "Speed at which a cultural meme spreads."),
            prestige: variable("prestige", 0, 1, 0.50, "Perceived cultural status."),
            authenticity: variable("authenticity", 0, 1, 0.55, "Belief that the output is genuine."),
            polarization: variable("polarization", 0, 1, 0.44, "Division between cultural camps."),
            creator_support: variable("creator_support", 0, 1, 0.50, "Support for the people making the culture."),
        },
        operators: {
            curate_narrative: operator(
                "Shape the story and frame the meaning.",
                {
                    identity_alignment: { magnitude: 0.14, elasticity: "inverse" },
                    prestige: { magnitude: 0.08, elasticity: "flat" },
                    authenticity: { magnitude: -0.03, elasticity: "flat" },
                },
                ["trend_velocity"],
                ["narrative", "culture", "framing"]
            ),
            sponsor_art: operator(
                "Fund creators and expressive output.",
                {
                    creator_support: { magnitude: 0.18, elasticity: "proportional" },
                    authenticity: { magnitude: 0.10, elasticity: "inverse" },
                    prestige: { magnitude: 0.06, elasticity: "flat" },
                },
                ["trend_velocity"],
                ["art", "sponsorship", "creativity"]
            ),
            authenticity_push: operator(
                "Lean into genuine expression and reduce polish.",
                {
                    authenticity: { magnitude: 0.18, elasticity: "inverse" },
                    polarization: { magnitude: -0.04, elasticity: "flat" },
                    creator_support: { magnitude: 0.04, elasticity: "flat" },
                },
                ["identity_alignment"],
                ["authenticity", "identity", "trust"]
            ),
            heritage_protect: operator(
                "Preserve legacy and cultural memory.",
                {
                    authenticity: { magnitude: 0.12, elasticity: "flat" },
                    prestige: { magnitude: 0.06, elasticity: "flat" },
                    trend_velocity: { magnitude: -0.04, elasticity: "flat" },
                },
                ["identity_alignment"],
                ["heritage", "memory", "continuity"]
            ),
        },
        interactions: [
            interaction("authenticity", "prestige", 0.24, "Authenticity often improves prestige."),
            interaction("identity_alignment", "trend_velocity", 0.22, "Shared identity speeds adoption."),
            interaction("polarization", "authenticity", -0.18, "Polarization can erode authenticity."),
            interaction("creator_support", "trend_velocity", 0.20, "Support speeds creative momentum."),
        ],
    };
}

function buildCommunityDomain() {
    return {
        label: DOMAINS.community.label,
        description: DOMAINS.community.description,
        prefix: DOMAINS.community.prefix,
        factionWeights: DOMAINS.community.factionWeights,
        variables: {
            cohesion: variable("cohesion", 0, 1, 0.54, "How tightly the community holds together."),
            volunteer_capacity: variable("volunteer_capacity", 0, 1, 0.48, "Ability to mobilize unpaid support."),
            mutual_aid: variable("mutual_aid", 0, 1, 0.50, "Strength of help among members."),
            safety: variable("safety", 0, 1, 0.52, "Perceived protection from harm."),
            local_trust: variable("local_trust", 0, 1, 0.55, "Confidence in local relationships."),
            participation: variable("participation", 0, 1, 0.46, "Breadth of active community involvement."),
        },
        operators: {
            organize_volunteers: operator(
                "Build a volunteer network around a concrete mission.",
                {
                    volunteer_capacity: { magnitude: 0.18, elasticity: "proportional" },
                    participation: { magnitude: 0.10, elasticity: "inverse" },
                    cohesion: { magnitude: 0.06, elasticity: "flat" },
                },
                ["mutual_aid"],
                ["volunteer", "community", "mobilization"]
            ),
            mutual_aid_push: operator(
                "Expand practical support channels among neighbors.",
                {
                    mutual_aid: { magnitude: 0.18, elasticity: "inverse" },
                    safety: { magnitude: 0.08, elasticity: "flat" },
                    local_trust: { magnitude: 0.06, elasticity: "flat" },
                },
                ["cohesion"],
                ["support", "neighbors", "resilience"]
            ),
            safety_patrol: operator(
                "Increase visible safety presence and response capacity.",
                {
                    safety: { magnitude: 0.16, elasticity: "flat" },
                    local_trust: { magnitude: 0.06, elasticity: "flat" },
                    participation: { magnitude: -0.04, elasticity: "flat" },
                },
                ["cohesion"],
                ["safety", "protection", "stability"]
            ),
            conflict_mediation: operator(
                "Reduce disputes through mediation and dialogue.",
                {
                    cohesion: { magnitude: 0.14, elasticity: "inverse" },
                    local_trust: { magnitude: 0.08, elasticity: "flat" },
                    participation: { magnitude: 0.04, elasticity: "flat" },
                },
                ["volunteer_capacity"],
                ["mediation", "trust", "repair"]
            ),
        },
        interactions: [
            interaction("local_trust", "participation", 0.30, "Trust drives participation."),
            interaction("cohesion", "mutual_aid", 0.24, "Cohesion supports aid."),
            interaction("safety", "local_trust", 0.22, "Safety builds trust."),
            interaction("volunteer_capacity", "participation", 0.18, "Capacity increases participation."),
        ],
    };
}

function buildHealthDomain() {
    return {
        label: DOMAINS.health.label,
        description: DOMAINS.health.description,
        prefix: DOMAINS.health.prefix,
        factionWeights: DOMAINS.health.factionWeights,
        variables: {
            access: variable("access", 0, 1, 0.60, "Ease of receiving care or support."),
            care_quality: variable("care_quality", 0, 1, 0.55, "Quality of treatment or intervention."),
            cost_pressure: variable("cost_pressure", 0, 1, 0.50, "Financial burden of treatment."),
            prevention_rate: variable("prevention_rate", 0, 1, 0.52, "How much illness is prevented."),
            workforce_capacity: variable("workforce_capacity", 0, 1, 0.48, "Number and strength of professionals."),
            trust: variable("trust", 0, 1, 0.54, "Confidence in providers and systems."),
        },
        operators: {
            expand_access: operator(
                "Make care easier to obtain and use.",
                {
                    access: { magnitude: 0.18, elasticity: "proportional" },
                    trust: { magnitude: 0.08, elasticity: "inverse" },
                    cost_pressure: { magnitude: 0.05, elasticity: "flat" },
                },
                ["care_quality"],
                ["access", "care", "health"]
            ),
            preventive_campaign: operator(
                "Shift the system upstream toward prevention.",
                {
                    prevention_rate: { magnitude: 0.18, elasticity: "inverse" },
                    trust: { magnitude: 0.05, elasticity: "flat" },
                    cost_pressure: { magnitude: -0.06, elasticity: "flat" },
                },
                ["access"],
                ["prevention", "public-health", "wellness"]
            ),
            workforce_training: operator(
                "Improve the effectiveness of clinicians and support teams.",
                {
                    workforce_capacity: { magnitude: 0.16, elasticity: "inverse" },
                    care_quality: { magnitude: 0.10, elasticity: "proportional" },
                    cost_pressure: { magnitude: 0.04, elasticity: "flat" },
                },
                ["trust"],
                ["training", "capacity", "quality"]
            ),
            telehealth_scale: operator(
                "Use digital delivery to widen reach and efficiency.",
                {
                    access: { magnitude: 0.14, elasticity: "proportional" },
                    workforce_capacity: { magnitude: 0.08, elasticity: "flat" },
                    cost_pressure: { magnitude: -0.05, elasticity: "flat" },
                },
                ["trust"],
                ["telehealth", "digital", "delivery"]
            ),
        },
        interactions: [
            interaction("access", "care_quality", 0.26, "Access improves quality of care."),
            interaction("care_quality", "trust", 0.30, "Better care builds trust."),
            interaction("cost_pressure", "access", -0.24, "Costs reduce access."),
            interaction("workforce_capacity", "care_quality", 0.28, "More capacity improves quality."),
        ],
    };
}

function buildSocietalDomain() {
    return {
        label: DOMAINS.societal.label,
        description: DOMAINS.societal.description,
        prefix: DOMAINS.societal.prefix,
        factionWeights: DOMAINS.societal.factionWeights,
        variables: {
            legitimacy: variable("legitimacy", 0, 1, 0.52, "Perceived rightfulness of the system."),
            polarization: variable("polarization", 0, 1, 0.50, "Degree of social and political division."),
            fiscal_pressure: variable("fiscal_pressure", 0, 1, 0.48, "Budget and funding strain."),
            social_cohesion: variable("social_cohesion", 0, 1, 0.50, "How well groups remain coordinated."),
            institutional_capacity: variable("institutional_capacity", 0, 1, 0.54, "Ability to execute and govern."),
            crisis_intensity: variable("crisis_intensity", 0, 1, 0.42, "Magnitude of system-wide stress."),
        },
        operators: {
            enact_reform: operator(
                "Pass a system-level reform package.",
                {
                    legitimacy: { magnitude: 0.14, elasticity: "inverse" },
                    institutional_capacity: { magnitude: 0.10, elasticity: "proportional" },
                    fiscal_pressure: { magnitude: -0.04, elasticity: "flat" },
                },
                ["social_cohesion", "polarization"],
                ["reform", "policy", "system"]
            ),
            stabilize_institutions: operator(
                "Reduce volatility and restore institutional function.",
                {
                    legitimacy: { magnitude: 0.18, elasticity: "inverse" },
                    institutional_capacity: { magnitude: 0.12, elasticity: "flat" },
                    crisis_intensity: { magnitude: -0.12, elasticity: "flat" },
                },
                ["social_cohesion"],
                ["stability", "institutions", "trust"]
            ),
            anti_corruption_drive: operator(
                "Target corruption, leakage, and legitimacy loss.",
                {
                    legitimacy: { magnitude: 0.16, elasticity: "inverse" },
                    polarization: { magnitude: -0.06, elasticity: "flat" },
                    institutional_capacity: { magnitude: 0.06, elasticity: "flat" },
                },
                ["fiscal_pressure"],
                ["integrity", "accountability", "legitimacy"]
            ),
            public_communication: operator(
                "Broadcast credible messaging during instability.",
                {
                    social_cohesion: { magnitude: 0.12, elasticity: "inverse" },
                    polarization: { magnitude: -0.08, elasticity: "flat" },
                    crisis_intensity: { magnitude: -0.04, elasticity: "flat" },
                },
                ["legitimacy"],
                ["communication", "narrative", "coordination"]
            ),
        },
        interactions: [
            interaction("legitimacy", "social_cohesion", 0.30, "Legitimacy supports cohesion."),
            interaction("polarization", "legitimacy", -0.28, "Polarization erodes legitimacy."),
            interaction("institutional_capacity", "crisis_intensity", -0.22, "Capacity suppresses crises."),
            interaction("fiscal_pressure", "institutional_capacity", -0.20, "Pressure weakens capacity."),
        ],
    };
}

function buildBusinessDomain() {
    return {
        label: DOMAINS.business.label,
        description: DOMAINS.business.description,
        prefix: DOMAINS.business.prefix,
        factionWeights: DOMAINS.business.factionWeights,
        variables: {
            margin_pressure: variable("margin_pressure", 0, 1, 0.50, "Pressure on profit margin."),
            demand: variable("demand", 0, 1, 0.54, "Customer demand and appetite."),
            execution_quality: variable("execution_quality", 0, 1, 0.52, "Operational quality and consistency."),
            capital_access: variable("capital_access", 0, 1, 0.50, "Access to funding and runway."),
            talent_quality: variable("talent_quality", 0, 1, 0.56, "Strength of the team."),
            brand_strength: variable("brand_strength", 0, 1, 0.48, "Perceived brand power."),
        },
        operators: {
            raise_capital: operator(
                "Bring in more money to extend runway and options.",
                {
                    capital_access: { magnitude: 0.18, elasticity: "proportional" },
                    demand: { magnitude: 0.04, elasticity: "flat" },
                    margin_pressure: { magnitude: 0.05, elasticity: "flat" },
                },
                ["execution_quality"],
                ["capital", "funding", "runway"]
            ),
            launch_product: operator(
                "Ship a product to market and test demand.",
                {
                    demand: { magnitude: 0.16, elasticity: "proportional" },
                    brand_strength: { magnitude: 0.08, elasticity: "inverse" },
                    execution_quality: { magnitude: 0.06, elasticity: "flat" },
                },
                ["talent_quality"],
                ["product", "launch", "growth"]
            ),
            restructure_team: operator(
                "Reset roles, ownership, and management structure.",
                {
                    execution_quality: { magnitude: 0.14, elasticity: "inverse" },
                    talent_quality: { magnitude: 0.10, elasticity: "flat" },
                    margin_pressure: { magnitude: -0.06, elasticity: "flat" },
                },
                ["capital_access"],
                ["organization", "alignment", "operations"]
            ),
            expand_sales: operator(
                "Push distribution, conversion, and revenue capture.",
                {
                    demand: { magnitude: 0.14, elasticity: "proportional" },
                    brand_strength: { magnitude: 0.08, elasticity: "flat" },
                    margin_pressure: { magnitude: 0.05, elasticity: "flat" },
                },
                ["execution_quality"],
                ["sales", "revenue", "go-to-market"]
            ),
        },
        interactions: [
            interaction("execution_quality", "demand", 0.22, "Good execution supports demand."),
            interaction("talent_quality", "execution_quality", 0.30, "Talent improves execution."),
            interaction("capital_access", "margin_pressure", -0.18, "Funding can reduce pressure."),
            interaction("brand_strength", "demand", 0.24, "Brand strength lifts demand."),
        ],
    };
}

function buildFinanceDomain() {
    return {
        label: DOMAINS.finance.label,
        description: DOMAINS.finance.description,
        prefix: DOMAINS.finance.prefix,
        factionWeights: DOMAINS.finance.factionWeights,
        variables: {
            liquidity: variable("liquidity", 0, 1, 0.58, "Cash-like flexibility."),
            solvency: variable("solvency", 0, 1, 0.54, "Ability to remain financially sound."),
            rate_pressure: variable("rate_pressure", 0, 1, 0.50, "Pressure from higher rates or financing costs."),
            risk_sentiment: variable("risk_sentiment", 0, 1, 0.52, "Overall appetite for risk."),
            asset_prices: variable("asset_prices", 0, 1, 0.56, "Price levels across assets."),
            credit_spread: variable("credit_spread", 0, 1, 0.48, "Premium charged for risk."),
        },
        operators: {
            diversify_portfolio: operator(
                "Shift exposures across multiple assets or assets classes.",
                {
                    risk_sentiment: { magnitude: -0.04, elasticity: "flat" },
                    solvency: { magnitude: 0.10, elasticity: "flat" },
                    asset_prices: { magnitude: 0.06, elasticity: "flat" },
                },
                ["liquidity"],
                ["diversification", "risk", "portfolio"]
            ),
            hedge_risk: operator(
                "Reduce downside exposure through protection or offsets.",
                {
                    credit_spread: { magnitude: -0.08, elasticity: "flat" },
                    risk_sentiment: { magnitude: 0.06, elasticity: "inverse" },
                    liquidity: { magnitude: -0.04, elasticity: "flat" },
                },
                ["solvency"],
                ["hedging", "protection", "risk-management"]
            ),
            inject_cash: operator(
                "Improve near-term liquidity and flexibility.",
                {
                    liquidity: { magnitude: 0.20, elasticity: "proportional" },
                    asset_prices: { magnitude: 0.06, elasticity: "flat" },
                    rate_pressure: { magnitude: -0.04, elasticity: "flat" },
                },
                ["credit_spread"],
                ["cash", "liquidity", "support"]
            ),
            deleverage: operator(
                "Reduce debt intensity and balance-sheet fragility.",
                {
                    solvency: { magnitude: 0.18, elasticity: "inverse" },
                    rate_pressure: { magnitude: -0.06, elasticity: "flat" },
                    credit_spread: { magnitude: -0.05, elasticity: "flat" },
                },
                ["liquidity"],
                ["deleveraging", "prudence", "stability"]
            ),
        },
        interactions: [
            interaction("liquidity", "solvency", 0.28, "Liquidity helps solvency."),
            interaction("rate_pressure", "credit_spread", 0.26, "Higher rates widen spreads."),
            interaction("risk_sentiment", "asset_prices", 0.24, "Risk appetite lifts valuations."),
            interaction("solvency", "credit_spread", -0.22, "Healthy balance sheets reduce spreads."),
        ],
    };
}

function buildRelationshipDomain() {
    return {
        label: DOMAINS.relationship.label,
        description: DOMAINS.relationship.description,
        prefix: DOMAINS.relationship.prefix,
        factionWeights: DOMAINS.relationship.factionWeights,
        variables: {
            attachment_strength: variable("attachment_strength", 0, 1, 0.55, "Closeness and bonding strength."),
            communication_quality: variable("communication_quality", 0, 1, 0.50, "How well people communicate."),
            conflict_intensity: variable("conflict_intensity", 0, 1, 0.44, "How intense the disagreement is."),
            trust: variable("trust", 0, 1, 0.54, "Belief that the other side is safe and reliable."),
            life_alignment: variable("life_alignment", 0, 1, 0.50, "Degree of shared direction and values."),
            support_density: variable("support_density", 0, 1, 0.48, "Available emotional and practical support."),
        },
        operators: {
            open_conversation: operator(
                "Initiate direct, honest communication.",
                {
                    communication_quality: { magnitude: 0.18, elasticity: "inverse" },
                    trust: { magnitude: 0.08, elasticity: "flat" },
                    conflict_intensity: { magnitude: -0.06, elasticity: "flat" },
                },
                ["attachment_strength"],
                ["communication", "trust", "repair"]
            ),
            set_boundaries: operator(
                "Clarify limits, expectations, and acceptable behavior.",
                {
                    conflict_intensity: { magnitude: -0.10, elasticity: "flat" },
                    trust: { magnitude: 0.04, elasticity: "flat" },
                    support_density: { magnitude: 0.04, elasticity: "flat" },
                },
                ["life_alignment"],
                ["boundaries", "clarity", "stability"]
            ),
            counseling_session: operator(
                "Bring in mediated support to repair the relationship.",
                {
                    trust: { magnitude: 0.12, elasticity: "inverse" },
                    communication_quality: { magnitude: 0.10, elasticity: "proportional" },
                    conflict_intensity: { magnitude: -0.08, elasticity: "flat" },
                },
                ["attachment_strength"],
                ["counseling", "repair", "mediation"]
            ),
            disengage: operator(
                "Reduce contact or end a harmful pattern.",
                {
                    conflict_intensity: { magnitude: -0.16, elasticity: "flat" },
                    attachment_strength: { magnitude: -0.10, elasticity: "flat" },
                    support_density: { magnitude: 0.04, elasticity: "flat" },
                },
                ["trust"],
                ["disengage", "distance", "protection"]
            ),
        },
        interactions: [
            interaction("communication_quality", "trust", 0.32, "Good communication builds trust."),
            interaction("trust", "attachment_strength", 0.30, "Trust deepens attachment."),
            interaction("conflict_intensity", "trust", -0.28, "Conflict erodes trust."),
            interaction("life_alignment", "attachment_strength", 0.22, "Alignment strengthens bonds."),
        ],
    };
}

function buildCreativeDomain() {
    return {
        label: DOMAINS.creative.label,
        description: DOMAINS.creative.description,
        prefix: DOMAINS.creative.prefix,
        factionWeights: DOMAINS.creative.factionWeights,
        variables: {
            originality: variable("originality", 0, 1, 0.54, "How novel the work feels."),
            production_speed: variable("production_speed", 0, 1, 0.50, "How quickly work is shipped."),
            audience_fit: variable("audience_fit", 0, 1, 0.52, "Degree of match with the target audience."),
            brand_consistency: variable("brand_consistency", 0, 1, 0.48, "Consistency of creative identity."),
            collaboration_quality: variable("collaboration_quality", 0, 1, 0.50, "How effectively collaborators work together."),
            burnout_risk: variable("burnout_risk", 0, 1, 0.44, "Risk of creative exhaustion."),
        },
        operators: {
            ship_artifact: operator(
                "Release the creative work into the world.",
                {
                    production_speed: { magnitude: 0.16, elasticity: "proportional" },
                    audience_fit: { magnitude: 0.08, elasticity: "flat" },
                    burnout_risk: { magnitude: 0.04, elasticity: "flat" },
                },
                ["originality"],
                ["shipping", "creation", "delivery"]
            ),
            refine_brand: operator(
                "Clarify the creative identity and presentation.",
                {
                    brand_consistency: { magnitude: 0.16, elasticity: "inverse" },
                    audience_fit: { magnitude: 0.08, elasticity: "flat" },
                    originality: { magnitude: -0.04, elasticity: "flat" },
                },
                ["collaboration_quality"],
                ["branding", "identity", "positioning"]
            ),
            deepen_collaboration: operator(
                "Strengthen the creative process through cooperation.",
                {
                    collaboration_quality: { magnitude: 0.18, elasticity: "inverse" },
                    originality: { magnitude: 0.06, elasticity: "flat" },
                    burnout_risk: { magnitude: -0.04, elasticity: "flat" },
                },
                ["production_speed"],
                ["collaboration", "team", "creative-process"]
            ),
            audience_test: operator(
                "Validate the work against audience response.",
                {
                    audience_fit: { magnitude: 0.14, elasticity: "flat" },
                    brand_consistency: { magnitude: 0.04, elasticity: "flat" },
                    production_speed: { magnitude: -0.04, elasticity: "flat" },
                },
                ["originality"],
                ["testing", "feedback", "audience"]
            ),
        },
        interactions: [
            interaction("originality", "audience_fit", 0.18, "Originality can improve fit when aligned."),
            interaction("brand_consistency", "audience_fit", 0.24, "Consistency helps audience fit."),
            interaction("production_speed", "burnout_risk", 0.28, "Speed can increase burnout."),
            interaction("collaboration_quality", "production_speed", 0.20, "Good collaboration speeds output."),
        ],
    };
}

function buildCareerDomain() {
    return {
        label: DOMAINS.career.label,
        description: DOMAINS.career.description,
        prefix: DOMAINS.career.prefix,
        factionWeights: DOMAINS.career.factionWeights,
        variables: {
            marketability: variable("marketability", 0, 1, 0.54, "How attractive the profile is to the market."),
            role_fit: variable("role_fit", 0, 1, 0.50, "How well the work matches the person."),
            compensation: variable("compensation", 0, 1, 0.52, "Pay and financial reward level."),
            growth_opportunity: variable("growth_opportunity", 0, 1, 0.55, "Upward learning and responsibility path."),
            network_strength: variable("network_strength", 0, 1, 0.48, "Strength of useful relationships."),
            job_security: variable("job_security", 0, 1, 0.50, "Stability and durability of employment."),
        },
        operators: {
            apply_internal: operator(
                "Move within the current organization to a stronger role.",
                {
                    role_fit: { magnitude: 0.14, elasticity: "inverse" },
                    compensation: { magnitude: 0.08, elasticity: "flat" },
                    job_security: { magnitude: 0.08, elasticity: "flat" },
                },
                ["growth_opportunity"],
                ["promotion", "internal", "career"]
            ),
            switch_roles: operator(
                "Take on a different role or specialty.",
                {
                    growth_opportunity: { magnitude: 0.16, elasticity: "proportional" },
                    role_fit: { magnitude: 0.08, elasticity: "flat" },
                    job_security: { magnitude: -0.05, elasticity: "flat" },
                },
                ["marketability"],
                ["role-change", "career", "mobility"]
            ),
            negotiate_offer: operator(
                "Push for a better package or title.",
                {
                    compensation: { magnitude: 0.16, elasticity: "inverse" },
                    marketability: { magnitude: 0.06, elasticity: "flat" },
                    job_security: { magnitude: -0.04, elasticity: "flat" },
                },
                ["network_strength"],
                ["negotiation", "offer", "value"]
            ),
            upskill: operator(
                "Increase capability to improve future options.",
                {
                    marketability: { magnitude: 0.14, elasticity: "proportional" },
                    growth_opportunity: { magnitude: 0.08, elasticity: "flat" },
                    job_security: { magnitude: 0.04, elasticity: "flat" },
                },
                ["role_fit"],
                ["learning", "skills", "future-proofing"]
            ),
        },
        interactions: [
            interaction("marketability", "compensation", 0.24, "Marketability raises compensation."),
            interaction("role_fit", "job_security", 0.26, "Fit improves stability."),
            interaction("network_strength", "growth_opportunity", 0.22, "Network expands opportunities."),
            interaction("growth_opportunity", "marketability", 0.18, "Growth improves marketability."),
        ],
    };
}

function buildEntertainmentDomain() {
    return {
        label: DOMAINS.entertainment.label,
        description: DOMAINS.entertainment.description,
        prefix: DOMAINS.entertainment.prefix,
        factionWeights: DOMAINS.entertainment.factionWeights,
        variables: {
            audience_interest: variable("audience_interest", 0, 1, 0.56, "Attention and curiosity from the audience."),
            production_value: variable("production_value", 0, 1, 0.52, "Visible polish and execution quality."),
            monetization: variable("monetization", 0, 1, 0.48, "Revenue capture from the project."),
            franchise_strength: variable("franchise_strength", 0, 1, 0.50, "Ability to extend the property."),
            backlash_risk: variable("backlash_risk", 0, 1, 0.44, "Risk of negative reaction."),
            platform_distribution: variable("platform_distribution", 0, 1, 0.50, "Breadth of platform access."),
        },
        operators: {
            greenlight_project: operator(
                "Approve and initiate a project or show.",
                {
                    audience_interest: { magnitude: 0.16, elasticity: "proportional" },
                    production_value: { magnitude: 0.08, elasticity: "flat" },
                    backlash_risk: { magnitude: 0.04, elasticity: "flat" },
                },
                ["platform_distribution"],
                ["production", "greenlight", "content"]
            ),
            boost_distribution: operator(
                "Increase platform reach and delivery access.",
                {
                    platform_distribution: { magnitude: 0.18, elasticity: "proportional" },
                    audience_interest: { magnitude: 0.06, elasticity: "flat" },
                    monetization: { magnitude: 0.05, elasticity: "flat" },
                },
                ["franchise_strength"],
                ["distribution", "reach", "platform"]
            ),
            franchise_extension: operator(
                "Extend a property through sequels, spinoffs, or variants.",
                {
                    franchise_strength: { magnitude: 0.18, elasticity: "inverse" },
                    monetization: { magnitude: 0.08, elasticity: "flat" },
                    backlash_risk: { magnitude: 0.05, elasticity: "flat" },
                },
                ["audience_interest"],
                ["franchise", "expansion", "entertainment"]
            ),
            review_cycles: operator(
                "Run iterative critiques and audience testing loops.",
                {
                    production_value: { magnitude: 0.10, elasticity: "inverse" },
                    backlash_risk: { magnitude: -0.06, elasticity: "flat" },
                    audience_interest: { magnitude: 0.06, elasticity: "flat" },
                },
                ["monetization"],
                ["feedback", "quality", "iteration"]
            ),
        },
        interactions: [
            interaction("production_value", "audience_interest", 0.24, "Polish improves interest."),
            interaction("audience_interest", "monetization", 0.26, "Interest converts to money."),
            interaction("backlash_risk", "audience_interest", -0.22, "Backlash suppresses interest."),
            interaction("platform_distribution", "audience_interest", 0.20, "Distribution expands reach."),
        ],
    };
}

const DOMAIN_BLUEPRINTS = {
    common: buildCommonDomain,
    governance: buildGovernanceDomain,
    security: buildSecurityDomain,
    capital: buildCapitalDomain,
    labor: buildLaborDomain,
    consumption: buildConsumptionDomain,
    productivity: buildProductivityDomain,
    technology: buildTechnologyDomain,
    environment: buildEnvironmentDomain,
    knowledge: buildKnowledgeDomain,
    media: buildMediaDomain,
    education: buildEducationDomain,
    culture: buildCultureDomain,
    community: buildCommunityDomain,
    health: buildHealthDomain,
    societal: buildSocietalDomain,
    business: buildBusinessDomain,
    finance: buildFinanceDomain,
    relationship: buildRelationshipDomain,
    creative: buildCreativeDomain,
    career: buildCareerDomain,
    entertainment: buildEntertainmentDomain,
};

class DomainOntologyCatalog {
    constructor(domainBlueprints) {
        this.domainBlueprints = domainBlueprints;
        this.cache = new Map();
        this.aliasMap = this.buildAliasMap();
    }

    buildAliasMap() {
        return {
            common: "common",
            commons: "common",
            mixed: "common",
            general: "common",
            default: "common",
            governance: "governance",
            government: "governance",
            politics: "governance",
            policy: "governance",
            state: "governance",
            security: "security",
            defense: "security",
            military: "security",
            cyber: "security",
            cybersecurity: "security",
            capital: "capital",
            finance: "finance",
            financial: "finance",
            banking: "finance",
            money: "finance",
            labor: "labor",
            "labor market": "labor",
            "labor_market": "labor",
            work: "labor",
            workforce: "labor",
            employment: "labor",
            consumption: "consumption",
            consumer: "consumption",
            retail: "consumption",
            productivity: "productivity",
            habits: "productivity",
            time_management: "productivity",
            technology: "technology",
            tech: "technology",
            software: "technology",
            ai: "technology",
            environment: "environment",
            climate: "environment",
            ecology: "environment",
            knowledge: "knowledge",
            research: "knowledge",
            academia: "knowledge",
            media: "media",
            journalism: "media",
            broadcasting: "media",
            education: "education",
            school: "education",
            schools: "education",
            culture: "culture",
            art: "culture",
            community: "community",
            local: "community",
            health: "health",
            medical: "health",
            societal: "societal",
            society: "societal",
            social: "societal",
            business: "business",
            startup: "business",
            startups: "business",
            relationship: "relationship",
            relationships: "relationship",
            creative: "creative",
            creator: "creative",
            career: "career",
            job: "career",
            jobs: "career",
            entertainment: "entertainment",
            entertainment_industry: "entertainment",
        };
    }

    resolveDomainName(domainName = "common") {
        const raw = String(domainName ?? "common").trim().toLowerCase();
        const alias = this.aliasMap[raw];
        if (alias && this.domainBlueprints[alias]) return alias;

        if (this.domainBlueprints[raw]) return raw;

        const compact = raw.replace(/[\s_\-]/g, "");
        for (const key of Object.keys(this.domainBlueprints)) {
            if (key.replace(/[\s_\-]/g, "") === compact) {
                return key;
            }
        }

        return "common";
    }

    buildDomain(domainName) {
        const canonical = this.resolveDomainName(domainName);
        if (this.cache.has(canonical)) {
            return deepClone(this.cache.get(canonical));
        }

        const blueprintFactory = this.domainBlueprints[canonical] || this.domainBlueprints.common;
        const blueprint = typeof blueprintFactory === "function" ? blueprintFactory() : blueprintFactory;

        const enriched = enrichDomain(canonical, blueprint);
        this.cache.set(canonical, enriched);
        return deepClone(enriched);
    }
}

const ontologyCatalog = new DomainOntologyCatalog(DOMAIN_BLUEPRINTS);

/**
 * Returns the domain constraint graph for the given domain name.
 * Falls back to the common bounded structure for unknown domains.
 */
export function getDomainOntology(domainName = "common") {
    return ontologyCatalog.buildDomain(domainName);
}

/**
 * Exported for transparency and debugging.
 * This is the normalized ontology map used by the engine.
 */
export const DOMAIN_ONTOLOGY = (() => {
    const map = {};
    for (const key of Object.keys(DOMAIN_BLUEPRINTS)) {
        map[key] = getDomainOntology(key);
    }
    return map;
})();

export const DOMAIN_CATALOG = ontologyCatalog;
