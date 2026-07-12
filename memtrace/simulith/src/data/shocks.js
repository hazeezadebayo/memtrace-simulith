/**
 * EXPANDED SHOCK REGISTRY
 * ------------------------------------------------------------------
 * This version is designed to scale cleanly while still producing:
 *
 * - 20 positive events per domain
 * - 20 negative events per domain
 * - Realistic and internally coherent scenarios
 * - Rich metadata
 * - Deterministic IDs
 * - Extensible architecture
 */
/**
 * Expanded shock registry, upgraded.
 *
 * Public API preserved:
 * - SHOCK_REGISTRY
 * - getDomainShocks(domain)
 * - getAllPositiveShocks()
 * - getAllNegativeShocks()
 * - findShocksByTag(tag)
 * - getRandomShock({ domain, polarity, previousShocks })
 *
 * Improvements:
 * - Supports the full user domain set
 * - Produces 20 positive and 20 negative shocks per domain
 * - Weighted random selection that accounts for severity, plausibility,
 *   polarity, and novelty
 * - Richer metadata for downstream narrative and analysis layers
 * - Deterministic IDs
 */

const POSITIVE = "positive";
const NEGATIVE = "negative";

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

function titleCase(value) {
  return String(value ?? "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function createShockId(prefix, polarity, index) {
  const normalizedIndex = String(index + 1).padStart(2, "0");
  return `${prefix}_${polarity === POSITIVE ? "POS" : "NEG"}_${normalizedIndex}`;
}

function makeShock({
  domainPrefix,
  polarity,
  index,
  title,
  description,
  tags,
  severity,
  probability,
  duration,
  scope,
  mechanism,
  leadingIndicators,
  countermeasures,
}) {
  return {
    id: createShockId(domainPrefix, polarity, index),
    title,
    description,
    tags,
    severity,
    probability,
    duration,
    scope,
    mechanism,
    leading_indicators: leadingIndicators,
    countermeasures,
    polarity,
  };
}

function normalizeShockId(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && value !== null) {
    return String(value.id || value.shock_id || value.name || "").trim();
  }
  return String(value).trim();
}

function weightFromProbabilityLabel(label) {
  switch (String(label).toLowerCase()) {
    case "unlikely":
      return 1;
    case "possible":
      return 2;
    case "plausible":
      return 3;
    case "likely":
      return 4;
    default:
      return 2;
  }
}

function weightFromSeverityLabel(label) {
  switch (String(label).toLowerCase()) {
    case "low":
      return 1;
    case "moderate":
      return 2;
    case "high":
      return 3;
    case "critical":
      return 4;
    default:
      return 2;
  }
}

function selectByCycle(list, index) {
  if (!Array.isArray(list) || list.length === 0) return "";
  return list[index % list.length];
}

function buildTags(parts) {
  const tags = [];
  for (const part of parts) {
    if (Array.isArray(part)) {
      for (const item of part) {
        const text = String(item ?? "").trim();
        if (text) tags.push(text);
      }
    } else {
      const text = String(part ?? "").trim();
      if (text) tags.push(text);
    }
  }

  return Array.from(new Set(tags.map((tag) => tag.toLowerCase()))).map((tag) => tag);
}

function buildLeadingIndicators(positive, index) {
  const templates = [
    `First-order signals improve within the first ${index % 4 + 1} reporting cycles`,
    `Stakeholder confidence begins to shift before headline metrics move`,
    `Operational metrics stabilize ahead of broader sentiment changes`,
    `Incidental adoption or compliance accelerates before the full effect appears`,
  ];
  return [templates[index % templates.length], positive];
}

function buildCountermeasures(negative, index) {
  const templates = [
    `Reduce exposure and isolate the weakest coupling points`,
    `Create a narrow containment plan before spillover expands`,
    `Increase redundancy and shorten the feedback loop`,
    `Communicate early to avoid compounding trust decay`,
  ];
  return [templates[index % templates.length], negative];
}

function makeTemplateSet(kind) {
  if (kind === POSITIVE) {
    return [
      {
        title: (ctx) => `${titleCase(ctx.trigger)} Breakthrough`,
        description: (ctx) => `A meaningful breakthrough around ${ctx.trigger} improves ${ctx.impact} and reshapes the operating environment in a constructive direction.`,
        mechanism: (ctx) => `Positive feedback loop through ${ctx.trigger} and improved ${ctx.impact}`,
      },
      {
        title: (ctx) => `${titleCase(ctx.impact)} Flywheel`,
        description: (ctx) => `Repeated small wins begin to compound, producing a self-reinforcing lift in ${ctx.impact}.`,
        mechanism: (ctx) => `Compounding adoption and confidence around ${ctx.impact}`,
      },
      {
        title: (ctx) => `${titleCase(ctx.trigger)} Alignment`,
        description: (ctx) => `Previously fragmented actors synchronize around ${ctx.trigger}, creating cleaner execution and better outcomes for ${ctx.impact}.`,
        mechanism: (ctx) => `Coordination gain and reduced friction in ${ctx.trigger}`,
      },
      {
        title: (ctx) => `${titleCase(ctx.impact)} Expansion`,
        description: (ctx) => `A favorable expansion in ${ctx.impact} arrives faster than expected and broadens the room for action.`,
        mechanism: (ctx) => `Capacity expansion and improved optionality`,
      },
      {
        title: (ctx) => `${titleCase(ctx.trigger)} Momentum`,
        description: (ctx) => `Momentum around ${ctx.trigger} starts to pull adjacent systems upward, improving ${ctx.impact}.`,
        mechanism: (ctx) => `Momentum cascade from ${ctx.trigger}`,
      },
    ];
  }

  return [
    {
      title: (ctx) => `${titleCase(ctx.trigger)} Shock`,
      description: (ctx) => `A sudden shock around ${ctx.trigger} strains the system and undermines ${ctx.impact}.`,
      mechanism: (ctx) => `Disruption through ${ctx.trigger} and stress on ${ctx.impact}`,
    },
    {
      title: (ctx) => `${titleCase(ctx.impact)} Breakdown`,
      description: (ctx) => `A breakdown in ${ctx.impact} spreads from a weak point into the wider system.`,
      mechanism: (ctx) => `Fragility amplification in ${ctx.impact}`,
    },
    {
      title: (ctx) => `${titleCase(ctx.trigger)} Backlash`,
      description: (ctx) => `The system reacts against ${ctx.trigger}, and the backlash spills over into ${ctx.impact}.`,
      mechanism: (ctx) => `Adverse reaction loop through ${ctx.trigger}`,
    },
    {
      title: (ctx) => `${titleCase(ctx.impact)} Spiral`,
      description: (ctx) => `Negative feedback begins to compound, creating a downward spiral in ${ctx.impact}.`,
      mechanism: (ctx) => `Compounding deterioration in ${ctx.impact}`,
    },
    {
      title: (ctx) => `${titleCase(ctx.trigger)} Contagion`,
      description: (ctx) => `Instability from ${ctx.trigger} propagates outward and contaminates ${ctx.impact}.`,
      mechanism: (ctx) => `Propagation and spillover from ${ctx.trigger}`,
    },
  ];
}

function buildShockPoolForDomain({ prefix, sector, positiveImpacts, positiveTriggers, negativeImpacts, negativeTriggers, positiveThemes, negativeThemes }) {
  const positiveTemplates = makeTemplateSet(POSITIVE);
  const negativeTemplates = makeTemplateSet(NEGATIVE);

  const positive = Array.from({ length: 20 }, (_, index) => {
    const trigger = selectByCycle(positiveTriggers, index);
    const impact = selectByCycle(positiveImpacts, index);
    const theme = selectByCycle(positiveThemes, index);

    const ctx = {
      trigger,
      impact,
      sector,
      theme,
      institution: trigger,
      technology: trigger,
      agreement: trigger,
      initiative: trigger,
    };

    const template = positiveTemplates[index % positiveTemplates.length];
    const title = template.title(ctx);
    const description = template.description(ctx);
    const mechanism = template.mechanism(ctx);

    return makeShock({
      domainPrefix: prefix,
      polarity: POSITIVE,
      index,
      title,
      description,
      tags: buildTags([
        prefix,
        sector,
        theme,
        trigger,
        impact,
        "positive",
        "opportunity",
      ]),
      severity: selectByCycle(["low", "moderate", "high", "moderate"], index),
      probability: selectByCycle(["likely", "plausible", "possible", "likely"], index),
      duration: selectByCycle(["days", "weeks", "months", "quarters"], index),
      scope: selectByCycle(["local", "regional", "national", "global"], index),
      mechanism,
      leadingIndicators: buildLeadingIndicators(impact, index),
      countermeasures: ["Consolidate the gain", "Avoid overextension", "Lock in the positive feedback loop"],
    });
  });

  const negative = Array.from({ length: 20 }, (_, index) => {
    const trigger = selectByCycle(negativeTriggers, index);
    const impact = selectByCycle(negativeImpacts, index);
    const theme = selectByCycle(negativeThemes, index);

    const ctx = {
      trigger,
      impact,
      sector,
      theme,
      institution: trigger,
      technology: trigger,
      agreement: trigger,
      initiative: trigger,
    };

    const template = negativeTemplates[index % negativeTemplates.length];
    const title = template.title(ctx);
    const description = template.description(ctx);
    const mechanism = template.mechanism(ctx);

    return makeShock({
      domainPrefix: prefix,
      polarity: NEGATIVE,
      index,
      title,
      description,
      tags: buildTags([
        prefix,
        sector,
        theme,
        trigger,
        impact,
        "negative",
        "risk",
        "instability",
      ]),
      severity: selectByCycle(["moderate", "high", "critical", "high"], index),
      probability: selectByCycle(["possible", "plausible", "likely", "possible"], index),
      duration: selectByCycle(["days", "weeks", "months", "quarters"], index),
      scope: selectByCycle(["local", "regional", "national", "global"], index),
      mechanism,
      leadingIndicators: buildCountermeasures(impact, index),
      countermeasures: ["Contain damage early", "Increase redundancy", "Shorten response latency"],
    });
  });

  return { positive, negative };
}

const DOMAIN_DEFINITIONS = {
  societal: {
    prefix: "SOC",
    sector: "social cohesion and macro stability",
    positiveImpacts: [
      "public morale",
      "community trust",
      "civic engagement",
      "education access",
      "housing stability",
      "employment access",
      "public safety perception",
      "social mobility",
      "local organization",
      "digital literacy",
    ],
    positiveTriggers: [
      "civic renewal",
      "tax relief",
      "community grant",
      "housing expansion",
      "public transport",
      "mental health support",
      "youth leadership",
      "anti-corruption drive",
      "education funding",
      "neighborhood renewal",
    ],
    negativeImpacts: [
      "public trust",
      "urban stability",
      "community safety",
      "civil dialogue",
      "social cohesion",
      "public infrastructure",
      "health services",
      "food distribution",
      "family security",
      "employment access",
    ],
    negativeTriggers: [
      "public corruption",
      "riot escalation",
      "food shortage",
      "water contamination",
      "digital propaganda",
      "mass unemployment",
      "transport failure",
      "urban violence",
      "identity conflict",
      "social fragmentation",
    ],
    positiveThemes: ["policy", "institutional repair", "collective action", "coordination", "trust restoration"],
    negativeThemes: ["instability", "legitimacy loss", "polarization", "breakdown", "spillover"],
  },
  governance: {
    prefix: "GOV",
    sector: "policy, state, voting, courts",
    positiveImpacts: [
      "democratic participation",
      "public trust",
      "legislative efficiency",
      "tax allocation",
      "justice reform",
      "policy alignment",
      "election integrity",
      "infrastructure funding",
      "civil liberties",
      "regulatory clarity",
    ],
    positiveTriggers: [
      "bipartisan coalition",
      "digital audit",
      "election modernization",
      "transparency mandate",
      "budget surplus",
      "judicial reform",
      "constitutional amendment",
      "decentralization",
      "open data",
      "voter registration",
    ],
    negativeImpacts: [
      "democratic stability",
      "election integrity",
      "civil liberties",
      "institutional trust",
      "legislative output",
      "public services",
      "regulatory enforcement",
      "border security",
      "political discourse",
      "international alliances",
    ],
    negativeTriggers: [
      "coup d'etat",
      "gridlock protocol",
      "election fraud",
      "corruption scandal",
      "government shutdown",
      "authoritarian overreach",
      "budget deficit",
      "diplomatic crisis",
      "media censorship",
      "partisan violence",
    ],
    positiveThemes: ["reform", "legitimacy", "institutional repair", "policy delivery", "consensus"],
    negativeThemes: ["gridlock", "delegitimization", "overreach", "fragmentation", "crisis"],
  },
  security: {
    prefix: "SEC",
    sector: "cybersecurity, military, risk, defense",
    positiveImpacts: [
      "defensive readiness",
      "intelligence quality",
      "alliance support",
      "public confidence",
      "operational resilience",
      "deterrence credibility",
      "infrastructure security",
      "response speed",
      "containment ability",
      "threat visibility",
    ],
    positiveTriggers: [
      "hardened perimeter",
      "intelligence surge",
      "alliance coordination",
      "incident drills",
      "rapid patching",
      "watchlist update",
      "threat hunting",
      "risk mapping",
      "contingency rehearsal",
      "air-gap procedure",
    ],
    negativeImpacts: [
      "public anxiety",
      "escalation risk",
      "defensive readiness",
      "infrastructure security",
      "deterrence credibility",
      "response speed",
      "situational awareness",
      "alliance support",
      "threat visibility",
      "operational resilience",
    ],
    negativeTriggers: [
      "zero-day breach",
      "cross-border incident",
      "misread signal",
      "failed deterrence",
      "command confusion",
      "satellite outage",
      "supply sabotage",
      "system penetration",
      "insider leak",
      "escalation spiral",
    ],
    positiveThemes: ["deterrence", "containment", "readiness", "coordination", "surveillance"],
    negativeThemes: ["escalation", "miscalculation", "penetration", "confusion", "vulnerability"],
  },
  capital: {
    prefix: "CAP",
    sector: "liquidity, assets, wealth, banking",
    positiveImpacts: [
      "liquidity",
      "solvency",
      "credit availability",
      "market confidence",
      "asset prices",
      "capital formation",
      "consumer confidence",
      "balance-sheet health",
      "funding runway",
      "investment capacity",
    ],
    positiveTriggers: [
      "liquidity injection",
      "credit reform",
      "deleveraging",
      "portfolio rebalancing",
      "capital inflow",
      "reserve release",
      "rates stabilization",
      "balance sheet repair",
      "funding round",
      "banking normalization",
    ],
    negativeImpacts: [
      "liquidity",
      "solvency",
      "credit availability",
      "market confidence",
      "asset prices",
      "capital reserves",
      "banking stability",
      "consumer confidence",
      "trade financing",
      "funding runway",
    ],
    negativeTriggers: [
      "bank run",
      "debt default",
      "liquidity freeze",
      "credit crunch",
      "market panic",
      "asset drawdown",
      "risk-off shock",
      "spread widening",
      "capital flight",
      "funding gap",
    ],
    positiveThemes: ["stability", "allocation", "liquidity", "confidence", "balance-sheet repair"],
    negativeThemes: ["panic", "contagion", "contraction", "fragility", "stress"],
  },
  labor: {
    prefix: "LAB",
    sector: "unions, workers, jobs, salaries",
    positiveImpacts: [
      "retention",
      "morale",
      "bargaining power",
      "wage pressure",
      "hiring capacity",
      "workflow stability",
      "scheduling quality",
      "worker confidence",
      "talent supply",
      "industrial peace",
    ],
    positiveTriggers: [
      "wage settlement",
      "workforce redesign",
      "benefits upgrade",
      "union recognition",
      "training initiative",
      "better scheduling",
      "safety investment",
      "career ladder",
      "management reset",
      "retention bonus",
    ],
    negativeImpacts: [
      "retention",
      "morale",
      "hiring friction",
      "bargaining power",
      "workforce stability",
      "absence rate",
      "operational continuity",
      "talent supply",
      "shift coverage",
      "industrial peace",
    ],
    negativeTriggers: [
      "strike notice",
      "headcount cut",
      "wage freeze",
      "mandated return",
      "benefits rollback",
      "manager turnover",
      "scheduling chaos",
      "labor dispute",
      "automation shock",
      "union backlash",
    ],
    positiveThemes: ["compromise", "productivity", "retention", "fairness", "workforce alignment"],
    negativeThemes: ["conflict", "attrition", "disruption", "fatigue", "disempowerment"],
  },
  consumption: {
    prefix: "CON",
    sector: "retail, shopping, luxury, spending",
    positiveImpacts: [
      "demand strength",
      "brand loyalty",
      "discretionary spending",
      "channel reach",
      "inventory depth",
      "conversion rate",
      "basket size",
      "repeat purchase",
      "consumer confidence",
      "market share",
    ],
    positiveTriggers: [
      "product launch",
      "promo cycle",
      "premium reposition",
      "distribution expansion",
      "inventory refresh",
      "loyalty program",
      "bundle release",
      "seasonal campaign",
      "channel partnership",
      "merchandising update",
    ],
    negativeImpacts: [
      "demand strength",
      "brand loyalty",
      "discretionary spending",
      "channel reach",
      "inventory depth",
      "conversion rate",
      "basket size",
      "repeat purchase",
      "consumer confidence",
      "market share",
    ],
    negativeTriggers: [
      "price shock",
      "stockout wave",
      "promo fatigue",
      "channel loss",
      "quality recall",
      "competitor surge",
      "cash squeeze",
      "logistics snag",
      "brand backlash",
      "demand collapse",
    ],
    positiveThemes: ["growth", "conversion", "distribution", "retail momentum", "loyalty"],
    negativeThemes: ["demand shock", "competition", "friction", "recall", "backlash"],
  },
  productivity: {
    prefix: "PRD",
    sector: "habits, time management, daily schedules",
    positiveImpacts: [
      "focus quality",
      "workflow efficiency",
      "habit stability",
      "tool fit",
      "execution speed",
      "time protection",
      "task completion",
      "energy management",
      "attention span",
      "schedule integrity",
    ],
    positiveTriggers: [
      "routine redesign",
      "focus sprint",
      "tool upgrade",
      "calendar reset",
      "deep work block",
      "time audit",
      "boundary setting",
      "habit stacking",
      "workflow cleanup",
      "sleep recovery",
    ],
    negativeImpacts: [
      "focus quality",
      "workflow efficiency",
      "habit stability",
      "tool fit",
      "time leakage",
      "burnout risk",
      "schedule integrity",
      "task completion",
      "attention span",
      "energy management",
    ],
    negativeTriggers: [
      "context switching",
      "notification storm",
      "deadline pileup",
      "sleep debt",
      "calendar overload",
      "tool fragmentation",
      "unexpected interruption",
      "scope creep",
      "fatigue wave",
      "priority confusion",
    ],
    positiveThemes: ["focus", "routine", "execution", "recovery", "flow"],
    negativeThemes: ["friction", "overload", "fatigue", "distraction", "entropy"],
  },
  technology: {
    prefix: "TEC",
    sector: "software, AI, developers, cloud",
    positiveImpacts: [
      "adoption rate",
      "model quality",
      "infra resilience",
      "developer velocity",
      "security posture",
      "user trust",
      "automation depth",
      "product stability",
      "release cadence",
      "scalability",
    ],
    positiveTriggers: [
      "platform upgrade",
      "model rollout",
      "security patch",
      "refactor sprint",
      "infra expansion",
      "api standardization",
      "developer tooling",
      "feature flagging",
      "automation pipeline",
      "architecture cleanup",
    ],
    negativeImpacts: [
      "technical debt",
      "infra resilience",
      "developer velocity",
      "adoption rate",
      "compliance burden",
      "user trust",
      "release cadence",
      "product stability",
      "security posture",
      "scalability",
    ],
    negativeTriggers: [
      "outage",
      "zero-day",
      "migration failure",
      "model drift",
      "release rollback",
      "build break",
      "cloud cost spike",
      "bug cascade",
      "data loss",
      "vendor lock-in",
    ],
    positiveThemes: ["deployment", "scaling", "trust", "automation", "engineering"],
    negativeThemes: ["failure", "drift", "debt", "breach", "rollback"],
  },
  environment: {
    prefix: "ENV",
    sector: "climate, resources, energy, conservation",
    positiveImpacts: [
      "energy transition",
      "ecosystem health",
      "resource abundance",
      "regulatory pressure",
      "adaptation capacity",
      "local resilience",
      "air quality",
      "water quality",
      "land stewardship",
      "carbon pressure reduction",
    ],
    positiveTriggers: [
      "clean energy buildout",
      "conservation grant",
      "reforestation push",
      "emissions standard",
      "grid modernization",
      "adaptation funding",
      "wildfire prep",
      "water cleanup",
      "efficiency retrofits",
      "climate accord",
    ],
    negativeImpacts: [
      "climate risk",
      "carbon pressure",
      "ecosystem health",
      "resource abundance",
      "local resilience",
      "water quality",
      "air quality",
      "land stewardship",
      "adaptation capacity",
      "regulatory pressure",
    ],
    negativeTriggers: [
      "heat wave",
      "flood damage",
      "wildfire season",
      "drought spiral",
      "resource extraction",
      "pollution spike",
      "grid failure",
      "species loss",
      "storm surge",
      "cleanup delay",
    ],
    positiveThemes: ["decarbonization", "adaptation", "conservation", "resilience", "stewardship"],
    negativeThemes: ["loss", "stress", "exposure", "depletion", "damage"],
  },
  knowledge: {
    prefix: "KNW",
    sector: "research, academia, data, history",
    positiveImpacts: [
      "research quality",
      "evidence strength",
      "replication rate",
      "publication velocity",
      "access",
      "credibility",
      "open data use",
      "methodological rigor",
      "knowledge diffusion",
      "institutional memory",
    ],
    positiveTriggers: [
      "open dataset",
      "peer review",
      "replication push",
      "archive release",
      "research grant",
      "method standard",
      "data cleanup",
      "citations drive",
      "access reform",
      "publication sprint",
    ],
    negativeImpacts: [
      "research quality",
      "evidence strength",
      "replication rate",
      "publication velocity",
      "access",
      "credibility",
      "open data use",
      "methodological rigor",
      "knowledge diffusion",
      "institutional memory",
    ],
    negativeTriggers: [
      "fraud finding",
      "data loss",
      "replication failure",
      "paper retraction",
      "access lockout",
      "method scandal",
      "archive damage",
      "citation collapse",
      "peer review failure",
      "research freeze",
    ],
    positiveThemes: ["rigor", "transparency", "sharing", "quality", "credibility"],
    negativeThemes: ["fraud", "loss", "retraction", "lockout", "collapse"],
  },
  media: {
    prefix: "MED",
    sector: "news, journalism, broadcasting, platforms",
    positiveImpacts: [
      "reach",
      "trust",
      "engagement",
      "narrative control",
      "distribution breadth",
      "audience retention",
      "message clarity",
      "platform health",
      "advertiser confidence",
      "shareability",
    ],
    positiveTriggers: [
      "exclusive scoop",
      "fact-checking push",
      "platform boost",
      "creator partnership",
      "editorial reset",
      "audience survey",
      "distribution deal",
      "trust campaign",
      "moderation update",
      "network expansion",
    ],
    negativeImpacts: [
      "reach",
      "trust",
      "engagement",
      "narrative control",
      "distribution breadth",
      "audience retention",
      "message clarity",
      "platform health",
      "advertiser confidence",
      "shareability",
    ],
    negativeTriggers: [
      "misinformation burst",
      "platform ban",
      "trust scandal",
      "ad boycott",
      "algorithm shift",
      "editorial leak",
      "rage cycle",
      "moderation collapse",
      "network outage",
      "brand backlash",
    ],
    positiveThemes: ["distribution", "trust", "clarity", "audience", "influence"],
    negativeThemes: ["scandal", "ban", "boycott", "confusion", "decline"],
  },
  education: {
    prefix: "EDU",
    sector: "schools, learning, students, teachers",
    positiveImpacts: [
      "learning outcomes",
      "teacher capacity",
      "curriculum fit",
      "attendance",
      "student motivation",
      "cost burden",
      "discipline",
      "graduation rate",
      "literacy",
      "numeracy",
    ],
    positiveTriggers: [
      "curriculum revision",
      "teacher training",
      "tutoring drive",
      "assessment reform",
      "attendance initiative",
      "digital classroom",
      "scholarship program",
      "class size reduction",
      "parent outreach",
      "learning support",
    ],
    negativeImpacts: [
      "learning outcomes",
      "teacher capacity",
      "curriculum fit",
      "attendance",
      "student motivation",
      "cost burden",
      "discipline",
      "graduation rate",
      "literacy",
      "numeracy",
    ],
    negativeTriggers: [
      "teacher strike",
      "funding cut",
      "curriculum backlash",
      "attendance slump",
      "testing scandal",
      "school closure",
      "resource shortage",
      "discipline crisis",
      "dropout spike",
      "admin turnover",
    ],
    positiveThemes: ["learning", "instruction", "access", "support", "achievement"],
    negativeThemes: ["disruption", "shortage", "fatigue", "dropout", "strain"],
  },
  culture: {
    prefix: "CUL",
    sector: "art, heritage, identity, slang",
    positiveImpacts: [
      "identity alignment",
      "trend velocity",
      "prestige",
      "authenticity",
      "creator support",
      "cultural memory",
      "symbolic power",
      "audience connection",
      "cross-over appeal",
      "taste leadership",
    ],
    positiveTriggers: [
      "art revival",
      "heritage campaign",
      "creator sponsorship",
      "festival launch",
      "museum feature",
      "community showcase",
      "viral moment",
      "fashion crossover",
      "music drop",
      "cultural exchange",
    ],
    negativeImpacts: [
      "identity alignment",
      "trend velocity",
      "prestige",
      "authenticity",
      "creator support",
      "cultural memory",
      "symbolic power",
      "audience connection",
      "cross-over appeal",
      "taste leadership",
    ],
    negativeTriggers: [
      "culture war",
      "authenticity scandal",
      "heritage loss",
      "creator backlash",
      "misappropriation",
      "trend collapse",
      "taste fatigue",
      "prestige decline",
      "symbolic rupture",
      "platform mockery",
    ],
    positiveThemes: ["expression", "memory", "authenticity", "status", "community"],
    negativeThemes: ["war", "loss", "decline", "mockery", "rupture"],
  },
  community: {
    prefix: "COM",
    sector: "neighborhood, charity, spiritual, family",
    positiveImpacts: [
      "cohesion",
      "volunteer capacity",
      "mutual aid",
      "safety",
      "local trust",
      "participation",
      "belonging",
      "civic pride",
      "neighbor support",
      "resilience",
    ],
    positiveTriggers: [
      "mutual aid drive",
      "volunteer day",
      "safety patrol",
      "block party",
      "conflict mediation",
      "charity match",
      "community garden",
      "faith outreach",
      "neighborhood watch",
      "school fundraiser",
    ],
    negativeImpacts: [
      "cohesion",
      "volunteer capacity",
      "mutual aid",
      "safety",
      "local trust",
      "participation",
      "belonging",
      "civic pride",
      "neighbor support",
      "resilience",
    ],
    negativeTriggers: [
      "community conflict",
      "safety scare",
      "volunteer burnout",
      "charity scandal",
      "neighborhood dispute",
      "property damage",
      "trust breach",
      "service gap",
      "fear spiral",
      "isolation wave",
    ],
    positiveThemes: ["support", "trust", "belonging", "resilience", "participation"],
    negativeThemes: ["fear", "burnout", "isolation", "breach", "conflict"],
  },
  health: {
    prefix: "HLT",
    sector: "food, workouts, longevity, medical choices",
    positiveImpacts: [
      "access",
      "care quality",
      "prevention rate",
      "workforce capacity",
      "trust",
      "recovery speed",
      "wellness",
      "treatment adherence",
      "screening coverage",
      "cost pressure reduction",
    ],
    positiveTriggers: [
      "telehealth expansion",
      "preventive campaign",
      "workforce training",
      "protocol update",
      "coverage expansion",
      "nutrition reform",
      "care coordination",
      "screening push",
      "exercise initiative",
      "medical innovation",
    ],
    negativeImpacts: [
      "access",
      "care quality",
      "prevention rate",
      "workforce capacity",
      "trust",
      "recovery speed",
      "wellness",
      "treatment adherence",
      "screening coverage",
      "cost pressure",
    ],
    negativeTriggers: [
      "clinic closure",
      "staff shortage",
      "hospital overload",
      "care denial",
      "drug recall",
      "insurance squeeze",
      "diagnostic delay",
      "treatment gap",
      "outbreak wave",
      "compliance scandal",
    ],
    positiveThemes: ["care", "prevention", "trust", "capacity", "recovery"],
    negativeThemes: ["shortage", "delay", "overload", "recall", "scandal"],
  },
  business: {
    prefix: "BUS",
    sector: "corporate strategy, startups, hiring, marketing",
    positiveImpacts: [
      "demand",
      "execution quality",
      "capital access",
      "talent quality",
      "brand strength",
      "margin pressure reduction",
      "sales conversion",
      "growth runway",
      "customer retention",
      "operating leverage",
    ],
    positiveTriggers: [
      "product launch",
      "capital raise",
      "talent hire",
      "sales push",
      "brand refresh",
      "process redesign",
      "partnership deal",
      "market expansion",
      "pricing upgrade",
      "strategy reset",
    ],
    negativeImpacts: [
      "demand",
      "execution quality",
      "capital access",
      "talent quality",
      "brand strength",
      "margin pressure",
      "sales conversion",
      "growth runway",
      "customer retention",
      "operating leverage",
    ],
    negativeTriggers: [
      "growth stall",
      "talent loss",
      "pricing war",
      "cash crunch",
      "brand backlash",
      "product failure",
      "sales miss",
      "partner exit",
      "margin compression",
      "strategy drift",
    ],
    positiveThemes: ["growth", "execution", "capital", "team", "brand"],
    negativeThemes: ["stall", "loss", "backlash", "crunch", "drift"],
  },
  finance: {
    prefix: "FIN",
    sector: "investments, housing, stocks, budgeting",
    positiveImpacts: [
      "liquidity",
      "solvency",
      "risk sentiment",
      "asset prices",
      "credit spread",
      "portfolio health",
      "consumer confidence",
      "cash buffer",
      "market confidence",
      "funding access",
    ],
    positiveTriggers: [
      "liquidity injection",
      "portfolio rebalance",
      "hedge program",
      "deleveraging",
      "reserve release",
      "credit reform",
      "rates stabilization",
      "income uplift",
      "capital inflow",
      "balance sheet repair",
    ],
    negativeImpacts: [
      "liquidity",
      "solvency",
      "risk sentiment",
      "asset prices",
      "credit spread",
      "portfolio health",
      "consumer confidence",
      "cash buffer",
      "market confidence",
      "funding access",
    ],
    negativeTriggers: [
      "bank run",
      "debt default",
      "credit crunch",
      "market panic",
      "asset drawdown",
      "liquidity freeze",
      "spread widening",
      "capital flight",
      "mortgage shock",
      "valuation reset",
    ],
    positiveThemes: ["stability", "allocation", "liquidity", "risk control", "confidence"],
    negativeThemes: ["panic", "contagion", "contraction", "drawdown", "stress"],
  },
  relationship: {
    prefix: "REL",
    sector: "family, dating, marriage, social conflict",
    positiveImpacts: [
      "attachment strength",
      "communication quality",
      "trust",
      "life alignment",
      "support density",
      "conflict intensity reduction",
      "shared plans",
      "emotional safety",
      "repair capacity",
      "mutual care",
    ],
    positiveTriggers: [
      "honest conversation",
      "boundary setting",
      "counseling session",
      "shared ritual",
      "apology cycle",
      "recommitment",
      "quality time",
      "support check-in",
      "repair attempt",
      "future planning",
    ],
    negativeImpacts: [
      "attachment strength",
      "communication quality",
      "trust",
      "life alignment",
      "support density",
      "conflict intensity",
      "shared plans",
      "emotional safety",
      "repair capacity",
      "mutual care",
    ],
    negativeTriggers: [
      "argument spiral",
      "silent treatment",
      "boundary breach",
      "trust rupture",
      "misalignment",
      "withdrawal cycle",
      "neglect pattern",
      "resentment buildup",
      "counseling refusal",
      "breakup signal",
    ],
    positiveThemes: ["repair", "trust", "communication", "alignment", "care"],
    negativeThemes: ["rupture", "withdrawal", "misalignment", "resentment", "distance"],
  },
  creative: {
    prefix: "CRE",
    sector: "content creation, art, branding, writing",
    positiveImpacts: [
      "originality",
      "production speed",
      "audience fit",
      "brand consistency",
      "collaboration quality",
      "creative confidence",
      "distribution reach",
      "story clarity",
      "portfolio strength",
      "momentum",
    ],
    positiveTriggers: [
      "ship artifact",
      "editorial sprint",
      "brand refresh",
      "collaboration boost",
      "audience test",
      "story revision",
      "creative retreat",
      "portfolio release",
      "style guide",
      "campaign launch",
    ],
    negativeImpacts: [
      "originality",
      "production speed",
      "audience fit",
      "brand consistency",
      "collaboration quality",
      "creative confidence",
      "distribution reach",
      "story clarity",
      "portfolio strength",
      "momentum",
    ],
    negativeTriggers: [
      "creative block",
      "brand confusion",
      "deadline slip",
      "audience backlash",
      "collaboration friction",
      "platform loss",
      "quality drift",
      "burnout cycle",
      "revision spiral",
      "release delay",
    ],
    positiveThemes: ["creation", "voice", "momentum", "identity", "audience"],
    negativeThemes: ["block", "confusion", "backlash", "drift", "delay"],
  },
  career: {
    prefix: "CAR",
    sector: "job changes, promotions, university majors",
    positiveImpacts: [
      "marketability",
      "role fit",
      "compensation",
      "growth opportunity",
      "network strength",
      "job security",
      "promotion odds",
      "skill leverage",
      "optional paths",
      "confidence",
    ],
    positiveTriggers: [
      "internal application",
      "skill upgrade",
      "offer negotiation",
      "network expansion",
      "role switch",
      "promotion cycle",
      "mentor match",
      "portfolio win",
      "resume refresh",
      "major change",
    ],
    negativeImpacts: [
      "marketability",
      "role fit",
      "compensation",
      "growth opportunity",
      "network strength",
      "job security",
      "promotion odds",
      "skill leverage",
      "optional paths",
      "confidence",
    ],
    negativeTriggers: [
      "layoff wave",
      "promotion freeze",
      "skill mismatch",
      "interview loss",
      "network decay",
      "role stagnation",
      "credential mismatch",
      "compensation squeeze",
      "career drift",
      "offer collapse",
    ],
    positiveThemes: ["mobility", "growth", "optionality", "marketability", "progress"],
    negativeThemes: ["stagnation", "loss", "mismatch", "freeze", "drift"],
  },
  entertainment: {
    prefix: "ENT",
    sector: "movies, music, games, media, shows",
    positiveImpacts: [
      "audience interest",
      "production value",
      "monetization",
      "franchise strength",
      "platform distribution",
      "fandom loyalty",
      "buzz velocity",
      "creator momentum",
      "merch potential",
      "repeat consumption",
    ],
    positiveTriggers: [
      "greenlight",
      "distribution boost",
      "franchise extension",
      "review cycle",
      "fan event",
      "premiere push",
      "platform deal",
      "marketing burst",
      "merch drop",
      "release window",
    ],
    negativeImpacts: [
      "audience interest",
      "production value",
      "monetization",
      "franchise strength",
      "platform distribution",
      "fandom loyalty",
      "buzz velocity",
      "creator momentum",
      "merch potential",
      "repeat consumption",
    ],
    negativeTriggers: [
      "backlash wave",
      "release delay",
      "fan fatigue",
      "platform drop",
      "review bombing",
      "budget overrun",
      "franchise exhaustion",
      "creator dispute",
      "distribution loss",
      "quality collapse",
    ],
    positiveThemes: ["reach", "fandom", "distribution", "momentum", "monetization"],
    negativeThemes: ["fatigue", "backlash", "delay", "overrun", "collapse"],
  },
};

function buildRegistry() {
  const registry = {};

  for (const [domain, spec] of Object.entries(DOMAIN_DEFINITIONS)) {
    registry[domain] = buildShockPoolForDomain(spec);
  }

  // Provide a robust fallback domain for mixed or unknown contexts.
  registry.common = buildShockPoolForDomain({
    prefix: "COM",
    sector: "mixed domain baseline",
    positiveImpacts: [
      "coordination quality",
      "public support",
      "execution speed",
      "institutional trust",
      "optionality",
      "resilience",
      "signal clarity",
      "risk containment",
      "adaptive capacity",
      "stability",
    ],
    positiveTriggers: [
      "alignment push",
      "coordination update",
      "stability measure",
      "trust repair",
      "process simplification",
      "decision clarity",
      "capacity add",
      "early win",
      "feedback loop",
      "operating reset",
    ],
    negativeImpacts: [
      "coordination quality",
      "public support",
      "execution speed",
      "institutional trust",
      "optionality",
      "resilience",
      "signal clarity",
      "risk containment",
      "adaptive capacity",
      "stability",
    ],
    negativeTriggers: [
      "misalignment",
      "trust fracture",
      "coordination failure",
      "signal confusion",
      "overload",
      "delay spiral",
      "containment breach",
      "uncertainty spike",
      "friction increase",
      "stability loss",
    ],
    positiveThemes: ["baseline", "coordination", "trust", "adaptation", "stability"],
    negativeThemes: ["confusion", "breach", "delay", "friction", "loss"],
  });

  return registry;
}

export const SHOCK_REGISTRY = buildRegistry();

const DOMAIN_ALIAS_MAP = {
  common: "common",
  commons: "common",
  general: "common",
  mixed: "common",
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
  labor: "labor",
  work: "labor",
  workforce: "labor",
  employment: "labor",
  consumption: "consumption",
  consumer: "consumption",
  retail: "consumption",
  productivity: "productivity",
  habits: "productivity",
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
  education: "education",
  school: "education",
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
  creative: "creative",
  career: "career",
  relationship: "relationship",
  entertainment: "entertainment",
};

function resolveDomainKey(domain = "common") {
  const normalized = String(domain ?? "common").trim().toLowerCase();
  if (DOMAIN_ALIAS_MAP[normalized] && SHOCK_REGISTRY[DOMAIN_ALIAS_MAP[normalized]]) {
    return DOMAIN_ALIAS_MAP[normalized];
  }

  if (SHOCK_REGISTRY[normalized]) {
    return normalized;
  }

  const compact = normalized.replace(/[\s_\-]/g, "");
  for (const key of Object.keys(SHOCK_REGISTRY)) {
    if (key.replace(/[\s_\-]/g, "") === compact) {
      return key;
    }
  }

  return "common";
}

function normalizePreviousShockIds(previousShocks = []) {
  const ids = new Set();

  if (!Array.isArray(previousShocks)) {
    const single = normalizeShockId(previousShocks);
    if (single) ids.add(single);
    return ids;
  }

  for (const entry of previousShocks) {
    const id = normalizeShockId(entry);
    if (id) ids.add(id);
  }

  return ids;
}

function flattenPool(domainKey, polarity) {
  const domainEntry = SHOCK_REGISTRY[domainKey] || SHOCK_REGISTRY.common;
  if (!domainEntry) return [];

  if (polarity === POSITIVE) return Array.isArray(domainEntry.positive) ? domainEntry.positive : [];
  if (polarity === NEGATIVE) return Array.isArray(domainEntry.negative) ? domainEntry.negative : [];

  return [
    ...(Array.isArray(domainEntry.positive) ? domainEntry.positive : []),
    ...(Array.isArray(domainEntry.negative) ? domainEntry.negative : []),
  ];
}

function selectWeightedShock(pool) {
  if (!Array.isArray(pool) || pool.length === 0) return null;

  const weighted = pool.map((shock) => {
    const severityWeight = weightFromSeverityLabel(shock.severity);
    const probabilityWeight = weightFromProbabilityLabel(shock.probability);
    const scopeWeight =
      String(shock.scope).toLowerCase() === "global"
        ? 1.2
        : String(shock.scope).toLowerCase() === "national"
          ? 1.1
          : 1.0;
    const durationWeight =
      String(shock.duration).toLowerCase() === "years"
        ? 0.9
        : String(shock.duration).toLowerCase() === "quarters"
          ? 1.05
          : 1.0;

    return {
      shock,
      weight: Math.max(0.0001, severityWeight * probabilityWeight * scopeWeight * durationWeight),
    };
  });

  const totalWeight = weighted.reduce((acc, item) => acc + item.weight, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  let roll = Math.random() * totalWeight;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) {
      return item.shock;
    }
  }

  return weighted[weighted.length - 1].shock;
}

function filterPoolByPreviousShocks(pool, previousShocks) {
  const previousIds = normalizePreviousShockIds(previousShocks);
  if (previousIds.size === 0) return pool;

  return pool.filter((shock) => !previousIds.has(shock.id));
}

/**
 * Returns the shocks for a given domain.
 */
export function getDomainShocks(domain) {
  const domainKey = resolveDomainKey(domain);
  const entry = SHOCK_REGISTRY[domainKey] || null;
  return entry ? deepClone(entry) : null;
}

/**
 * Returns all positive shocks across all domains.
 */
export function getAllPositiveShocks() {
  return Object.values(SHOCK_REGISTRY).flatMap((domain) => deepClone(domain.positive || []));
}

/**
 * Returns all negative shocks across all domains.
 */
export function getAllNegativeShocks() {
  return Object.values(SHOCK_REGISTRY).flatMap((domain) => deepClone(domain.negative || []));
}

/**
 * Finds shocks by tag across all domains.
 */
export function findShocksByTag(tag) {
  const normalizedTag = String(tag ?? "").trim().toLowerCase();
  if (!normalizedTag) return [];

  return Object.values(SHOCK_REGISTRY)
    .flatMap((domain) => [...(domain.positive || []), ...(domain.negative || [])])
    .filter((shock) =>
      Array.isArray(shock.tags) &&
      shock.tags.some((t) => String(t).toLowerCase().includes(normalizedTag))
    )
    .map((shock) => deepClone(shock));
}

/**
 * Returns a weighted random shock suitable for the target domain.
 * The selection is biased by severity, plausibility, duration, and scope.
 */
export function getRandomShock({ domain, polarity, previousShocks = [] } = {}) {
  const domainKey = resolveDomainKey(domain);
  let pool = flattenPool(domainKey, polarity);
  pool = filterPoolByPreviousShocks(pool, previousShocks);

  if (pool.length === 0) {
    return {
      id: "FALLBACK_01",
      title: "Quiet Iteration",
      description: "No high-salience shock occurred this cycle.",
      justification: "Exhausted dictionary or no relevant shocks found.",
    };
  }

  const selected = selectWeightedShock(pool);
  return selected ? deepClone(selected) : deepClone(pool[0]);
}
