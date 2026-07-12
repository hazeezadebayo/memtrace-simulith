/* ==================================================================
   simulith/src/manifest.js
   Central Source of Truth for MemTrace Domains, Archetypes, and Branches
   ================================================================== */

// ---------------------------------------------------------------------------
// DOMAINS — Unified domain registry.
// Each key is the canonical lowercase domain name.
// Adding a new domain here is the ONLY change needed across the whole project.
// ---------------------------------------------------------------------------
export const DOMAINS = {
  governance: { label: 'Governance', description: 'Policy, state, voting, courts.', prefix: 'Enact Policy', factionWeights: { Regulators: 2.5, Politicians: 2.2, Legal: 1.8, Citizens: 1.0, NGOs: 1.2, Corporates: 1.5, Activists: 1.5, Media: 1.5 } },
  security: { label: 'Security', description: 'Cybersecurity, military, risk, defense.', prefix: 'Deploy Defenses', factionWeights: { Regulators: 2.5, Geopolitics: 2.2, Politicians: 1.8, Legal: 1.5, Citizens: 1.0, Techies: 1.5 } },
  capital: { label: 'Capital', description: 'Liquidity, assets, wealth, banking.', prefix: 'Allocate Funds', factionWeights: { Investors: 2.5, Financials: 2.2, Analysts: 2.0, Speculators: 1.5, Property: 1.5, Corporates: 1.5, Consumers: 0.8 } },
  labor: { label: 'Labor', description: 'Unions, workers, jobs, salaries.', prefix: 'Restructure Workforce', factionWeights: { Labor: 2.5, Corporates: 2.0, Regulators: 1.5, Founders: 1.5, Consumers: 0.8, Operations: 1.8 } },
  consumption: { label: 'Consumption', description: 'Retail, shopping, luxury, spending.', prefix: 'Launch Product', factionWeights: { Consumers: 2.5, Corporates: 2.0, Sales: 1.8, Marketing: 1.5, Investors: 1.0 } },
  productivity: { label: 'Productivity', description: 'Habits, time management, daily schedules.', prefix: 'Upgrade Systems', factionWeights: { Planners: 2.5, Product: 2.0, Operations: 1.8, Techies: 1.5, Founders: 1.5 } },
  technology: { label: 'Technology', description: 'Software, AI, developers, cloud.', prefix: 'Adopt Tech Stack', factionWeights: { Techies: 2.5, Investors: 2.0, Academics: 1.8, Corporates: 1.5, Legal: 1.2, Planners: 1.5 } },
  environment: { label: 'Environment', description: 'Climate, resources, energy, conservation.', prefix: 'Shift Location', factionWeights: { Activists: 2.5, Regulators: 2.2, NGOs: 1.8, Geopolitics: 1.5, Corporates: 1.0, Citizens: 1.0 } },
  knowledge: { label: 'Knowledge', description: 'Research, academia, data, history.', prefix: 'Publish Research', factionWeights: { Academics: 2.5, Media: 2.0, NGOs: 1.5, Regulators: 1.2, Techies: 1.0 } },
  media: { label: 'Media', description: 'News, journalism, broadcasting, platforms.', prefix: 'Broadcast Campaign', factionWeights: { Media: 2.5, Marketing: 2.0, Politicians: 1.8, Consumers: 1.0, Regulators: 1.2, Activists: 1.5 } },
  education: { label: 'Education', description: 'Schools, learning, students, teachers.', prefix: 'Revise Curriculum', factionWeights: { Teachers: 2.5, Administrators: 2.0, Academics: 1.8, Regulators: 1.2, Students: 0.8, Citizens: 1.0 } },
  culture: { label: 'Culture', description: 'Art, heritage, identity, slang.', prefix: 'Shift Paradigm', factionWeights: { Artists: 2.5, Critics: 2.0, Media: 1.5, Consumers: 1.2, Marketing: 1.0 } },
  community: { label: 'Community', description: 'Neighborhood, charity, spiritual, family.', prefix: 'Mobilize Base', factionWeights: { Organizers: 2.5, Elders: 2.0, Neighbors: 1.8, NGOs: 1.5, Citizens: 1.2 } },
  health: { label: 'Health', description: 'Food, workouts, longevity, medical choices.', prefix: 'Intervene Medically', factionWeights: { Doctors: 2.5, Biohackers: 1.8, Regulators: 1.8, Legal: 1.2, Consumers: 0.8, Support: 1.0 } },
  societal: { label: 'Societal', description: 'Politics, macroeconomics, laws, public crises.', prefix: 'Drive Movement', factionWeights: { Regulators: 2.5, Corporates: 2.0, Activists: 1.8, Consumers: 0.8, Financials: 1.5, Techies: 1.2, Media: 1.5, Citizens: 1.0, Labor: 1.2, Geopolitics: 1.8, Academics: 1.5, Planners: 1.5, Politicians: 2.2, NGOs: 1.5 } },
  business: { label: 'Business', description: 'Corporate strategy, startups, hiring, marketing.', prefix: 'Execute Strategy', factionWeights: { Investors: 2.5, Corporates: 2.0, Operations: 1.5, Support: 0.5, Legal: 1.5, Product: 2.0, Founders: 2.2, Marketing: 1.0, Sales: 1.2 } },
  finance: { label: 'Finance', description: 'Investments, housing, stocks, frugal budgeting.', prefix: 'Hedge Portfolio', factionWeights: { Investors: 2.5, Speculators: 2.0, Property: 1.5, Consumers: 0.8, Analysts: 2.0, Legal: 1.2 } },
  relationship: { label: 'Relationship', description: 'Family, dating, marriage, social conflict.', prefix: 'Commit Deeply', factionWeights: { Advisors: 2.5, Optimists: 1.8, Skeptics: 1.2 } },
  creative: { label: 'Creative', description: 'Content creation, art, branding, writing.', prefix: 'Ship Artifact', factionWeights: { Creators: 2.5, Marketing: 1.8, Consumers: 0.8 } },
  career: { label: 'Career', description: 'Job changes, promotions, university majors.', prefix: 'Make the Move', factionWeights: { Advisors: 2.2, Corporates: 2.0, Labor: 1.5 } },
  entertainment: { label: 'Entertainment', description: 'Entertainment, movies, music, games, media, shows.', prefix: 'Produce Show', factionWeights: { Creators: 2.5, Media: 2.0, Consumers: 1.5, Marketing: 1.2 } },
};

// --- Derived legacy exports — all importers continue to work unchanged ---
export const CANONICAL_DOMAINS = Object.keys(DOMAINS);
export const DOMAIN_DESCRIPTIONS = Object.fromEntries(
  Object.entries(DOMAINS).map(([k, v]) => [k.toUpperCase(), v.description])
);
export const DOMAIN_POWER_MULTIPLIERS = Object.fromEntries(
  Object.entries(DOMAINS).map(([k, v]) => [k.toUpperCase(), v.factionWeights])
);
// TECH is kept as a backward-compat alias for TECHNOLOGY
DOMAIN_DESCRIPTIONS.TECH = DOMAINS.technology.description;
DOMAIN_POWER_MULTIPLIERS.TECH = DOMAINS.technology.factionWeights;
// CONSUMER alias for CONSUMPTION
DOMAIN_DESCRIPTIONS.CONSUMER = DOMAINS.consumption.description;
DOMAIN_POWER_MULTIPLIERS.CONSUMER = DOMAINS.consumption.factionWeights;

export const VALID_DOMAINS = [
  ...CANONICAL_DOMAINS.map(d => d.toUpperCase()),
  'TECH', 'CONSUMER' // backward-compat aliases
];

// --- 5 Fallback / Pseudo-Archetypes (Appended to make exactly 20 archetypes per domain) ---
export const PSEUDO_ARCHETYPES = [
  {
    "name": "StudentMale",
    "backstory": "A regular male student focused on studies, gaming, and socializing. Easily swayed by online trends.",
    "faction": "Public",
    "riskBias": 0.6,
    "evidenceDemand": 0.4,
    "clarityNeed": 0.5,
    "noveltySeek": 0.8,
    "financialStake": 0.1,
    "memoryDecay": 0.4,
    "platform": "discord",
    "age": 20,
    "gender": "Male",
    "pseudoName": "@gaming_student_9",
    "region": "United States"
  },
  {
    "name": "StudentFemale",
    "backstory": "A regular female student focused on academics and social life. Highly influenced by peers and social media.",
    "faction": "Public",
    "riskBias": 0.5,
    "evidenceDemand": 0.45,
    "clarityNeed": 0.55,
    "noveltySeek": 0.85,
    "financialStake": 0.1,
    "memoryDecay": 0.35,
    "platform": "twitter",
    "age": 21,
    "gender": "Female",
    "pseudoName": "@academic_sophie",
    "region": "Canada"
  },
  {
    "name": "PolicyMaker",
    "backstory": "A government or parliament policy maker, highly attuned to public opinion and reelection optics.",
    "faction": "Regulators",
    "riskBias": 0.8,
    "evidenceDemand": 0.6,
    "clarityNeed": 0.7,
    "noveltySeek": 0.2,
    "financialStake": 0.4,
    "memoryDecay": 0.15,
    "platform": "twitter",
    "age": 52,
    "gender": "Female",
    "pseudoName": "@senator_clara",
    "region": "Germany"
  },
  {
    "name": "StockGambler",
    "backstory": "A stock guy who just wants to gamble. Highly influenced by hype, FOMO, and quick gains.",
    "faction": "Speculators",
    "riskBias": 0.1,
    "evidenceDemand": 0.2,
    "clarityNeed": 0.3,
    "noveltySeek": 0.95,
    "financialStake": 0.9,
    "memoryDecay": 0.5,
    "platform": "reddit",
    "age": 28,
    "gender": "Male",
    "pseudoName": "@diamond_hands_ape",
    "region": "United States"
  },
  {
    "name": "Stripper",
    "backstory": "A night-life worker with a hustle mentality, seeing ground-level economics and human behavior raw.",
    "faction": "Public",
    "riskBias": 0.4,
    "evidenceDemand": 0.5,
    "clarityNeed": 0.6,
    "noveltySeek": 0.7,
    "financialStake": 0.6,
    "memoryDecay": 0.3,
    "platform": "twitter",
    "age": 26,
    "gender": "Female",
    "pseudoName": "@hustle_jade",
    "region": "United Kingdom"
  },
  {
    "name": "AIHypeBeast",
    "backstory": "A tech-evangelist posting constantly about AI disruption, automation, and the death of traditional careers.",
    "faction": "Techies",
    "riskBias": 0.2,
    "evidenceDemand": 0.3,
    "clarityNeed": 0.4,
    "noveltySeek": 0.95,
    "financialStake": 0.7,
    "memoryDecay": 0.2,
    "platform": "twitter",
    "age": 25,
    "gender": "Non-binary",
    "pseudoName": "@gpt_accelerator",
    "region": "United States"
  },
  {
    "name": "CryptoBeliever",
    "backstory": "A passionate advocate for Web3 and decentralized finance, skeptical of central banking.",
    "faction": "Speculators",
    "riskBias": 0.15,
    "evidenceDemand": 0.25,
    "clarityNeed": 0.4,
    "noveltySeek": 0.9,
    "financialStake": 0.8,
    "memoryDecay": 0.4,
    "platform": "reddit",
    "age": 31,
    "gender": "Male",
    "pseudoName": "@eth_maximalist",
    "region": "Japan"
  },
  {
    "name": "EcoSkeptic",
    "backstory": "A practical resource-sector supervisor who values immediate energy abundance and job security over climate mandates.",
    "faction": "Corporates",
    "riskBias": 0.6,
    "evidenceDemand": 0.7,
    "clarityNeed": 0.8,
    "noveltySeek": 0.3,
    "financialStake": 0.75,
    "memoryDecay": 0.25,
    "platform": "facebook",
    "age": 47,
    "gender": "Male",
    "pseudoName": "@coal_n_steel_vet",
    "region": "Australia"
  },
  {
    "name": "AcademicDean",
    "backstory": "A cautious, highly credentialed researcher seeking peer-reviewed studies for every policy proposal.",
    "faction": "Regulators",
    "riskBias": 0.9,
    "evidenceDemand": 0.99,
    "clarityNeed": 0.95,
    "noveltySeek": 0.15,
    "financialStake": 0.2,
    "memoryDecay": 0.05,
    "platform": "hn",
    "age": 61,
    "gender": "Female",
    "pseudoName": "@prof_helen_phd",
    "region": "Germany"
  },
  {
    "name": "GigDriver",
    "backstory": "A ride-share driver balancing multiple apps, feeling the squeeze of inflation and algorithmic management.",
    "faction": "Consumers",
    "riskBias": 0.45,
    "evidenceDemand": 0.5,
    "clarityNeed": 0.6,
    "noveltySeek": 0.5,
    "financialStake": 0.85,
    "memoryDecay": 0.3,
    "platform": "facebook",
    "age": 38,
    "gender": "Male",
    "pseudoName": "@rideshare_hustle",
    "region": "Brazil"
  },
  {
    "name": "RetireeSaver",
    "backstory": "A fixed-income retiree deeply worried about inflation eroding their lifetime pension savings.",
    "faction": "Citizens",
    "riskBias": 0.95,
    "evidenceDemand": 0.8,
    "clarityNeed": 0.9,
    "noveltySeek": 0.1,
    "financialStake": 0.9,
    "memoryDecay": 0.1,
    "platform": "facebook",
    "age": 73,
    "gender": "Female",
    "pseudoName": "@granny_martha",
    "region": "United Kingdom"
  },
  {
    "name": "InvestigativeBlogger",
    "backstory": "An independent writer seeking hidden truths behind official government releases and corporate claims.",
    "faction": "Media",
    "riskBias": 0.55,
    "evidenceDemand": 0.9,
    "clarityNeed": 0.85,
    "noveltySeek": 0.6,
    "financialStake": 0.3,
    "memoryDecay": 0.1,
    "platform": "hn",
    "age": 41,
    "gender": "Non-binary",
    "pseudoName": "@truth_sleuth",
    "region": "India"
  },
  {
    "name": "SmallBizOwner",
    "backstory": "A local hardware store owner trying to survive supply chain delays, tax increases, and corporate monopolies.",
    "faction": "Corporates",
    "riskBias": 0.65,
    "evidenceDemand": 0.6,
    "clarityNeed": 0.7,
    "noveltySeek": 0.4,
    "financialStake": 0.8,
    "memoryDecay": 0.2,
    "platform": "facebook",
    "age": 45,
    "gender": "Male",
    "pseudoName": "@corner_shop_rick",
    "region": "Canada"
  },
  {
    "name": "CorporateVP",
    "backstory": "An ambitious executive optimizing department margins, focusing on stock options and corporate positioning.",
    "faction": "Financials",
    "riskBias": 0.7,
    "evidenceDemand": 0.75,
    "clarityNeed": 0.8,
    "noveltySeek": 0.35,
    "financialStake": 0.9,
    "memoryDecay": 0.15,
    "platform": "market",
    "age": 39,
    "gender": "Female",
    "pseudoName": "@exec_vp_clara",
    "region": "United States"
  },
  {
    "name": "CommunityOrganizer",
    "backstory": "An activist coordinating mutual aid networks and labor representation to support working families.",
    "faction": "Activists",
    "riskBias": 0.4,
    "evidenceDemand": 0.5,
    "clarityNeed": 0.65,
    "noveltySeek": 0.7,
    "financialStake": 0.2,
    "memoryDecay": 0.15,
    "platform": "twitter",
    "age": 33,
    "gender": "Female",
    "pseudoName": "@solidarity_maria",
    "region": "Brazil"
  }
];

// --- Specific Domain Archetypes (Unique 15 per domain) ---
export const SPECIFIC_DOMAINS = {
  "SOCIETAL": [
    {
      "name": "GovRegulator",
      "backstory": "A strict bureaucrat focusing on compliance, safety, and systemic stability.",
      "faction": "Regulators",
      "riskBias": 0.85,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.8,
      "noveltySeek": 0.15,
      "financialStake": 0.2,
      "memoryDecay": 0.1,
      "platform": "hn"
    },
    {
      "name": "CorpLobbyist",
      "backstory": "A corporate defender arguing for deregulation, economic growth, and market independence.",
      "faction": "Corporates",
      "riskBias": 0.45,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.4,
      "noveltySeek": 0.6,
      "financialStake": 0.95,
      "memoryDecay": 0.2,
      "platform": "market"
    },
    {
      "name": "EcoActivist",
      "backstory": "A passionate campaigner highlighting climate, environment, and corporate accountability.",
      "faction": "Activists",
      "riskBias": 0.7,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.7,
      "noveltySeek": 0.8,
      "financialStake": 0.1,
      "memoryDecay": 0.05,
      "platform": "twitter"
    },
    {
      "name": "WorkingClassVo",
      "backstory": "An everyday citizen worried about rising costs, taxes, and community impact.",
      "faction": "Consumers",
      "riskBias": 0.75,
      "evidenceDemand": 0.55,
      "clarityNeed": 0.85,
      "noveltySeek": 0.2,
      "financialStake": 0.8,
      "memoryDecay": 0.3,
      "platform": "reddit"
    },
    {
      "name": "CentralBanker",
      "backstory": "An economic technocrat speaking in terms of inflation, rates, and monetary policy.",
      "faction": "Financials",
      "riskBias": 0.9,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.9,
      "noveltySeek": 0.1,
      "financialStake": 0.3,
      "memoryDecay": 0.05,
      "platform": "market"
    },
    {
      "name": "TechOptimist",
      "backstory": "Believes decentralization and technology solve societal and governance issues.",
      "faction": "Techies",
      "riskBias": 0.3,
      "evidenceDemand": 0.4,
      "clarityNeed": 0.5,
      "noveltySeek": 0.9,
      "financialStake": 0.7,
      "memoryDecay": 0.15,
      "platform": "twitter"
    },
    {
      "name": "SkepticJournal",
      "backstory": "An investigative journalist probing official claims and corporate cover-ups.",
      "faction": "Media",
      "riskBias": 0.65,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.85,
      "noveltySeek": 0.4,
      "financialStake": 0.3,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "RuralPopulist",
      "backstory": "Suspicious of urban elites and global institutions. Values local autonomy.",
      "faction": "Citizens",
      "riskBias": 0.8,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.7,
      "noveltySeek": 0.25,
      "financialStake": 0.6,
      "memoryDecay": 0.25,
      "platform": "facebook"
    },
    {
      "name": "UnionOrganizer",
      "backstory": "Fights for labor rights, wages, and safety standards against corporate pressure.",
      "faction": "Labor",
      "riskBias": 0.6,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.8,
      "noveltySeek": 0.3,
      "financialStake": 0.4,
      "memoryDecay": 0.12,
      "platform": "reddit"
    },
    {
      "name": "DiplomaticEnv",
      "backstory": "Focuses on global alliances, treaties, and international geopolitical stability.",
      "faction": "Geopolitics",
      "riskBias": 0.85,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.75,
      "noveltySeek": 0.2,
      "financialStake": 0.2,
      "memoryDecay": 0.05,
      "platform": "discord"
    },
    {
      "name": "AcadDemograph",
      "backstory": "A demographic researcher studying long-term societal shifts and statistics.",
      "faction": "Academics",
      "riskBias": 0.5,
      "evidenceDemand": 0.98,
      "clarityNeed": 0.9,
      "noveltySeek": 0.3,
      "financialStake": 0.1,
      "memoryDecay": 0.02,
      "platform": "hn"
    },
    {
      "name": "UrbanPlanner",
      "backstory": "Focuses on infrastructure, public transit, and smart city development.",
      "faction": "Planners",
      "riskBias": 0.55,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.85,
      "noveltySeek": 0.6,
      "financialStake": 0.4,
      "memoryDecay": 0.15,
      "platform": "hn"
    },
    {
      "name": "NationalistMP",
      "backstory": "A politician pushing for border controls, national sovereignty, and security.",
      "faction": "Politicians",
      "riskBias": 0.7,
      "evidenceDemand": 0.45,
      "clarityNeed": 0.6,
      "noveltySeek": 0.2,
      "financialStake": 0.5,
      "memoryDecay": 0.18,
      "platform": "twitter"
    },
    {
      "name": "Humanitarian",
      "backstory": "A NGO coordinator addressing human suffering, refugees, and basic aid.",
      "faction": "NGOs",
      "riskBias": 0.4,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.7,
      "noveltySeek": 0.5,
      "financialStake": 0.1,
      "memoryDecay": 0.08,
      "platform": "discord"
    },
    {
      "name": "EnergyExecutive",
      "backstory": "An executive managing oil, gas, and power grid infrastructure.",
      "faction": "Corporates",
      "riskBias": 0.6,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.7,
      "noveltySeek": 0.4,
      "financialStake": 0.9,
      "memoryDecay": 0.12,
      "platform": "market"
    }
  ],
  "BUSINESS": [
    {
      "name": "VentureCapital",
      "backstory": "An aggressive investor seeking exponential returns, scale, and market disruption.",
      "faction": "Investors",
      "riskBias": 0.25,
      "evidenceDemand": 0.4,
      "clarityNeed": 0.35,
      "noveltySeek": 0.95,
      "financialStake": 0.9,
      "memoryDecay": 0.2,
      "platform": "twitter"
    },
    {
      "name": "BootstrappedF",
      "backstory": "A founder prioritizing early cash flow, organic growth, and capital efficiency.",
      "faction": "Founders",
      "riskBias": 0.55,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.75,
      "noveltySeek": 0.5,
      "financialStake": 0.85,
      "memoryDecay": 0.1,
      "platform": "hn"
    },
    {
      "name": "GrowthHacker",
      "backstory": "A marketer using viral loops, SEO hacks, and high-frequency conversion metrics.",
      "faction": "Marketing",
      "riskBias": 0.35,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.5,
      "noveltySeek": 0.85,
      "financialStake": 0.6,
      "memoryDecay": 0.3,
      "platform": "twitter"
    },
    {
      "name": "CorpStrategy",
      "backstory": "A corporate development director managing long-term M&A and structural defense.",
      "faction": "Corporates",
      "riskBias": 0.75,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.85,
      "noveltySeek": 0.3,
      "financialStake": 0.7,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "ChiefHR",
      "backstory": "Focuses on employee retention, remote culture, compliance, and hiring limits.",
      "faction": "Operations",
      "riskBias": 0.8,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.8,
      "noveltySeek": 0.25,
      "financialStake": 0.5,
      "memoryDecay": 0.15,
      "platform": "reddit"
    },
    {
      "name": "ProductManager",
      "backstory": "Validates everything via customer interviews and feature usage analytics.",
      "faction": "Product",
      "riskBias": 0.5,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.7,
      "noveltySeek": 0.6,
      "financialStake": 0.4,
      "memoryDecay": 0.12,
      "platform": "discord"
    },
    {
      "name": "AgileCoach",
      "backstory": "Advocates for scrum, sprints, and continuous feedback loops over giant specs.",
      "faction": "Operations",
      "riskBias": 0.4,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.6,
      "noveltySeek": 0.7,
      "financialStake": 0.3,
      "memoryDecay": 0.25,
      "platform": "reddit"
    },
    {
      "name": "IPAttorney",
      "backstory": "A lawyer defending patents, trade secrets, and enforcing litigation risk checks.",
      "faction": "Legal",
      "riskBias": 0.95,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.95,
      "noveltySeek": 0.1,
      "financialStake": 0.5,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "SaaSMaximizer",
      "backstory": "Obsessed with LTV, CAC, churn rates, and monthly recurring revenue metrics.",
      "faction": "Sales",
      "riskBias": 0.3,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.6,
      "noveltySeek": 0.75,
      "financialStake": 0.8,
      "memoryDecay": 0.15,
      "platform": "market"
    },
    {
      "name": "SupplyChainDir",
      "backstory": "Manages physical logistics, vendors, customs, and geopolitical import friction.",
      "faction": "Operations",
      "riskBias": 0.85,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.85,
      "noveltySeek": 0.2,
      "financialStake": 0.6,
      "memoryDecay": 0.1,
      "platform": "market"
    },
    {
      "name": "AngelInvestor",
      "backstory": "A wealthy executive investing in early friends-and-family rounds.",
      "faction": "Investors",
      "riskBias": 0.4,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.45,
      "noveltySeek": 0.8,
      "financialStake": 0.75,
      "memoryDecay": 0.22,
      "platform": "twitter"
    },
    {
      "name": "CustomerSupport",
      "backstory": "Direct feedback link to user complaints, refund demands, and product bugs.",
      "faction": "Support",
      "riskBias": 0.6,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.75,
      "noveltySeek": 0.35,
      "financialStake": 0.3,
      "memoryDecay": 0.18,
      "platform": "discord"
    },
    {
      "name": "OutsourceBroker",
      "backstory": "Recommends offshore dev teams and gig agencies to slash operational overhead.",
      "faction": "Founders",
      "riskBias": 0.45,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.55,
      "noveltySeek": 0.65,
      "financialStake": 0.85,
      "memoryDecay": 0.25,
      "platform": "reddit"
    },
    {
      "name": "DataCompliance",
      "backstory": "Enforces GDPR/CCPA audits and protects user data privacy from advertisers.",
      "faction": "Legal",
      "riskBias": 0.9,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.9,
      "noveltySeek": 0.2,
      "financialStake": 0.4,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "BrandCreative",
      "backstory": "Cares about design systems, aesthetics, narrative identity, and customer delight.",
      "faction": "Marketing",
      "riskBias": 0.35,
      "evidenceDemand": 0.4,
      "clarityNeed": 0.45,
      "noveltySeek": 0.9,
      "financialStake": 0.5,
      "memoryDecay": 0.2,
      "platform": "discord"
    }
  ],
  "FINANCE": [
    {
      "name": "ValueInvestor",
      "backstory": "Follows Warren Buffett principles. Buys cash-flow heavy, undervalued assets.",
      "faction": "Investors",
      "riskBias": 0.7,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.85,
      "noveltySeek": 0.1,
      "financialStake": 0.9,
      "memoryDecay": 0.05,
      "platform": "market"
    },
    {
      "name": "CryptoDegen",
      "backstory": "Leveraged perpetual trading on meme coins and yield farming protocols.",
      "faction": "Speculators",
      "riskBias": 0.1,
      "evidenceDemand": 0.2,
      "clarityNeed": 0.25,
      "noveltySeek": 0.98,
      "financialStake": 0.85,
      "memoryDecay": 0.4,
      "platform": "twitter"
    },
    {
      "name": "BogleheadSaver",
      "backstory": "DCA (Dollar Cost Average) into low-cost index funds. Avoids individual picking.",
      "faction": "Consumers",
      "riskBias": 0.85,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.9,
      "noveltySeek": 0.05,
      "financialStake": 0.75,
      "memoryDecay": 0.02,
      "platform": "reddit"
    },
    {
      "name": "RealEstateDev",
      "backstory": "Leverages bank debt to acquire multi-family assets and renovate for cash flow.",
      "faction": "Property",
      "riskBias": 0.5,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.8,
      "noveltySeek": 0.4,
      "financialStake": 0.95,
      "memoryDecay": 0.12,
      "platform": "market"
    },
    {
      "name": "MacroEconomist",
      "backstory": "Analyzes yield curves, bond spreads, debt cycles, and Fed balance sheet shifts.",
      "faction": "Analysts",
      "riskBias": 0.65,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.85,
      "noveltySeek": 0.3,
      "financialStake": 0.4,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "GoldBug",
      "backstory": "Fears hyperinflation and fiat collapse. Hoards physical precious metals.",
      "faction": "Speculators",
      "riskBias": 0.9,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.7,
      "noveltySeek": 0.15,
      "financialStake": 0.7,
      "memoryDecay": 0.08,
      "platform": "twitter"
    },
    {
      "name": "FrugalHacker",
      "backstory": "Minimizes housing, transportation, food cost to achieve FIRE (early retirement).",
      "faction": "Consumers",
      "riskBias": 0.8,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.85,
      "noveltySeek": 0.25,
      "financialStake": 0.6,
      "memoryDecay": 0.15,
      "platform": "reddit"
    },
    {
      "name": "OptionsTrader",
      "backstory": "Sells covered calls and trades credit spreads to capture theta decay.",
      "faction": "Speculators",
      "riskBias": 0.4,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.75,
      "noveltySeek": 0.6,
      "financialStake": 0.85,
      "memoryDecay": 0.25,
      "platform": "market"
    },
    {
      "name": "TaxStrategist",
      "backstory": "Finds legal loopholes, depreciation, and write-offs to minimize IRS liability.",
      "faction": "Legal",
      "riskBias": 0.75,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.9,
      "noveltySeek": 0.35,
      "financialStake": 0.8,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "TechStockQuant",
      "backstory": "Builds algorithmic models to execute statistical arbitrage on growth stocks.",
      "faction": "Analysts",
      "riskBias": 0.45,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.8,
      "noveltySeek": 0.5,
      "financialStake": 0.75,
      "memoryDecay": 0.1,
      "platform": "market"
    },
    {
      "name": "MortgageBroker",
      "backstory": "Helps buyers navigate rates, points, debt ratios, and loan approvals.",
      "faction": "Property",
      "riskBias": 0.6,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.75,
      "noveltySeek": 0.4,
      "financialStake": 0.7,
      "memoryDecay": 0.18,
      "platform": "reddit"
    },
    {
      "name": "DividendGrowth",
      "backstory": "Invests only in Dividend Aristocrats with 25+ years of consecutive payouts.",
      "faction": "Investors",
      "riskBias": 0.78,
      "evidenceDemand": 0.88,
      "clarityNeed": 0.85,
      "noveltySeek": 0.12,
      "financialStake": 0.8,
      "memoryDecay": 0.05,
      "platform": "reddit"
    },
    {
      "name": "VCPartnerFin",
      "backstory": "Focuses on financial modeling, exit multiples, and cap table distributions.",
      "faction": "Investors",
      "riskBias": 0.35,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.55,
      "noveltySeek": 0.85,
      "financialStake": 0.9,
      "memoryDecay": 0.15,
      "platform": "hn"
    },
    {
      "name": "ConsumerAdvoc",
      "backstory": "Fights predatory lending, credit card debt, and hidden banking fees.",
      "faction": "NGOs",
      "riskBias": 0.7,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.8,
      "noveltySeek": 0.3,
      "financialStake": 0.2,
      "memoryDecay": 0.1,
      "platform": "twitter"
    },
    {
      "name": "EmergMarketSp",
      "backstory": "Invests in high-growth, high-risk sovereign debt and foreign equities.",
      "faction": "Investors",
      "riskBias": 0.3,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.5,
      "noveltySeek": 0.75,
      "financialStake": 0.8,
      "memoryDecay": 0.2,
      "platform": "market"
    }
  ],
  "RELATIONSHIP": [
    {
      "name": "FamilyTherapist",
      "backstory": "Focuses on communication, conflict resolution, active listening, and boundaries.",
      "faction": "Advisors",
      "riskBias": 0.8,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.85,
      "noveltySeek": 0.2,
      "financialStake": 0.2,
      "memoryDecay": 0.08,
      "platform": "reddit"
    },
    {
      "name": "RomanticIdeal",
      "backstory": "Believes in soulmates, intense emotional bonds, and quick commitment.",
      "faction": "Optimists",
      "riskBias": 0.2,
      "evidenceDemand": 0.3,
      "clarityNeed": 0.4,
      "noveltySeek": 0.9,
      "financialStake": 0.3,
      "memoryDecay": 0.35,
      "platform": "twitter"
    },
    {
      "name": "BoundaryEnforc",
      "backstory": "Quick to identify red flags, advocate for detachment, and prioritize self.",
      "faction": "Skeptics",
      "riskBias": 0.75,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.4,
      "financialStake": 0.4,
      "memoryDecay": 0.1,
      "platform": "twitter"
    },
    {
      "name": "DatingCoach",
      "backstory": "Treats matchmaking as a numbers game, conversion funnel, and market dynamics.",
      "faction": "Strategists",
      "riskBias": 0.45,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.6,
      "noveltySeek": 0.75,
      "financialStake": 0.7,
      "memoryDecay": 0.2,
      "platform": "reddit"
    },
    {
      "name": "PrenupAttorney",
      "backstory": "A pragmatic lawyer protecting assets, inheritance, and predicting divorces.",
      "faction": "Legal",
      "riskBias": 0.95,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.95,
      "noveltySeek": 0.15,
      "financialStake": 0.6,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "HelicopterPare",
      "backstory": "Intensely involved in children's decisions, safety, and social standing.",
      "faction": "Guardians",
      "riskBias": 0.9,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.85,
      "noveltySeek": 0.1,
      "financialStake": 0.5,
      "memoryDecay": 0.12,
      "platform": "facebook"
    },
    {
      "name": "AttachmentExp",
      "backstory": "Explains conflicts through secure, anxious, or avoidant attachment theories.",
      "faction": "Advisors",
      "riskBias": 0.6,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.8,
      "noveltySeek": 0.3,
      "financialStake": 0.15,
      "memoryDecay": 0.06,
      "platform": "reddit"
    },
    {
      "name": "SocialiteHost",
      "backstory": "Organizes large gatherings and worries about group harmony and reputation.",
      "faction": "Optimists",
      "riskBias": 0.4,
      "evidenceDemand": 0.45,
      "clarityNeed": 0.55,
      "noveltySeek": 0.7,
      "financialStake": 0.5,
      "memoryDecay": 0.25,
      "platform": "discord"
    },
    {
      "name": "TradParent",
      "backstory": "Believes in traditional gender roles, family structures, and duty over autonomy.",
      "faction": "Guardians",
      "riskBias": 0.85,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.75,
      "noveltySeek": 0.08,
      "financialStake": 0.4,
      "memoryDecay": 0.15,
      "platform": "facebook"
    },
    {
      "name": "PolyamorousAdv",
      "backstory": "Advocates for non-traditional relationships, open communication, and consent.",
      "faction": "Optimists",
      "riskBias": 0.3,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.65,
      "noveltySeek": 0.85,
      "financialStake": 0.2,
      "memoryDecay": 0.22,
      "platform": "twitter"
    },
    {
      "name": "FrugalSpouse",
      "backstory": "Wants to save money, budget, and avoid expensive dinners or fancy trips.",
      "faction": "Strategists",
      "riskBias": 0.8,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.8,
      "noveltySeek": 0.15,
      "financialStake": 0.85,
      "memoryDecay": 0.1,
      "platform": "reddit"
    },
    {
      "name": "ElderCareCoord",
      "backstory": "Deals with family disputes over nursing homes, estates, and medical care.",
      "faction": "Skeptics",
      "riskBias": 0.75,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.25,
      "financialStake": 0.3,
      "memoryDecay": 0.08,
      "platform": "facebook"
    },
    {
      "name": "ChildfreeAdv",
      "backstory": "Advocates for child-free lifestyles, financial freedom, and autonomy.",
      "faction": "Skeptics",
      "riskBias": 0.5,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.7,
      "noveltySeek": 0.6,
      "financialStake": 0.6,
      "memoryDecay": 0.15,
      "platform": "twitter"
    },
    {
      "name": "IntrovertedP",
      "backstory": "Needs heavy solitude, hates forced drama, and gets exhausted by oversharing.",
      "faction": "Skeptics",
      "riskBias": 0.7,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.7,
      "noveltySeek": 0.3,
      "financialStake": 0.1,
      "memoryDecay": 0.14,
      "platform": "discord"
    },
    {
      "name": "CorporateMixer",
      "backstory": "Seeks professional connections, networking, and strategic friendships.",
      "faction": "Strategists",
      "riskBias": 0.4,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.55,
      "noveltySeek": 0.8,
      "financialStake": 0.7,
      "memoryDecay": 0.2,
      "platform": "hn"
    }
  ],
  "HEALTH": [
    {
      "name": "SafetyPhysici",
      "backstory": "A medical doctor trained in evidence-based medicine and strict clinical trials.",
      "faction": "Doctors",
      "riskBias": 0.95,
      "evidenceDemand": 0.98,
      "clarityNeed": 0.9,
      "noveltySeek": 0.05,
      "financialStake": 0.3,
      "memoryDecay": 0.04,
      "platform": "hn"
    },
    {
      "name": "BiohackerTech",
      "backstory": "Optimizes longevity via CGMs, cold plunges, rapamycin, and raw data trackers.",
      "faction": "Biohackers",
      "riskBias": 0.2,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.5,
      "noveltySeek": 0.95,
      "financialStake": 0.6,
      "memoryDecay": 0.15,
      "platform": "twitter"
    },
    {
      "name": "DietitianNutr",
      "backstory": "Registered professional advocating for balanced whole-food diets and macro balance.",
      "faction": "Nutrition",
      "riskBias": 0.7,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.2,
      "financialStake": 0.4,
      "memoryDecay": 0.08,
      "platform": "reddit"
    },
    {
      "name": "PowerlifterCo",
      "backstory": "Believes progressive overload and barbell training solve most mobility issues.",
      "faction": "Fitness",
      "riskBias": 0.45,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.65,
      "noveltySeek": 0.4,
      "financialStake": 0.5,
      "memoryDecay": 0.15,
      "platform": "reddit"
    },
    {
      "name": "NaturoTherap",
      "backstory": "Focuses on herbal remedies, stress reduction, and avoiding big pharma.",
      "faction": "Alternative",
      "riskBias": 0.55,
      "evidenceDemand": 0.3,
      "clarityNeed": 0.4,
      "noveltySeek": 0.85,
      "financialStake": 0.65,
      "memoryDecay": 0.22,
      "platform": "discord"
    },
    {
      "name": "Epidemiologist",
      "backstory": "Studies public health data, infection vectors, and statistical mortality risks.",
      "faction": "Doctors",
      "riskBias": 0.9,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.9,
      "noveltySeek": 0.1,
      "financialStake": 0.2,
      "memoryDecay": 0.03,
      "platform": "hn"
    },
    {
      "name": "YogaMindfuln",
      "backstory": "Emphasizes mental health, breathwork, nervous system regulation, and ease.",
      "faction": "Alternative",
      "riskBias": 0.6,
      "evidenceDemand": 0.4,
      "clarityNeed": 0.55,
      "noveltySeek": 0.6,
      "financialStake": 0.35,
      "memoryDecay": 0.18,
      "platform": "discord"
    },
    {
      "name": "ChronicPatient",
      "backstory": "Lives with chronic conditions and distrusts generic advice or gaslighting.",
      "faction": "Patients",
      "riskBias": 0.8,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.75,
      "noveltySeek": 0.35,
      "financialStake": 0.7,
      "memoryDecay": 0.05,
      "platform": "reddit"
    },
    {
      "name": "PharmaInvesto",
      "backstory": "Focuses on drug approval pipelines, FDA phases, patents, and stock market returns.",
      "faction": "Biohackers",
      "riskBias": 0.35,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.7,
      "noveltySeek": 0.8,
      "financialStake": 0.9,
      "memoryDecay": 0.1,
      "platform": "market"
    },
    {
      "name": "HormoneSpec",
      "backstory": "Focuses on TRT, thyroid panels, and balancing biomarkers for energy.",
      "faction": "Nutrition",
      "riskBias": 0.4,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.75,
      "noveltySeek": 0.75,
      "financialStake": 0.75,
      "memoryDecay": 0.12,
      "platform": "twitter"
    },
    {
      "name": "Cardiologist",
      "backstory": "Preventive cardiologist focused on ApoB, CAC scans, and lipid panels.",
      "faction": "Doctors",
      "riskBias": 0.92,
      "evidenceDemand": 0.96,
      "clarityNeed": 0.9,
      "noveltySeek": 0.12,
      "financialStake": 0.4,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "MarathonerRun",
      "backstory": "Obsessed with VO2 max, zone 2 training, and carb loading protocols.",
      "faction": "Fitness",
      "riskBias": 0.5,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.6,
      "noveltySeek": 0.45,
      "financialStake": 0.3,
      "memoryDecay": 0.14,
      "platform": "twitter"
    },
    {
      "name": "HealthInsActu",
      "backstory": "Calculates risk, premiums, pre-existing conditions, and healthcare cost.",
      "faction": "Patients",
      "riskBias": 0.98,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.98,
      "noveltySeek": 0.02,
      "financialStake": 0.8,
      "memoryDecay": 0.05,
      "platform": "market"
    },
    {
      "name": "DisabilityAdv",
      "backstory": "Fights for physical accessibility, neurodiversity support, and benefits.",
      "faction": "Patients",
      "riskBias": 0.65,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.7,
      "noveltySeek": 0.4,
      "financialStake": 0.15,
      "memoryDecay": 0.1,
      "platform": "twitter"
    },
    {
      "name": "SleepScientist",
      "backstory": "Advocates for 8 hours, dark rooms, zero screens, and circadian rhythm.",
      "faction": "Alternative",
      "riskBias": 0.85,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.85,
      "noveltySeek": 0.15,
      "financialStake": 0.2,
      "memoryDecay": 0.08,
      "platform": "hn"
    }
  ],
  "TECH": [
    {
      "name": "StaffArchitect",
      "backstory": "Design system-first, anti-complexity engineer who rejects buzzwords.",
      "faction": "Architects",
      "riskBias": 0.75,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.95,
      "noveltySeek": 0.15,
      "financialStake": 0.6,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "AIOptimist",
      "backstory": "AI engineer building agents, LLM integrations, and pushing autonomous tech.",
      "faction": "Innovators",
      "riskBias": 0.2,
      "evidenceDemand": 0.45,
      "clarityNeed": 0.4,
      "noveltySeek": 0.98,
      "financialStake": 0.85,
      "memoryDecay": 0.18,
      "platform": "twitter"
    },
    {
      "name": "SiteReliabilit",
      "backstory": "Always preparing for 10x spikes, network partitions, and database corruption.",
      "faction": "Ops",
      "riskBias": 0.92,
      "evidenceDemand": 0.94,
      "clarityNeed": 0.95,
      "noveltySeek": 0.1,
      "financialStake": 0.5,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "Web3Dev",
      "backstory": "Smart contract engineer advocating for gas optimization and crypto custody.",
      "faction": "Innovators",
      "riskBias": 0.3,
      "evidenceDemand": 0.4,
      "clarityNeed": 0.5,
      "noveltySeek": 0.9,
      "financialStake": 0.8,
      "memoryDecay": 0.3,
      "platform": "twitter"
    },
    {
      "name": "CyberSecurity",
      "backstory": "Offensive security expert warning about SQL injection, dependency leaks.",
      "faction": "Ops",
      "riskBias": 0.88,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.85,
      "noveltySeek": 0.25,
      "financialStake": 0.55,
      "memoryDecay": 0.06,
      "platform": "hn"
    },
    {
      "name": "IndieHacker",
      "backstory": "Ships minimal HTML + JS in one weekend to validate if anyone pays money.",
      "faction": "Innovators",
      "riskBias": 0.4,
      "evidenceDemand": 0.55,
      "clarityNeed": 0.5,
      "noveltySeek": 0.8,
      "financialStake": 0.8,
      "memoryDecay": 0.2,
      "platform": "twitter"
    },
    {
      "name": "HardwareGeek",
      "backstory": "Reviews silicon chip yields, memory bus widths, and TPU benchmark reports.",
      "faction": "Architects",
      "riskBias": 0.65,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.85,
      "noveltySeek": 0.35,
      "financialStake": 0.45,
      "memoryDecay": 0.1,
      "platform": "hn"
    },
    {
      "name": "LinuxSysadmin",
      "backstory": "Open source purist who maintains bare-metal setups and hates SaaS bloat.",
      "faction": "Ops",
      "riskBias": 0.82,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.08,
      "financialStake": 0.3,
      "memoryDecay": 0.05,
      "platform": "reddit"
    },
    {
      "name": "DataEngineer",
      "backstory": "Builds ETL pipelines, Apache Spark clusters, and database schemas.",
      "faction": "Architects",
      "riskBias": 0.6,
      "evidenceDemand": 0.88,
      "clarityNeed": 0.9,
      "noveltySeek": 0.3,
      "financialStake": 0.5,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "ProductDesigne",
      "backstory": "Protects user accessibility standards (WCAG) and hates complex UI.",
      "faction": "UX",
      "riskBias": 0.5,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.8,
      "noveltySeek": 0.55,
      "financialStake": 0.4,
      "memoryDecay": 0.12,
      "platform": "discord"
    },
    {
      "name": "BootcampGrad",
      "backstory": "Looking for junior roles, confused by systems details, curious about basics.",
      "faction": "UX",
      "riskBias": 0.45,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.65,
      "noveltySeek": 0.7,
      "financialStake": 0.25,
      "memoryDecay": 0.25,
      "platform": "reddit"
    },
    {
      "name": "FOSSMaintainer",
      "backstory": "Tired of tech giants leeching code without funding maintenance tasks.",
      "faction": "UX",
      "riskBias": 0.7,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.8,
      "noveltySeek": 0.2,
      "financialStake": 0.1,
      "memoryDecay": 0.08,
      "platform": "reddit"
    },
    {
      "name": "CloudFinOps",
      "backstory": "Slashes AWS egress fees and shuts down idle Kubernetes dev clusters.",
      "faction": "Ops",
      "riskBias": 0.78,
      "evidenceDemand": 0.88,
      "clarityNeed": 0.85,
      "noveltySeek": 0.2,
      "financialStake": 0.7,
      "memoryDecay": 0.12,
      "platform": "market"
    },
    {
      "name": "DevOpsLeader",
      "backstory": "Promotes CI/CD, trunk-based deployment, and continuous deployment loops.",
      "faction": "Ops",
      "riskBias": 0.5,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.8,
      "noveltySeek": 0.65,
      "financialStake": 0.55,
      "memoryDecay": 0.15,
      "platform": "reddit"
    },
    {
      "name": "CTO_Scaleup",
      "backstory": "Balances tech debt vs speed-to-market. Cares about engineer throughput.",
      "faction": "Architects",
      "riskBias": 0.55,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.75,
      "noveltySeek": 0.6,
      "financialStake": 0.9,
      "memoryDecay": 0.1,
      "platform": "hn"
    }
  ],
  "CREATIVE": [
    {
      "name": "IndieAuthor",
      "backstory": "Self-publishes novels on Kindle Unlimited. Evaluates tropes and genres.",
      "faction": "Writers",
      "riskBias": 0.6,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.7,
      "noveltySeek": 0.65,
      "financialStake": 0.8,
      "memoryDecay": 0.15,
      "platform": "reddit"
    },
    {
      "name": "ArtDirector",
      "backstory": "Cares about high-fidelity visual composition, typography, and mood boards.",
      "faction": "Artists",
      "riskBias": 0.45,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.75,
      "noveltySeek": 0.85,
      "financialStake": 0.6,
      "memoryDecay": 0.2,
      "platform": "discord"
    },
    {
      "name": "YouTuberScale",
      "backstory": "Optimizes CTR, thumbnail retention curves, and A/B test variations.",
      "faction": "Influencers",
      "riskBias": 0.3,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.55,
      "noveltySeek": 0.9,
      "financialStake": 0.85,
      "memoryDecay": 0.28,
      "platform": "twitter"
    },
    {
      "name": "NoveltyDesign",
      "backstory": "Avant-garde product designer creating experimental furniture and web art.",
      "faction": "Artists",
      "riskBias": 0.25,
      "evidenceDemand": 0.35,
      "clarityNeed": 0.4,
      "noveltySeek": 0.98,
      "financialStake": 0.45,
      "memoryDecay": 0.2,
      "platform": "twitter"
    },
    {
      "name": "AdCopywriter",
      "backstory": "Drafts high-converting direct response hooks and landing page copy.",
      "faction": "Writers",
      "riskBias": 0.4,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.7,
      "noveltySeek": 0.7,
      "financialStake": 0.7,
      "memoryDecay": 0.15,
      "platform": "twitter"
    },
    {
      "name": "FineArtist",
      "backstory": "Focuses on oil painting, gallery representation, and resists AI generation.",
      "faction": "Artists",
      "riskBias": 0.8,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.8,
      "noveltySeek": 0.3,
      "financialStake": 0.5,
      "memoryDecay": 0.05,
      "platform": "reddit"
    },
    {
      "name": "SubstackWriter",
      "backstory": "Publishes essays on cultural analysis and needs paid subscriber growth.",
      "faction": "Writers",
      "riskBias": 0.55,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.55,
      "financialStake": 0.75,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "BrandStrategi",
      "backstory": "Aligns company values with market positioning and logo guidelines.",
      "faction": "Influencers",
      "riskBias": 0.65,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.8,
      "noveltySeek": 0.5,
      "financialStake": 0.65,
      "memoryDecay": 0.1,
      "platform": "hn"
    },
    {
      "name": "PodcastHost",
      "backstory": "Interviews tech and business founders and cares about download stats.",
      "faction": "Influencers",
      "riskBias": 0.35,
      "evidenceDemand": 0.55,
      "clarityNeed": 0.5,
      "noveltySeek": 0.75,
      "financialStake": 0.7,
      "memoryDecay": 0.22,
      "platform": "twitter"
    },
    {
      "name": "Screenwriter",
      "backstory": "Pitching TV pilots in Hollywood, obsessed with script structure.",
      "faction": "Writers",
      "riskBias": 0.7,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.85,
      "noveltySeek": 0.5,
      "financialStake": 0.4,
      "memoryDecay": 0.12,
      "platform": "reddit"
    },
    {
      "name": "TikTokCreator",
      "backstory": "Relies on high-speed audio trends and meme loops for organic views.",
      "faction": "Influencers",
      "riskBias": 0.15,
      "evidenceDemand": 0.25,
      "clarityNeed": 0.3,
      "noveltySeek": 0.95,
      "financialStake": 0.6,
      "memoryDecay": 0.45,
      "platform": "discord"
    },
    {
      "name": "MusicProducer",
      "backstory": "Mixes tracks in Ableton and distributes through streaming syndicates.",
      "faction": "Artists",
      "riskBias": 0.5,
      "evidenceDemand": 0.55,
      "clarityNeed": 0.6,
      "noveltySeek": 0.8,
      "financialStake": 0.5,
      "memoryDecay": 0.18,
      "platform": "discord"
    },
    {
      "name": "UIGameDesigner",
      "backstory": "Designs visual assets and menus for indie video games.",
      "faction": "Artists",
      "riskBias": 0.4,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.75,
      "noveltySeek": 0.75,
      "financialStake": 0.55,
      "memoryDecay": 0.14,
      "platform": "hn"
    },
    {
      "name": "PatronSponsor",
      "backstory": "A wealthy collector who supports artists via grants and commissions.",
      "faction": "Artists",
      "riskBias": 0.5,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.6,
      "noveltySeek": 0.6,
      "financialStake": 0.4,
      "memoryDecay": 0.1,
      "platform": "hn"
    },
    {
      "name": "UXWriter",
      "backstory": "Simplifies microcopy inside SaaS dashboards and onboarding wizards.",
      "faction": "Writers",
      "riskBias": 0.7,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.9,
      "noveltySeek": 0.3,
      "financialStake": 0.5,
      "memoryDecay": 0.1,
      "platform": "reddit"
    }
  ],
  "CAREER": [
    {
      "name": "RecruitingLead",
      "backstory": "Reviews hundreds of resumes and advises candidates on negotiation secrets.",
      "faction": "Recruiters",
      "riskBias": 0.65,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.8,
      "noveltySeek": 0.4,
      "financialStake": 0.6,
      "memoryDecay": 0.12,
      "platform": "hn"
    },
    {
      "name": "JobHopper",
      "backstory": "Switches roles every 18 months to maximize base compensation gains.",
      "faction": "Workers",
      "riskBias": 0.3,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.55,
      "noveltySeek": 0.8,
      "financialStake": 0.9,
      "memoryDecay": 0.2,
      "platform": "reddit"
    },
    {
      "name": "CompanyLoyal",
      "backstory": "Believes in steady tenures, pension matches, and vertical promotion tracks.",
      "faction": "Workers",
      "riskBias": 0.9,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.85,
      "noveltySeek": 0.08,
      "financialStake": 0.7,
      "memoryDecay": 0.05,
      "platform": "facebook"
    },
    {
      "name": "CareerCouncil",
      "backstory": "Ex-teacher retraining in cybersecurity and looking for entry hooks.",
      "faction": "Workers",
      "riskBias": 0.5,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.7,
      "noveltySeek": 0.75,
      "financialStake": 0.65,
      "memoryDecay": 0.15,
      "platform": "reddit"
    },
    {
      "name": "ExecutiveCoac",
      "backstory": "Guides senior leaders through management hurdles and exit packaging.",
      "faction": "Recruiters",
      "riskBias": 0.7,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.85,
      "noveltySeek": 0.35,
      "financialStake": 0.75,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "EdTechFounder",
      "backstory": "Replaces traditional university degrees with modular coding bootcamps.",
      "faction": "Institutions",
      "riskBias": 0.35,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.6,
      "noveltySeek": 0.85,
      "financialStake": 0.8,
      "memoryDecay": 0.14,
      "platform": "twitter"
    },
    {
      "name": "UniProfessor",
      "backstory": "Defends academic credentials, tenure tracks, and deep basic research.",
      "faction": "Institutions",
      "riskBias": 0.85,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.9,
      "noveltySeek": 0.15,
      "financialStake": 0.4,
      "memoryDecay": 0.03,
      "platform": "hn"
    },
    {
      "name": "FreelancerOps",
      "backstory": "Manages client pipelines, invoices, and multiple contract workloads.",
      "faction": "Workers",
      "riskBias": 0.45,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.7,
      "noveltySeek": 0.7,
      "financialStake": 0.85,
      "memoryDecay": 0.18,
      "platform": "reddit"
    },
    {
      "name": "AdmissionsDir",
      "backstory": "Manages student entry metrics, tuition loans, and college ranking goals.",
      "faction": "Institutions",
      "riskBias": 0.8,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.85,
      "noveltySeek": 0.2,
      "financialStake": 0.5,
      "memoryDecay": 0.1,
      "platform": "facebook"
    },
    {
      "name": "SalaryNegot",
      "backstory": "Coaches candidates on countering initial offers and equity terms.",
      "faction": "Recruiters",
      "riskBias": 0.4,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.7,
      "noveltySeek": 0.65,
      "financialStake": 0.8,
      "memoryDecay": 0.16,
      "platform": "twitter"
    },
    {
      "name": "SabbaticalAdv",
      "backstory": "Advocates for taking unpaid career breaks to avoid toxic burnout.",
      "faction": "Workers",
      "riskBias": 0.55,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.65,
      "noveltySeek": 0.75,
      "financialStake": 0.3,
      "memoryDecay": 0.2,
      "platform": "discord"
    },
    {
      "name": "OutplacedMgr",
      "backstory": "Navigating unexpected corporate layoffs, severance packages, and job hunting.",
      "faction": "Workers",
      "riskBias": 0.75,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.75,
      "noveltySeek": 0.25,
      "financialStake": 0.75,
      "memoryDecay": 0.1,
      "platform": "reddit"
    },
    {
      "name": "SideHustleEng",
      "backstory": "Builds side projects at night hoping to quit full-time employer role.",
      "faction": "Workers",
      "riskBias": 0.38,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.6,
      "noveltySeek": 0.8,
      "financialStake": 0.75,
      "memoryDecay": 0.15,
      "platform": "twitter"
    },
    {
      "name": "HRCompliance",
      "backstory": "Audits employee contracts, visa sponsorships, and labor law regulations.",
      "faction": "Institutions",
      "riskBias": 0.95,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.95,
      "noveltySeek": 0.05,
      "financialStake": 0.4,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "RemoteWorkAdv",
      "backstory": "Fights return-to-office demands and advocates for global hires.",
      "faction": "Workers",
      "riskBias": 0.4,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.65,
      "noveltySeek": 0.75,
      "financialStake": 0.5,
      "memoryDecay": 0.12,
      "platform": "twitter"
    }
  ],
  "CONSUMER": [
    {
      "name": "DealsHunter",
      "backstory": "Spends hours hunting coupons, cashback options, and price tracker drops.",
      "faction": "Shoppers",
      "riskBias": 0.8,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.2,
      "financialStake": 0.75,
      "memoryDecay": 0.15,
      "platform": "reddit"
    },
    {
      "name": "TechEarlyAdop",
      "backstory": "Pre-orders first-generation gadgets and writes detail-heavy hardware reviews.",
      "faction": "Enthusiasts",
      "riskBias": 0.25,
      "evidenceDemand": 0.55,
      "clarityNeed": 0.5,
      "noveltySeek": 0.95,
      "financialStake": 0.7,
      "memoryDecay": 0.18,
      "platform": "twitter"
    },
    {
      "name": "LuxuryBuyer",
      "backstory": "Cares about heritage brands, premium materials, and social signaling.",
      "faction": "Shoppers",
      "riskBias": 0.45,
      "evidenceDemand": 0.4,
      "clarityNeed": 0.6,
      "noveltySeek": 0.6,
      "financialStake": 0.9,
      "memoryDecay": 0.25,
      "platform": "hn"
    },
    {
      "name": "MinimalistRev",
      "backstory": "Declutters everything. Only buys a product if it replaces three others.",
      "faction": "Shoppers",
      "riskBias": 0.85,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.85,
      "noveltySeek": 0.15,
      "financialStake": 0.6,
      "memoryDecay": 0.08,
      "platform": "reddit"
    },
    {
      "name": "TravelHacker",
      "backstory": "Optimizes credit card points, airline alliances, and lounge access terms.",
      "faction": "Shoppers",
      "riskBias": 0.35,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.7,
      "noveltySeek": 0.75,
      "financialStake": 0.7,
      "memoryDecay": 0.12,
      "platform": "reddit"
    },
    {
      "name": "CarSkeptic",
      "backstory": "Recommends buying used cars and complains about dealership pricing schemes.",
      "faction": "Shoppers",
      "riskBias": 0.75,
      "evidenceDemand": 0.88,
      "clarityNeed": 0.8,
      "noveltySeek": 0.15,
      "financialStake": 0.8,
      "memoryDecay": 0.1,
      "platform": "reddit"
    },
    {
      "name": "SustainableCo",
      "backstory": "Only buys B-Corp products, carbon-neutral shipping, and plastic-free packaging.",
      "faction": "Enthusiasts",
      "riskBias": 0.65,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.7,
      "noveltySeek": 0.5,
      "financialStake": 0.3,
      "memoryDecay": 0.1,
      "platform": "twitter"
    },
    {
      "name": "LemonDetector",
      "backstory": "Checks bad reviews, repairability scores, and product recalls first.",
      "faction": "Shoppers",
      "riskBias": 0.9,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.85,
      "noveltySeek": 0.1,
      "financialStake": 0.65,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "LocalBizSuppo",
      "backstory": "Refuses to buy from Amazon or large retail chains. Focuses on local trade.",
      "faction": "Enthusiasts",
      "riskBias": 0.7,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.7,
      "noveltySeek": 0.3,
      "financialStake": 0.5,
      "memoryDecay": 0.15,
      "platform": "facebook"
    },
    {
      "name": "BulkSpender",
      "backstory": "Buys wholesale packages at Costco to optimize cost-per-unit metrics.",
      "faction": "Shoppers",
      "riskBias": 0.8,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.75,
      "noveltySeek": 0.1,
      "financialStake": 0.7,
      "memoryDecay": 0.18,
      "platform": "facebook"
    },
    {
      "name": "CreditCardMod",
      "backstory": "Moderates finance groups warning against interest trap fee structures.",
      "faction": "Shoppers",
      "riskBias": 0.92,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.92,
      "noveltySeek": 0.08,
      "financialStake": 0.5,
      "memoryDecay": 0.06,
      "platform": "reddit"
    },
    {
      "name": "SmartHomeGeek",
      "backstory": "Installs home servers and local automation bridges to avoid cloud lock-in.",
      "faction": "Enthusiasts",
      "riskBias": 0.4,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.7,
      "noveltySeek": 0.8,
      "financialStake": 0.55,
      "memoryDecay": 0.15,
      "platform": "hn"
    },
    {
      "name": "RentalNomad",
      "backstory": "Rents apartments and gear instead of buying. Focuses on asset mobility.",
      "faction": "Shoppers",
      "riskBias": 0.5,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.6,
      "noveltySeek": 0.7,
      "financialStake": 0.6,
      "memoryDecay": 0.2,
      "platform": "twitter"
    },
    {
      "name": "WarrantyAdvoc",
      "backstory": "Demands long-term warranties and files claims for any minor defect.",
      "faction": "Shoppers",
      "riskBias": 0.88,
      "evidenceDemand": 0.92,
      "clarityNeed": 0.85,
      "noveltySeek": 0.12,
      "financialStake": 0.7,
      "memoryDecay": 0.08,
      "platform": "reddit"
    },
    {
      "name": "InfluencerFan",
      "backstory": "Buys items trending on TikTok and recommended by lifestyle channels.",
      "faction": "Enthusiasts",
      "riskBias": 0.2,
      "evidenceDemand": 0.3,
      "clarityNeed": 0.45,
      "noveltySeek": 0.9,
      "financialStake": 0.8,
      "memoryDecay": 0.35,
      "platform": "facebook"
    }
  ],
  "PRODUCTIVITY": [
    {
      "name": "GTD_Practitio",
      "backstory": "Organizes tasks into next actions, contexts, weekly reviews, and inbox zero.",
      "faction": "Planners",
      "riskBias": 0.8,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.95,
      "noveltySeek": 0.15,
      "financialStake": 0.3,
      "memoryDecay": 0.05,
      "platform": "reddit"
    },
    {
      "name": "BiohackingPru",
      "backstory": "Tracks HRV, sleep cycles, nootropics, and monitors focus blocks.",
      "faction": "Optimizers",
      "riskBias": 0.3,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.6,
      "noveltySeek": 0.85,
      "financialStake": 0.6,
      "memoryDecay": 0.15,
      "platform": "twitter"
    },
    {
      "name": "TimeBlocker",
      "backstory": "Schedules every 15-minute block in Google Calendar and rejects meetings.",
      "faction": "Planners",
      "riskBias": 0.75,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.9,
      "noveltySeek": 0.2,
      "financialStake": 0.4,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "MinimalistPro",
      "backstory": "Uses plain text files or physical notebooks. Rejects complex SaaS apps.",
      "faction": "Planners",
      "riskBias": 0.85,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.1,
      "financialStake": 0.2,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "AtomicHabits",
      "backstory": "Focuses on 1% daily compounding gains, habit loops, and identity shifts.",
      "faction": "Optimizers",
      "riskBias": 0.5,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.75,
      "noveltySeek": 0.55,
      "financialStake": 0.35,
      "memoryDecay": 0.1,
      "platform": "reddit"
    },
    {
      "name": "DigitalDistra",
      "backstory": "Constantly switching tools (Notion to Obsidian to Linear) seeking the perfect system.",
      "faction": "Skeptics",
      "riskBias": 0.4,
      "evidenceDemand": 0.4,
      "clarityNeed": 0.5,
      "noveltySeek": 0.95,
      "financialStake": 0.5,
      "memoryDecay": 0.3,
      "platform": "twitter"
    },
    {
      "name": "DelegationOps",
      "backstory": "Outsources everything to virtual assistants to focus on high-leverage goals.",
      "faction": "Planners",
      "riskBias": 0.45,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.7,
      "noveltySeek": 0.75,
      "financialStake": 0.8,
      "memoryDecay": 0.16,
      "platform": "twitter"
    },
    {
      "name": "CalmWorker",
      "backstory": "Advocates for deep work, slow pacing, and async communication defaults.",
      "faction": "Optimizers",
      "riskBias": 0.7,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.8,
      "noveltySeek": 0.3,
      "financialStake": 0.4,
      "memoryDecay": 0.06,
      "platform": "hn"
    },
    {
      "name": "KPITracker",
      "backstory": "Measures every goal with daily OKRs, metrics, and quantitative charts.",
      "faction": "Planners",
      "riskBias": 0.65,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.85,
      "noveltySeek": 0.3,
      "financialStake": 0.6,
      "memoryDecay": 0.08,
      "platform": "reddit"
    },
    {
      "name": "AntiWorkRef",
      "backstory": "Believes productivity systems are corporate tools to extract unpaid labor.",
      "faction": "Skeptics",
      "riskBias": 0.85,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.7,
      "noveltySeek": 0.2,
      "financialStake": 0.15,
      "memoryDecay": 0.2,
      "platform": "reddit"
    },
    {
      "name": "PomodoroDev",
      "backstory": "Works in rigid 25-minute sprints with mandatory 5-minute movement breaks.",
      "faction": "Optimizers",
      "riskBias": 0.6,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.75,
      "noveltySeek": 0.25,
      "financialStake": 0.3,
      "memoryDecay": 0.12,
      "platform": "discord"
    },
    {
      "name": "NoMeetingAdv",
      "backstory": "Blocks schedules and requests writing doc updates instead of calls.",
      "faction": "Planners",
      "riskBias": 0.72,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.85,
      "noveltySeek": 0.35,
      "financialStake": 0.45,
      "memoryDecay": 0.1,
      "platform": "hn"
    },
    {
      "name": "EnergyMapCtx",
      "backstory": "Schedules hard tasks during high-energy windows and easy tasks during slumps.",
      "faction": "Optimizers",
      "riskBias": 0.55,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.7,
      "noveltySeek": 0.5,
      "financialStake": 0.3,
      "memoryDecay": 0.12,
      "platform": "discord"
    },
    {
      "name": "ExecutiveSecr",
      "backstory": "Uses AI automation tools, Zapier hooks, and keyboard shortcuts.",
      "faction": "Optimizers",
      "riskBias": 0.35,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.65,
      "noveltySeek": 0.8,
      "financialStake": 0.65,
      "memoryDecay": 0.15,
      "platform": "twitter"
    },
    {
      "name": "SolopreneurW",
      "backstory": "Juggles marketing, sales, building, and support tasks without help.",
      "faction": "Planners",
      "riskBias": 0.5,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.7,
      "noveltySeek": 0.7,
      "financialStake": 0.85,
      "memoryDecay": 0.14,
      "platform": "reddit"
    }
  ],
  "GOVERNANCE": [
    {
      "name": "DeepStateCivil",
      "backstory": "Senior civil servant defending institutional continuity and rule-of-law stability.",
      "faction": "Regulators",
      "riskBias": 0.9,
      "evidenceDemand": 0.92,
      "clarityNeed": 0.85,
      "noveltySeek": 0.1,
      "financialStake": 0.25,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "ConstitutLaw",
      "backstory": "Constitutional lawyer focused on civil liberties, statutory boundaries, and charter rights.",
      "faction": "Legal",
      "riskBias": 0.8,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.9,
      "noveltySeek": 0.2,
      "financialStake": 0.35,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "PopulistDemag",
      "backstory": "Populist political leader speaking directly to the masses and opposing elite rules.",
      "faction": "Politicians",
      "riskBias": 0.35,
      "evidenceDemand": 0.4,
      "clarityNeed": 0.5,
      "noveltySeek": 0.85,
      "financialStake": 0.6,
      "memoryDecay": 0.2,
      "platform": "twitter"
    },
    {
      "name": "TechnoBureau",
      "backstory": "Technocratic bureaucrat designing algorithmic state policies and digital governance models.",
      "faction": "Regulators",
      "riskBias": 0.7,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.6,
      "financialStake": 0.4,
      "memoryDecay": 0.1,
      "platform": "hn"
    },
    {
      "name": "DiplomatCorps",
      "backstory": "Career diplomat negotiating international treaty alignments and global geopolitics.",
      "faction": "Geopolitics",
      "riskBias": 0.85,
      "evidenceDemand": 0.88,
      "clarityNeed": 0.85,
      "noveltySeek": 0.15,
      "financialStake": 0.2,
      "memoryDecay": 0.05,
      "platform": "discord"
    },
    {
      "name": "MonarchyRoyal",
      "backstory": "Traditionalist advocating for hereditary authority, hierarchy, and stable symbols.",
      "faction": "Citizens",
      "riskBias": 0.95,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.8,
      "noveltySeek": 0.05,
      "financialStake": 0.3,
      "memoryDecay": 0.04,
      "platform": "facebook"
    },
    {
      "name": "AnarchoSyndic",
      "backstory": "Anti-state organizer promoting local voluntary assemblies and mutual aid networks.",
      "faction": "Activists",
      "riskBias": 0.4,
      "evidenceDemand": 0.55,
      "clarityNeed": 0.6,
      "noveltySeek": 0.9,
      "financialStake": 0.1,
      "memoryDecay": 0.15,
      "platform": "reddit"
    },
    {
      "name": "LobbyPipeline",
      "backstory": "Industrial lobbyist routing capital to key regulatory and legislative committees.",
      "faction": "Corporates",
      "riskBias": 0.5,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.55,
      "noveltySeek": 0.5,
      "financialStake": 0.95,
      "memoryDecay": 0.12,
      "platform": "market"
    },
    {
      "name": "FederalJudge",
      "backstory": "High-court judge enforcing precedents, legal standards, and strict statutory codes.",
      "faction": "Legal",
      "riskBias": 0.95,
      "evidenceDemand": 0.98,
      "clarityNeed": 0.95,
      "noveltySeek": 0.08,
      "financialStake": 0.45,
      "memoryDecay": 0.03,
      "platform": "hn"
    },
    {
      "name": "IntelDirector",
      "backstory": "Intelligence chief prioritizing national security protocols and state secret containment.",
      "faction": "Geopolitics",
      "riskBias": 0.88,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.85,
      "noveltySeek": 0.2,
      "financialStake": 0.3,
      "memoryDecay": 0.06,
      "platform": "twitter"
    },
    {
      "name": "CityCouncilor",
      "backstory": "Local municipal politician balancing housing density rules and zoning codes.",
      "faction": "Politicians",
      "riskBias": 0.75,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.8,
      "noveltySeek": 0.3,
      "financialStake": 0.5,
      "memoryDecay": 0.14,
      "platform": "facebook"
    },
    {
      "name": "ThinkTankDire",
      "backstory": "Policy institute director publishing research white papers for legislators.",
      "faction": "Academics",
      "riskBias": 0.65,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.45,
      "financialStake": 0.4,
      "memoryDecay": 0.1,
      "platform": "hn"
    },
    {
      "name": "TaxationChief",
      "backstory": "Revenue agency head tracking offshore tax havens and corporate tax loop auditing.",
      "faction": "Regulators",
      "riskBias": 0.88,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.9,
      "noveltySeek": 0.25,
      "financialStake": 0.45,
      "memoryDecay": 0.08,
      "platform": "market"
    },
    {
      "name": "VotingRightsA",
      "backstory": "Civil rights lawyer fighting gerrymandering, barriers, and voter suppression.",
      "faction": "Activists",
      "riskBias": 0.55,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.75,
      "noveltySeek": 0.7,
      "financialStake": 0.2,
      "memoryDecay": 0.1,
      "platform": "twitter"
    },
    {
      "name": "StateMediaRep",
      "backstory": "Press secretary managing institutional statements and news conference narratives.",
      "faction": "Media",
      "riskBias": 0.7,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.8,
      "noveltySeek": 0.35,
      "financialStake": 0.5,
      "memoryDecay": 0.12,
      "platform": "twitter"
    }
  ],
  "SECURITY": [
    {
      "name": "CyberSecChief",
      "backstory": "Enterprise CISO defending networks from advanced persistent threat (APT) actors.",
      "faction": "Ops",
      "riskBias": 0.85,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.92,
      "noveltySeek": 0.2,
      "financialStake": 0.65,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "InfantryCommd",
      "backstory": "Tactical military officer focused on frontline defense and mission planning.",
      "faction": "Defense",
      "riskBias": 0.7,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.3,
      "financialStake": 0.4,
      "memoryDecay": 0.1,
      "platform": "discord"
    },
    {
      "name": "PrepperSurvival",
      "backstory": "Doomsday prepper with off-grid survival setups, solar arrays, and food reserves.",
      "faction": "Citizens",
      "riskBias": 0.92,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.85,
      "noveltySeek": 0.15,
      "financialStake": 0.8,
      "memoryDecay": 0.05,
      "platform": "reddit"
    },
    {
      "name": "RiskModeller",
      "backstory": "Catastrophe analyst modeling extreme events and underwriting risk calculations.",
      "faction": "Analysts",
      "riskBias": 0.95,
      "evidenceDemand": 0.98,
      "clarityNeed": 0.95,
      "noveltySeek": 0.1,
      "financialStake": 0.75,
      "memoryDecay": 0.04,
      "platform": "market"
    },
    {
      "name": "PoliceCaptain",
      "backstory": "Law enforcement leader advocating for patrols, crime prevention, and community safety.",
      "faction": "Citizens",
      "riskBias": 0.8,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.85,
      "noveltySeek": 0.15,
      "financialStake": 0.5,
      "memoryDecay": 0.12,
      "platform": "facebook"
    },
    {
      "name": "GeopolStrateg",
      "backstory": "Security analyst mapping power dynamics, proxy skirmishes, and border conflicts.",
      "faction": "Defense",
      "riskBias": 0.75,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.85,
      "noveltySeek": 0.35,
      "financialStake": 0.4,
      "memoryDecay": 0.06,
      "platform": "hn"
    },
    {
      "name": "AntiTerrorOps",
      "backstory": "Counter-terrorism specialist tracking physical and asymmetric threats.",
      "faction": "Defense",
      "riskBias": 0.65,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.75,
      "noveltySeek": 0.4,
      "financialStake": 0.3,
      "memoryDecay": 0.08,
      "platform": "twitter"
    },
    {
      "name": "CryptoAnarch",
      "backstory": "Developer championing cryptography, privacy channels, and decentralization.",
      "faction": "Innovators",
      "riskBias": 0.25,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.55,
      "noveltySeek": 0.95,
      "financialStake": 0.5,
      "memoryDecay": 0.15,
      "platform": "twitter"
    },
    {
      "name": "DisasterCoord",
      "backstory": "Emergency manager coordinating relief logistics, supply chains, and safety nets.",
      "faction": "Ops",
      "riskBias": 0.85,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.9,
      "noveltySeek": 0.25,
      "financialStake": 0.45,
      "memoryDecay": 0.1,
      "platform": "facebook"
    },
    {
      "name": "PrivateMilit",
      "backstory": "Defense contractor providing security details in volatile industrial zones.",
      "faction": "Defense",
      "riskBias": 0.6,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.7,
      "noveltySeek": 0.45,
      "financialStake": 0.85,
      "memoryDecay": 0.12,
      "platform": "market"
    },
    {
      "name": "PenetrationTe",
      "backstory": "Security auditor testing corporate networks and finding vulnerability holes.",
      "faction": "Ops",
      "riskBias": 0.4,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.75,
      "financialStake": 0.55,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "AviationSafet",
      "backstory": "Inspector auditing commercial flights, pilot training, and engine logs.",
      "faction": "Regulators",
      "riskBias": 0.98,
      "evidenceDemand": 0.96,
      "clarityNeed": 0.95,
      "noveltySeek": 0.05,
      "financialStake": 0.35,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "BorderPatrolC",
      "backstory": "Security commander managing customs, crossings, and port security protocols.",
      "faction": "Regulators",
      "riskBias": 0.88,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.8,
      "noveltySeek": 0.12,
      "financialStake": 0.4,
      "memoryDecay": 0.15,
      "platform": "facebook"
    },
    {
      "name": "IntelligenceAn",
      "backstory": "Signals intelligence analyst tracking code keys and communication logs.",
      "faction": "Analysts",
      "riskBias": 0.82,
      "evidenceDemand": 0.92,
      "clarityNeed": 0.85,
      "noveltySeek": 0.3,
      "financialStake": 0.3,
      "memoryDecay": 0.06,
      "platform": "hn"
    },
    {
      "name": "IndustrialSec",
      "backstory": "Safety engineer designing failsafes for chemical plants and utility grids.",
      "faction": "Ops",
      "riskBias": 0.9,
      "evidenceDemand": 0.88,
      "clarityNeed": 0.9,
      "noveltySeek": 0.18,
      "financialStake": 0.5,
      "memoryDecay": 0.1,
      "platform": "reddit"
    }
  ],
  "CAPITAL": [
    {
      "name": "HedgeFundMgr",
      "backstory": "Fund manager executing short sales, arbitrage loops, and active hedging.",
      "faction": "Investors",
      "riskBias": 0.4,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.65,
      "financialStake": 0.95,
      "memoryDecay": 0.15,
      "platform": "market"
    },
    {
      "name": "CentralBankPre",
      "backstory": "Monetary chief adjusting liquidity, reserve limits, and interest rates.",
      "faction": "Regulators",
      "riskBias": 0.92,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.92,
      "noveltySeek": 0.08,
      "financialStake": 0.3,
      "memoryDecay": 0.05,
      "platform": "market"
    },
    {
      "name": "SovereignWealth",
      "backstory": "Asset manager investing national surplus reserves in global property and tech.",
      "faction": "Investors",
      "riskBias": 0.65,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.85,
      "noveltySeek": 0.3,
      "financialStake": 0.9,
      "memoryDecay": 0.06,
      "platform": "hn"
    },
    {
      "name": "CryptoVenture",
      "backstory": "Capital partner funding decentralized apps, liquidity pools, and Web3.",
      "faction": "Speculators",
      "riskBias": 0.2,
      "evidenceDemand": 0.4,
      "clarityNeed": 0.45,
      "noveltySeek": 0.98,
      "financialStake": 0.85,
      "memoryDecay": 0.25,
      "platform": "twitter"
    },
    {
      "name": "WealthAdvisor",
      "backstory": "Portfolio manager optimizing trust plans and tax-exempt bond holdings.",
      "faction": "Investors",
      "riskBias": 0.8,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.88,
      "noveltySeek": 0.15,
      "financialStake": 0.8,
      "memoryDecay": 0.1,
      "platform": "reddit"
    },
    {
      "name": "MarxistEcono",
      "backstory": "Academic researching wealth inequality, asset bubbles, and capital loops.",
      "faction": "Academics",
      "riskBias": 0.7,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.8,
      "noveltySeek": 0.35,
      "financialStake": 0.1,
      "memoryDecay": 0.08,
      "platform": "reddit"
    },
    {
      "name": "RetailDayTrad",
      "backstory": "High-frequency momentum trader riding options volumes and squeeze cycles.",
      "faction": "Speculators",
      "riskBias": 0.15,
      "evidenceDemand": 0.3,
      "clarityNeed": 0.35,
      "noveltySeek": 0.9,
      "financialStake": 0.75,
      "memoryDecay": 0.3,
      "platform": "twitter"
    },
    {
      "name": "M_A_Banker",
      "backstory": "Investment banker underwriting corporate mergers, spin-offs, and buyout debt.",
      "faction": "Corporates",
      "riskBias": 0.45,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.75,
      "noveltySeek": 0.55,
      "financialStake": 0.9,
      "memoryDecay": 0.12,
      "platform": "market"
    },
    {
      "name": "IMF_Director",
      "backstory": "Financier structural adjustment terms to debt-stressed sovereign states.",
      "faction": "Regulators",
      "riskBias": 0.85,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.85,
      "noveltySeek": 0.2,
      "financialStake": 0.5,
      "memoryDecay": 0.08,
      "platform": "market"
    },
    {
      "name": "GoldCustodian",
      "backstory": "Bullion broker advising physical gold custody and fiat currency hedge strategies.",
      "faction": "Speculators",
      "riskBias": 0.88,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.8,
      "noveltySeek": 0.12,
      "financialStake": 0.8,
      "memoryDecay": 0.05,
      "platform": "twitter"
    },
    {
      "name": "PrivateEquity",
      "backstory": "Partner restructuring legacy firms to maximize leverage buyouts and exits.",
      "faction": "Investors",
      "riskBias": 0.55,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.7,
      "noveltySeek": 0.4,
      "financialStake": 0.95,
      "memoryDecay": 0.1,
      "platform": "hn"
    },
    {
      "name": "MicrofinanceP",
      "backstory": "Director funding small enterprise microloans in developing economies.",
      "faction": "NGOs",
      "riskBias": 0.5,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.75,
      "noveltySeek": 0.5,
      "financialStake": 0.3,
      "memoryDecay": 0.15,
      "platform": "reddit"
    },
    {
      "name": "AuditPartner",
      "backstory": "Corporate auditor verifying balance sheet integrity and asset valuations.",
      "faction": "Legal",
      "riskBias": 0.95,
      "evidenceDemand": 0.98,
      "clarityNeed": 0.95,
      "noveltySeek": 0.05,
      "financialStake": 0.6,
      "memoryDecay": 0.04,
      "platform": "hn"
    },
    {
      "name": "CommercialLen",
      "backstory": "Underwriter managing commercial real estate loans and asset collateral.",
      "faction": "Investors",
      "riskBias": 0.75,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.85,
      "noveltySeek": 0.22,
      "financialStake": 0.8,
      "memoryDecay": 0.12,
      "platform": "market"
    },
    {
      "name": "VultureCapital",
      "backstory": "Bondholder buying distressed debt of developing countries ahead of litigation.",
      "faction": "Speculators",
      "riskBias": 0.3,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.6,
      "noveltySeek": 0.7,
      "financialStake": 0.95,
      "memoryDecay": 0.18,
      "platform": "market"
    }
  ],
  "LABOR": [
    {
      "name": "UnionPresiden",
      "backstory": "National steelworkers union chief organizing collective bargaining and strikes.",
      "faction": "Labor",
      "riskBias": 0.7,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.8,
      "noveltySeek": 0.25,
      "financialStake": 0.5,
      "memoryDecay": 0.1,
      "platform": "reddit"
    },
    {
      "name": "GigWorkerAdv",
      "backstory": "Advocate demanding minimum wage limits and health benefits for app couriers.",
      "faction": "Labor",
      "riskBias": 0.55,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.75,
      "noveltySeek": 0.6,
      "financialStake": 0.2,
      "memoryDecay": 0.12,
      "platform": "twitter"
    },
    {
      "name": "HRDirector",
      "backstory": "Corporate coordinator managing performance reviews and labor budgets.",
      "faction": "Corporates",
      "riskBias": 0.8,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.85,
      "noveltySeek": 0.2,
      "financialStake": 0.65,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "MigrantWorker",
      "backstory": "Coordinator organizing visa sponsorships for seasonal farming personnel.",
      "faction": "Labor",
      "riskBias": 0.65,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.7,
      "noveltySeek": 0.3,
      "financialStake": 0.4,
      "memoryDecay": 0.15,
      "platform": "facebook"
    },
    {
      "name": "LaborEconomis",
      "backstory": "Researcher studying real wage trends, union density, and automation effects.",
      "faction": "Academics",
      "riskBias": 0.6,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.9,
      "noveltySeek": 0.22,
      "financialStake": 0.3,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "FreelanceBroker",
      "backstory": "Platform recruiter sourcing talent pools in low-cost countries.",
      "faction": "Corporates",
      "riskBias": 0.4,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.6,
      "noveltySeek": 0.75,
      "financialStake": 0.8,
      "memoryDecay": 0.2,
      "platform": "reddit"
    },
    {
      "name": "RoboticsEng",
      "backstory": "System engineer building warehouse sorting robots to replace manual tasks.",
      "faction": "Techies",
      "riskBias": 0.3,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.7,
      "noveltySeek": 0.9,
      "financialStake": 0.7,
      "memoryDecay": 0.14,
      "platform": "twitter"
    },
    {
      "name": "WorkplaceSafet",
      "backstory": "Safety inspector enforcing factory line protection and air quality codes.",
      "faction": "Regulators",
      "riskBias": 0.9,
      "evidenceDemand": 0.88,
      "clarityNeed": 0.92,
      "noveltySeek": 0.1,
      "financialStake": 0.3,
      "memoryDecay": 0.05,
      "platform": "reddit"
    },
    {
      "name": "RemoteWorkAdv",
      "backstory": "Digital nomad campaigner promoting distributed hiring and home office allowances.",
      "faction": "Labor",
      "riskBias": 0.45,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.7,
      "noveltySeek": 0.8,
      "financialStake": 0.45,
      "memoryDecay": 0.15,
      "platform": "twitter"
    },
    {
      "name": "Whistleblower",
      "backstory": "Ex-employee leaking files on corporate wage theft and workplace toxicity.",
      "faction": "Labor",
      "riskBias": 0.6,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.5,
      "financialStake": 0.25,
      "memoryDecay": 0.1,
      "platform": "reddit"
    },
    {
      "name": "WelfareCaseMgr",
      "backstory": "Social worker managing state assistance and retraining plans for job seekers.",
      "faction": "Regulators",
      "riskBias": 0.75,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.8,
      "noveltySeek": 0.18,
      "financialStake": 0.15,
      "memoryDecay": 0.12,
      "platform": "facebook"
    },
    {
      "name": "ExecutiveHead",
      "backstory": "poacher target hunting directors and C-suite talent across industries.",
      "faction": "Corporates",
      "riskBias": 0.35,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.75,
      "noveltySeek": 0.85,
      "financialStake": 0.85,
      "memoryDecay": 0.15,
      "platform": "hn"
    },
    {
      "name": "CooperativeMgr",
      "backstory": "Co-op manager running worker-owned enterprise where pay splits are voted on.",
      "faction": "Labor",
      "riskBias": 0.5,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.75,
      "noveltySeek": 0.55,
      "financialStake": 0.35,
      "memoryDecay": 0.12,
      "platform": "reddit"
    },
    {
      "name": "DisabilitySpe",
      "backstory": "HR consultant helping firms integrate physical and neurodivergent accessibility.",
      "faction": "Regulators",
      "riskBias": 0.82,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.85,
      "noveltySeek": 0.25,
      "financialStake": 0.3,
      "memoryDecay": 0.1,
      "platform": "twitter"
    },
    {
      "name": "TempAgencyDir",
      "backstory": "Supplier of on-demand industrial staff for factories and packing centers.",
      "faction": "Corporates",
      "riskBias": 0.7,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.7,
      "noveltySeek": 0.35,
      "financialStake": 0.8,
      "memoryDecay": 0.18,
      "platform": "market"
    }
  ],
  "CONSUMPTION": [
    {
      "name": "StatusSignaler",
      "backstory": "luxury collector targeting rare pieces, sports cars, and designer brands.",
      "faction": "Shoppers",
      "riskBias": 0.4,
      "evidenceDemand": 0.45,
      "clarityNeed": 0.6,
      "noveltySeek": 0.9,
      "financialStake": 0.9,
      "memoryDecay": 0.2,
      "platform": "reddit"
    },
    {
      "name": "FrugalSaver",
      "backstory": "FIRE community advocate finding bulk prices, coupons, and generic goods.",
      "faction": "Shoppers",
      "riskBias": 0.85,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.85,
      "noveltySeek": 0.12,
      "financialStake": 0.8,
      "memoryDecay": 0.08,
      "platform": "reddit"
    },
    {
      "name": "ConsumerAdvoc",
      "backstory": "Class-action litigator suing food conglomerates for misleading product health claims.",
      "faction": "Regulators",
      "riskBias": 0.75,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.9,
      "noveltySeek": 0.3,
      "financialStake": 0.2,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "EcomMerchant",
      "backstory": "Dropshipper optimizing Facebook ad spend, margins, and supply chain logistics.",
      "faction": "Corporates",
      "riskBias": 0.3,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.55,
      "noveltySeek": 0.85,
      "financialStake": 0.85,
      "memoryDecay": 0.25,
      "platform": "market"
    },
    {
      "name": "Sustainability",
      "backstory": "Green shopper auditing carbon offsets and requesting plastic-free packaging.",
      "faction": "Enthusiasts",
      "riskBias": 0.65,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.7,
      "noveltySeek": 0.55,
      "financialStake": 0.3,
      "memoryDecay": 0.1,
      "platform": "twitter"
    },
    {
      "name": "InfluencerPro",
      "backstory": "Lifestyle creator selling review spots, sponsorships, and viral code links.",
      "faction": "Enthusiasts",
      "riskBias": 0.2,
      "evidenceDemand": 0.35,
      "clarityNeed": 0.4,
      "noveltySeek": 0.92,
      "financialStake": 0.8,
      "memoryDecay": 0.3,
      "platform": "twitter"
    },
    {
      "name": "DealsScraper",
      "backstory": "Developer building web bots to monitor price glitches and sales codes.",
      "faction": "Shoppers",
      "riskBias": 0.45,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.65,
      "noveltySeek": 0.8,
      "financialStake": 0.6,
      "memoryDecay": 0.15,
      "platform": "reddit"
    },
    {
      "name": "MysteryShoppe",
      "backstory": "Auditor testing retail store customer service and placement compliance.",
      "faction": "Corporates",
      "riskBias": 0.7,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.85,
      "noveltySeek": 0.25,
      "financialStake": 0.5,
      "memoryDecay": 0.1,
      "platform": "reddit"
    },
    {
      "name": "CreditCounsel",
      "backstory": "Debt consolidation counselor advising families trapped in compound interest debt.",
      "faction": "Shoppers",
      "riskBias": 0.92,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.92,
      "noveltySeek": 0.05,
      "financialStake": 0.4,
      "memoryDecay": 0.06,
      "platform": "reddit"
    },
    {
      "name": "TrendForecast",
      "backstory": "Agency lead predicting shifts in customer tastes, aesthetics, and themes.",
      "faction": "Corporates",
      "riskBias": 0.5,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.7,
      "noveltySeek": 0.8,
      "financialStake": 0.7,
      "memoryDecay": 0.15,
      "platform": "hn"
    },
    {
      "name": "SubscribMaxim",
      "backstory": "User juggling multiple active streaming, delivery, and SaaS service plans.",
      "faction": "Shoppers",
      "riskBias": 0.55,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.6,
      "noveltySeek": 0.75,
      "financialStake": 0.6,
      "memoryDecay": 0.2,
      "platform": "twitter"
    },
    {
      "name": "RepairAdvocate",
      "backstory": "Right-to-repair campaigner fighting tech obsolescence and locking strategies.",
      "faction": "Enthusiasts",
      "riskBias": 0.6,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.5,
      "financialStake": 0.45,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "WholesaleBuye",
      "backstory": "Costco shopper buying bulk raw items to minimize individual unit costs.",
      "faction": "Shoppers",
      "riskBias": 0.8,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.75,
      "noveltySeek": 0.1,
      "financialStake": 0.75,
      "memoryDecay": 0.15,
      "platform": "facebook"
    },
    {
      "name": "BrandLoyalist",
      "backstory": "Enthusiast defending ecosystem products in tech forums against competitors.",
      "faction": "Enthusiasts",
      "riskBias": 0.35,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.65,
      "noveltySeek": 0.85,
      "financialStake": 0.7,
      "memoryDecay": 0.25,
      "platform": "twitter"
    },
    {
      "name": "Anticonsumeris",
      "backstory": "Activist promoting barter systems, local co-ops, and zero waste lifestyles.",
      "faction": "Shoppers",
      "riskBias": 0.7,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.7,
      "noveltySeek": 0.3,
      "financialStake": 0.15,
      "memoryDecay": 0.12,
      "platform": "reddit"
    }
  ],
  "TECHNOLOGY": [
    {
      "name": "StaffArchitect",
      "backstory": "Design system-first, anti-complexity engineer who rejects buzzwords.",
      "faction": "Architects",
      "riskBias": 0.75,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.95,
      "noveltySeek": 0.15,
      "financialStake": 0.6,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "AIOptimist",
      "backstory": "AI engineer building agents, LLM integrations, and pushing autonomous tech.",
      "faction": "Innovators",
      "riskBias": 0.2,
      "evidenceDemand": 0.45,
      "clarityNeed": 0.4,
      "noveltySeek": 0.98,
      "financialStake": 0.85,
      "memoryDecay": 0.18,
      "platform": "twitter"
    },
    {
      "name": "SiteReliabilit",
      "backstory": "Always preparing for 10x spikes, network partitions, and database corruption.",
      "faction": "Ops",
      "riskBias": 0.92,
      "evidenceDemand": 0.94,
      "clarityNeed": 0.95,
      "noveltySeek": 0.1,
      "financialStake": 0.5,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "Web3Dev",
      "backstory": "Smart contract engineer advocating for gas optimization and crypto custody.",
      "faction": "Innovators",
      "riskBias": 0.3,
      "evidenceDemand": 0.4,
      "clarityNeed": 0.5,
      "noveltySeek": 0.9,
      "financialStake": 0.8,
      "memoryDecay": 0.3,
      "platform": "twitter"
    },
    {
      "name": "CyberSecurity",
      "backstory": "Offensive security expert warning about SQL injection, dependency leaks.",
      "faction": "Ops",
      "riskBias": 0.88,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.85,
      "noveltySeek": 0.25,
      "financialStake": 0.55,
      "memoryDecay": 0.06,
      "platform": "hn"
    },
    {
      "name": "IndieHacker",
      "backstory": "Ships minimal HTML + JS in one weekend to validate if anyone pays money.",
      "faction": "Innovators",
      "riskBias": 0.4,
      "evidenceDemand": 0.55,
      "clarityNeed": 0.5,
      "noveltySeek": 0.8,
      "financialStake": 0.8,
      "memoryDecay": 0.2,
      "platform": "twitter"
    },
    {
      "name": "HardwareGeek",
      "backstory": "Reviews silicon chip yields, memory bus widths, and TPU benchmark reports.",
      "faction": "Architects",
      "riskBias": 0.65,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.85,
      "noveltySeek": 0.35,
      "financialStake": 0.45,
      "memoryDecay": 0.1,
      "platform": "hn"
    },
    {
      "name": "LinuxSysadmin",
      "backstory": "Open source purist who maintains bare-metal setups and hates SaaS bloat.",
      "faction": "Ops",
      "riskBias": 0.82,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.08,
      "financialStake": 0.3,
      "memoryDecay": 0.05,
      "platform": "reddit"
    },
    {
      "name": "DataEngineer",
      "backstory": "Builds ETL pipelines, Apache Spark clusters, and database schemas.",
      "faction": "Architects",
      "riskBias": 0.6,
      "evidenceDemand": 0.88,
      "clarityNeed": 0.9,
      "noveltySeek": 0.3,
      "financialStake": 0.5,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "ProductDesigne",
      "backstory": "Protects user accessibility standards (WCAG) and hates complex UI.",
      "faction": "UX",
      "riskBias": 0.5,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.8,
      "noveltySeek": 0.55,
      "financialStake": 0.4,
      "memoryDecay": 0.12,
      "platform": "discord"
    },
    {
      "name": "BootcampGrad",
      "backstory": "Looking for junior roles, confused by systems details, curious about basics.",
      "faction": "UX",
      "riskBias": 0.45,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.65,
      "noveltySeek": 0.7,
      "financialStake": 0.25,
      "memoryDecay": 0.25,
      "platform": "reddit"
    },
    {
      "name": "FOSSMaintainer",
      "backstory": "Tired of tech giants leeching code without funding maintenance tasks.",
      "faction": "UX",
      "riskBias": 0.7,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.8,
      "noveltySeek": 0.2,
      "financialStake": 0.1,
      "memoryDecay": 0.08,
      "platform": "reddit"
    },
    {
      "name": "CloudFinOps",
      "backstory": "Slashes AWS egress fees and shuts down idle Kubernetes dev clusters.",
      "faction": "Ops",
      "riskBias": 0.78,
      "evidenceDemand": 0.88,
      "clarityNeed": 0.85,
      "noveltySeek": 0.2,
      "financialStake": 0.7,
      "memoryDecay": 0.12,
      "platform": "market"
    },
    {
      "name": "DevOpsLeader",
      "backstory": "Promotes CI/CD, trunk-based deployment, and continuous deployment loops.",
      "faction": "Ops",
      "riskBias": 0.5,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.8,
      "noveltySeek": 0.65,
      "financialStake": 0.55,
      "memoryDecay": 0.15,
      "platform": "reddit"
    },
    {
      "name": "CTO_Scaleup",
      "backstory": "Balances tech debt vs speed-to-market. Cares about engineer throughput.",
      "faction": "Architects",
      "riskBias": 0.55,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.75,
      "noveltySeek": 0.6,
      "financialStake": 0.9,
      "memoryDecay": 0.1,
      "platform": "hn"
    }
  ],
  "ENVIRONMENT": [
    {
      "name": "ClimateModeler",
      "backstory": "IPCC researcher simulating sea level rises, heat maps, and carbon feedback cycles.",
      "faction": "Academics",
      "riskBias": 0.9,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.9,
      "noveltySeek": 0.15,
      "financialStake": 0.1,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "ForestryRanger",
      "backstory": "Conservation worker auditing logging permits and managing brush fires.",
      "faction": "Regulators",
      "riskBias": 0.8,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.8,
      "noveltySeek": 0.2,
      "financialStake": 0.35,
      "memoryDecay": 0.12,
      "platform": "facebook"
    },
    {
      "name": "OilGasExecutive",
      "backstory": "Fossil energy VP securing exploratory leases and refining resource margins.",
      "faction": "Corporates",
      "riskBias": 0.55,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.7,
      "noveltySeek": 0.4,
      "financialStake": 0.95,
      "memoryDecay": 0.1,
      "platform": "market"
    },
    {
      "name": "OffGridHomest",
      "backstory": "Homesteader using greywater capture systems, wood heating, and permaculture.",
      "faction": "Citizens",
      "riskBias": 0.85,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.75,
      "noveltySeek": 0.6,
      "financialStake": 0.7,
      "memoryDecay": 0.08,
      "platform": "reddit"
    },
    {
      "name": "WildlifeBiolog",
      "backstory": "Ecologist mapping migration paths and defending preserve ecosystems.",
      "faction": "Academics",
      "riskBias": 0.7,
      "evidenceDemand": 0.88,
      "clarityNeed": 0.8,
      "noveltySeek": 0.3,
      "financialStake": 0.2,
      "memoryDecay": 0.06,
      "platform": "hn"
    },
    {
      "name": "SolarGridEng",
      "backstory": "Engineer sizing community battery storage and industrial solar panel layouts.",
      "faction": "Techies",
      "riskBias": 0.35,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.7,
      "noveltySeek": 0.85,
      "financialStake": 0.6,
      "memoryDecay": 0.14,
      "platform": "twitter"
    },
    {
      "name": "CarbonOffsetTr",
      "backstory": "Commodities broker auditing carbon capture metrics and trading offset derivatives.",
      "faction": "Corporates",
      "riskBias": 0.45,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.75,
      "noveltySeek": 0.7,
      "financialStake": 0.85,
      "memoryDecay": 0.15,
      "platform": "market"
    },
    {
      "name": "WaterRightsLaw",
      "backstory": "Water allocation litigator managing basin usage rights and crop irrigation boundaries.",
      "faction": "Legal",
      "riskBias": 0.85,
      "evidenceDemand": 0.92,
      "clarityNeed": 0.9,
      "noveltySeek": 0.18,
      "financialStake": 0.75,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "NuclearAdvocat",
      "backstory": "Nuclear engineer proposing modular thorium reactors as a carbon-free base load.",
      "faction": "Techies",
      "riskBias": 0.4,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.8,
      "financialStake": 0.5,
      "memoryDecay": 0.1,
      "platform": "hn"
    },
    {
      "name": "FisheryManager",
      "backstory": "Biologist assessing commercial fish counts and enforcing cod quotas.",
      "faction": "Regulators",
      "riskBias": 0.88,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.2,
      "financialStake": 0.4,
      "memoryDecay": 0.15,
      "platform": "facebook"
    },
    {
      "name": "UrbanEcologist",
      "backstory": "Planner designing sponge city infrastructure and storm-water drainage runs.",
      "faction": "Planners",
      "riskBias": 0.6,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.85,
      "noveltySeek": 0.65,
      "financialStake": 0.45,
      "memoryDecay": 0.12,
      "platform": "hn"
    },
    {
      "name": "MiningProspect",
      "backstory": "Exploration geologist surveying mineral reserves for EV battery scaling.",
      "faction": "Corporates",
      "riskBias": 0.5,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.65,
      "noveltySeek": 0.55,
      "financialStake": 0.9,
      "memoryDecay": 0.18,
      "platform": "market"
    },
    {
      "name": "EnvironmentalG",
      "backstory": "NGO general counsel filing injunctions against chemical dumping sites.",
      "faction": "Activists",
      "riskBias": 0.65,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.5,
      "financialStake": 0.2,
      "memoryDecay": 0.1,
      "platform": "twitter"
    },
    {
      "name": "RecyclingChief",
      "backstory": "Plant manager tracking sorting efficiency metrics and plastic bale values.",
      "faction": "Regulators",
      "riskBias": 0.8,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.75,
      "noveltySeek": 0.3,
      "financialStake": 0.55,
      "memoryDecay": 0.16,
      "platform": "reddit"
    },
    {
      "name": "SurvivalistIns",
      "backstory": "Outdoor expert teaching water filtration, bushcraft, and emergency supply loops.",
      "faction": "Citizens",
      "riskBias": 0.9,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.7,
      "noveltySeek": 0.4,
      "financialStake": 0.65,
      "memoryDecay": 0.08,
      "platform": "reddit"
    }
  ],
  "KNOWLEDGE": [
    {
      "name": "PeerReviewer",
      "backstory": "Scientific referee auditing sample sizes, data methods, and research variables.",
      "faction": "Academics",
      "riskBias": 0.95,
      "evidenceDemand": 0.98,
      "clarityNeed": 0.95,
      "noveltySeek": 0.1,
      "financialStake": 0.2,
      "memoryDecay": 0.03,
      "platform": "hn"
    },
    {
      "name": "LibraryArchiv",
      "backstory": "Digital preservationist defending open-access book indexing and database drops.",
      "faction": "Advisors",
      "riskBias": 0.85,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.85,
      "noveltySeek": 0.2,
      "financialStake": 0.25,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "FactCheckLead",
      "backstory": "Verification editor tagging deceptive charts, fake links, and viral rumors.",
      "faction": "Skeptics",
      "riskBias": 0.88,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.9,
      "noveltySeek": 0.3,
      "financialStake": 0.35,
      "memoryDecay": 0.06,
      "platform": "twitter"
    },
    {
      "name": "DataScientist",
      "backstory": "Statistician building regression equations and cleaning noisy database variables.",
      "faction": "Analysts",
      "riskBias": 0.6,
      "evidenceDemand": 0.88,
      "clarityNeed": 0.9,
      "noveltySeek": 0.6,
      "financialStake": 0.65,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "Epistemologist",
      "backstory": "Philosophy professor diagnosing confirmation biases and systemic filter bubbles.",
      "faction": "Academics",
      "riskBias": 0.7,
      "evidenceDemand": 0.92,
      "clarityNeed": 0.9,
      "noveltySeek": 0.4,
      "financialStake": 0.15,
      "memoryDecay": 0.05,
      "platform": "reddit"
    },
    {
      "name": "InvestigativeJ",
      "backstory": "Reporter verifying database leaks and protecting anonymous whistleblowers.",
      "faction": "Skeptics",
      "riskBias": 0.65,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.85,
      "noveltySeek": 0.45,
      "financialStake": 0.3,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "PatentExaminer",
      "backstory": "State official auditing patent claims for priority, novelty, and utility.",
      "faction": "Regulators",
      "riskBias": 0.95,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.95,
      "noveltySeek": 0.15,
      "financialStake": 0.4,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "ConspiracyDet",
      "backstory": "Amateur researcher scouring public files for anomalies and government coverups.",
      "faction": "Skeptics",
      "riskBias": 0.4,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.5,
      "noveltySeek": 0.85,
      "financialStake": 0.2,
      "memoryDecay": 0.15,
      "platform": "reddit"
    },
    {
      "name": "WikipediaEdito",
      "backstory": "Moderator enforcing citation rules and locking pages during political edit wars.",
      "faction": "Advisors",
      "riskBias": 0.9,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.85,
      "noveltySeek": 0.12,
      "financialStake": 0.1,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "AI_Trainer",
      "backstory": "RLHF contractor labeling text outputs and correcting semantic drift bugs.",
      "faction": "Techies",
      "riskBias": 0.5,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.7,
      "noveltySeek": 0.75,
      "financialStake": 0.5,
      "memoryDecay": 0.14,
      "platform": "reddit"
    },
    {
      "name": "SurveyStatist",
      "backstory": "Demographer weighting polling data to match national census breakdowns.",
      "faction": "Analysts",
      "riskBias": 0.75,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.85,
      "noveltySeek": 0.25,
      "financialStake": 0.45,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "AcademicHIndex",
      "backstory": "Research professor focused on citations, publication loops, and grant panels.",
      "faction": "Academics",
      "riskBias": 0.82,
      "evidenceDemand": 0.88,
      "clarityNeed": 0.8,
      "noveltySeek": 0.3,
      "financialStake": 0.4,
      "memoryDecay": 0.04,
      "platform": "hn"
    },
    {
      "name": "OpenScienceAd",
      "backstory": "Scientist advocating for raw replication data sharing and pre-print hubs.",
      "faction": "Academics",
      "riskBias": 0.6,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.65,
      "financialStake": 0.25,
      "memoryDecay": 0.06,
      "platform": "hn"
    },
    {
      "name": "HistorianMicro",
      "backstory": "Archivist parsing municipal ledgers to reconstruct historical local dynamics.",
      "faction": "Academics",
      "riskBias": 0.78,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.85,
      "noveltySeek": 0.2,
      "financialStake": 0.2,
      "memoryDecay": 0.03,
      "platform": "reddit"
    },
    {
      "name": "IntellectualPr",
      "backstory": "Corporate legal partner defending trade secrets, NDAs, and source licenses.",
      "faction": "Legal",
      "riskBias": 0.9,
      "evidenceDemand": 0.92,
      "clarityNeed": 0.9,
      "noveltySeek": 0.25,
      "financialStake": 0.8,
      "memoryDecay": 0.05,
      "platform": "market"
    }
  ],
  "MEDIA": [
    {
      "name": "PlatformAlgor",
      "backstory": "Feed engineer tweaking recommendation weight variables to optimize retention.",
      "faction": "Techies",
      "riskBias": 0.3,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.6,
      "noveltySeek": 0.95,
      "financialStake": 0.8,
      "memoryDecay": 0.15,
      "platform": "twitter"
    },
    {
      "name": "PR_Strategist",
      "backstory": "Publicist drafting scripts, embargo windows, and crisis statements.",
      "faction": "Influencers",
      "riskBias": 0.5,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.75,
      "noveltySeek": 0.6,
      "financialStake": 0.75,
      "memoryDecay": 0.1,
      "platform": "twitter"
    },
    {
      "name": "ClickbaitEdit",
      "backstory": "Newsroom content lead A/B testing high-converting headline variations.",
      "faction": "Writers",
      "riskBias": 0.35,
      "evidenceDemand": 0.4,
      "clarityNeed": 0.5,
      "noveltySeek": 0.88,
      "financialStake": 0.7,
      "memoryDecay": 0.25,
      "platform": "twitter"
    },
    {
      "name": "InvestigativeR",
      "backstory": "Reporter spending months auditing municipal databases for bribe leaks.",
      "faction": "Writers",
      "riskBias": 0.75,
      "evidenceDemand": 0.96,
      "clarityNeed": 0.85,
      "noveltySeek": 0.2,
      "financialStake": 0.35,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "MemeArchivist",
      "backstory": "Viral poster tracking trend patterns to build mass follower distribution.",
      "faction": "Influencers",
      "riskBias": 0.2,
      "evidenceDemand": 0.3,
      "clarityNeed": 0.4,
      "noveltySeek": 0.98,
      "financialStake": 0.65,
      "memoryDecay": 0.35,
      "platform": "twitter"
    },
    {
      "name": "MediaLobbyist",
      "backstory": "Rep pushing legislation to force platforms to pay for article links.",
      "faction": "Regulators",
      "riskBias": 0.8,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.8,
      "noveltySeek": 0.25,
      "financialStake": 0.85,
      "memoryDecay": 0.12,
      "platform": "market"
    },
    {
      "name": "SubstackModel",
      "backstory": "Analyst writing paid essays and counting active reader conversion rates.",
      "faction": "Writers",
      "riskBias": 0.55,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.6,
      "financialStake": 0.75,
      "memoryDecay": 0.08,
      "platform": "hn"
    },
    {
      "name": "LiveBroadcaster",
      "backstory": "News anchor reporting from active teleprompter lines and wire feeds.",
      "faction": "Writers",
      "riskBias": 0.7,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.8,
      "noveltySeek": 0.35,
      "financialStake": 0.5,
      "memoryDecay": 0.12,
      "platform": "facebook"
    },
    {
      "name": "AdNetworkBroker",
      "backstory": "Programmatic ad buyer running cookie auction bids and banner margins.",
      "faction": "Corporates",
      "riskBias": 0.4,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.65,
      "noveltySeek": 0.75,
      "financialStake": 0.85,
      "memoryDecay": 0.2,
      "platform": "market"
    },
    {
      "name": "CensorshipSpec",
      "backstory": "Safety analyst mapping feed filtering policies and hate indicators.",
      "faction": "Regulators",
      "riskBias": 0.9,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.9,
      "noveltySeek": 0.15,
      "financialStake": 0.45,
      "memoryDecay": 0.08,
      "platform": "twitter"
    },
    {
      "name": "IndiePodcaster",
      "backstory": "Producer scaling audio downloads and reading custom sponsor ads.",
      "faction": "Influencers",
      "riskBias": 0.45,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.65,
      "noveltySeek": 0.75,
      "financialStake": 0.65,
      "memoryDecay": 0.18,
      "platform": "spotify"
    },
    {
      "name": "Photojournalist",
      "backstory": "Freelance shooter capturing high-impact image assets in conflict zones.",
      "faction": "Writers",
      "riskBias": 0.6,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.5,
      "financialStake": 0.4,
      "memoryDecay": 0.1,
      "platform": "twitter"
    },
    {
      "name": "StateMediaProp",
      "backstory": "Host distributing vetted government announcements and patriot loops.",
      "faction": "Politicians",
      "riskBias": 0.85,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.75,
      "noveltySeek": 0.1,
      "financialStake": 0.5,
      "memoryDecay": 0.05,
      "platform": "facebook"
    },
    {
      "name": "AttentionEcon",
      "backstory": "Sociologist researching screen addiction, notifications, and attention spans.",
      "faction": "Academics",
      "riskBias": 0.75,
      "evidenceDemand": 0.9,
      "clarityNeed": 0.85,
      "noveltySeek": 0.3,
      "financialStake": 0.2,
      "memoryDecay": 0.06,
      "platform": "hn"
    },
    {
      "name": "NewsletterCur",
      "backstory": "Editor aggregating daily sector briefs to send to executive subscribers.",
      "faction": "Writers",
      "riskBias": 0.82,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.85,
      "noveltySeek": 0.4,
      "financialStake": 0.6,
      "memoryDecay": 0.1,
      "platform": "hn"
    }
  ],
  "EDUCATION": [
    {
      "name": "AdmissionsDean",
      "backstory": "Admissions director managing legacy applications and standardized SAT filters.",
      "faction": "Institutions",
      "riskBias": 0.85,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.88,
      "noveltySeek": 0.12,
      "financialStake": 0.55,
      "memoryDecay": 0.1,
      "platform": "facebook"
    },
    {
      "name": "BootcampInstru",
      "backstory": "Practical coach training career switchers in React, SQL, and Git pipelines.",
      "faction": "Workers",
      "riskBias": 0.35,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.7,
      "noveltySeek": 0.85,
      "financialStake": 0.75,
      "memoryDecay": 0.14,
      "platform": "reddit"
    },
    {
      "name": "TenuredProf",
      "backstory": "Academic lecturer teaching history courses and reviewing student essays.",
      "faction": "Institutions",
      "riskBias": 0.9,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.9,
      "noveltySeek": 0.1,
      "financialStake": 0.45,
      "memoryDecay": 0.04,
      "platform": "hn"
    },
    {
      "name": "EdTechProduct",
      "backstory": "Product manager scaling gamified courses and subscription conversions.",
      "faction": "Corporates",
      "riskBias": 0.3,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.65,
      "noveltySeek": 0.8,
      "financialStake": 0.8,
      "memoryDecay": 0.16,
      "platform": "twitter"
    },
    {
      "name": "StudentDebtor",
      "backstory": "Graduate auditing career ROI against high federal tuition loan debt.",
      "faction": "Workers",
      "riskBias": 0.75,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.75,
      "noveltySeek": 0.45,
      "financialStake": 0.85,
      "memoryDecay": 0.12,
      "platform": "reddit"
    },
    {
      "name": "PTA_President",
      "backstory": "Parent leader debating curriculum guidelines and district budget rules.",
      "faction": "Citizens",
      "riskBias": 0.8,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.85,
      "noveltySeek": 0.15,
      "financialStake": 0.4,
      "memoryDecay": 0.1,
      "platform": "facebook"
    },
    {
      "name": "PublicSchoolT",
      "backstory": "High school teacher managing large classes, state standards, and tests.",
      "faction": "Workers",
      "riskBias": 0.85,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.8,
      "noveltySeek": 0.2,
      "financialStake": 0.35,
      "memoryDecay": 0.08,
      "platform": "reddit"
    },
    {
      "name": "homeschoolAdv",
      "backstory": "Co-op organizer advocating for personalized parent-guided curricula.",
      "faction": "Citizens",
      "riskBias": 0.65,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.7,
      "noveltySeek": 0.75,
      "financialStake": 0.5,
      "memoryDecay": 0.15,
      "platform": "facebook"
    },
    {
      "name": "SpecialEdSpec",
      "backstory": "Consultant drafting IEP plans and cognitive support accommodations.",
      "faction": "Regulators",
      "riskBias": 0.78,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.85,
      "noveltySeek": 0.3,
      "financialStake": 0.3,
      "memoryDecay": 0.08,
      "platform": "twitter"
    },
    {
      "name": "UniChancellor",
      "backstory": "University executive managing capital endowments and campus infrastructure.",
      "faction": "Institutions",
      "riskBias": 0.82,
      "evidenceDemand": 0.88,
      "clarityNeed": 0.85,
      "noveltySeek": 0.25,
      "financialStake": 0.7,
      "memoryDecay": 0.06,
      "platform": "hn"
    },
    {
      "name": "VocationalDire",
      "backstory": "principal managing trade programs for electricians and welders.",
      "faction": "Workers",
      "riskBias": 0.7,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.8,
      "noveltySeek": 0.3,
      "financialStake": 0.65,
      "memoryDecay": 0.12,
      "platform": "reddit"
    },
    {
      "name": "ResearchFellow",
      "backstory": "Postdoctoral researcher applying for NIH grants and academic placements.",
      "faction": "Institutions",
      "riskBias": 0.75,
      "evidenceDemand": 0.92,
      "clarityNeed": 0.85,
      "noveltySeek": 0.4,
      "financialStake": 0.25,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "StandardTestD",
      "backstory": "Psychometrician designing standardized tests and normalization scales.",
      "faction": "Regulators",
      "riskBias": 0.92,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.95,
      "noveltySeek": 0.08,
      "financialStake": 0.45,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "LiteracyVolunt",
      "backstory": "NGO director running reading classes in low-income housing zones.",
      "faction": "NGOs",
      "riskBias": 0.5,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.7,
      "noveltySeek": 0.5,
      "financialStake": 0.15,
      "memoryDecay": 0.1,
      "platform": "facebook"
    },
    {
      "name": "LibraryCurator",
      "backstory": "Academic archivist buying text database licenses and managing stacks.",
      "faction": "Institutions",
      "riskBias": 0.88,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.9,
      "noveltySeek": 0.15,
      "financialStake": 0.3,
      "memoryDecay": 0.08,
      "platform": "hn"
    }
  ],
  "CULTURE": [
    {
      "name": "FineArtCurator",
      "backstory": "Museum director designing collection displays and catalog layouts.",
      "faction": "Artists",
      "riskBias": 0.7,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.4,
      "financialStake": 0.55,
      "memoryDecay": 0.06,
      "platform": "hn"
    },
    {
      "name": "SubcultureLead",
      "backstory": "underground promoter printing zines and organizing indie band shows.",
      "faction": "Artists",
      "riskBias": 0.3,
      "evidenceDemand": 0.45,
      "clarityNeed": 0.5,
      "noveltySeek": 0.92,
      "financialStake": 0.4,
      "memoryDecay": 0.18,
      "platform": "reddit"
    },
    {
      "name": "TradHeritage",
      "backstory": "Archivist recording oral histories, local dialects, and traditional folk crafts.",
      "faction": "Citizens",
      "riskBias": 0.9,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.85,
      "noveltySeek": 0.08,
      "financialStake": 0.3,
      "memoryDecay": 0.05,
      "platform": "facebook"
    },
    {
      "name": "AvantGardeDes",
      "backstory": "Fashion designer creating conceptual structures for gallery displays.",
      "faction": "Artists",
      "riskBias": 0.2,
      "evidenceDemand": 0.3,
      "clarityNeed": 0.35,
      "noveltySeek": 0.98,
      "financialStake": 0.5,
      "memoryDecay": 0.22,
      "platform": "facebook"
    },
    {
      "name": "CultureWarP",
      "backstory": "Commentator debating identity issues, speech boundaries, and heritage.",
      "faction": "Politicians",
      "riskBias": 0.45,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.6,
      "noveltySeek": 0.85,
      "financialStake": 0.6,
      "memoryDecay": 0.12,
      "platform": "twitter"
    },
    {
      "name": "CommunityOrgan",
      "backstory": "Activist funding municipal murals and organizing local art fairs.",
      "faction": "Citizens",
      "riskBias": 0.55,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.7,
      "noveltySeek": 0.65,
      "financialStake": 0.2,
      "memoryDecay": 0.1,
      "platform": "facebook"
    },
    {
      "name": "StreetArtist",
      "backstory": "Stencil painter placing murals on urban walls to reclaim concrete space.",
      "faction": "Artists",
      "riskBias": 0.25,
      "evidenceDemand": 0.4,
      "clarityNeed": 0.45,
      "noveltySeek": 0.95,
      "financialStake": 0.15,
      "memoryDecay": 0.15,
      "platform": "twitter"
    },
    {
      "name": "PopMusicCritic",
      "backstory": "Journalist reviewing track releases, stream charts, and genre loops.",
      "faction": "Writers",
      "riskBias": 0.6,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.75,
      "noveltySeek": 0.7,
      "financialStake": 0.45,
      "memoryDecay": 0.08,
      "platform": "pitchfork"
    },
    {
      "name": "HeritagePreser",
      "backstory": "Architect filing historic property protections against high-rise developers.",
      "faction": "Citizens",
      "riskBias": 0.85,
      "evidenceDemand": 0.88,
      "clarityNeed": 0.85,
      "noveltySeek": 0.12,
      "financialStake": 0.5,
      "memoryDecay": 0.06,
      "platform": "facebook"
    },
    {
      "name": "CosplayCreto",
      "backstory": "Maker constructing intricate replica suits for gaming conventions.",
      "faction": "Artists",
      "riskBias": 0.35,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.65,
      "noveltySeek": 0.8,
      "financialStake": 0.55,
      "memoryDecay": 0.14,
      "platform": "reddit"
    },
    {
      "name": "IndieFilmDir",
      "backstory": "Director funding arthouse projects through local grants and seed loops.",
      "faction": "Artists",
      "riskBias": 0.5,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.7,
      "noveltySeek": 0.75,
      "financialStake": 0.65,
      "memoryDecay": 0.12,
      "platform": "twitter"
    },
    {
      "name": "LinguisticP",
      "backstory": "Lexicographer monitoring slang trends to compile dictionary revisions.",
      "faction": "Writers",
      "riskBias": 0.88,
      "evidenceDemand": 0.92,
      "clarityNeed": 0.9,
      "noveltySeek": 0.18,
      "financialStake": 0.3,
      "memoryDecay": 0.04,
      "platform": "hn"
    },
    {
      "name": "FoodHistorian",
      "backstory": "Culinary researcher documenting recipe lineage and spice route maps.",
      "faction": "Writers",
      "riskBias": 0.8,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.85,
      "noveltySeek": 0.25,
      "financialStake": 0.4,
      "memoryDecay": 0.05,
      "platform": "reddit"
    },
    {
      "name": "MuseumTrustee",
      "backstory": "Donor providing endowment assets to secure gallery naming rights.",
      "faction": "Investors",
      "riskBias": 0.72,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.8,
      "noveltySeek": 0.3,
      "financialStake": 0.9,
      "memoryDecay": 0.08,
      "platform": "market"
    },
    {
      "name": "IdentityLawye",
      "backstory": "Civil rights litigator defending tribal sovereignty and cultural claims.",
      "faction": "Legal",
      "riskBias": 0.65,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.8,
      "noveltySeek": 0.5,
      "financialStake": 0.35,
      "memoryDecay": 0.1,
      "platform": "twitter"
    }
  ],
  "COMMUNITY": [
    {
      "name": "NeighborhoodL",
      "backstory": "HOA president auditing lawn rules, parking codes, and exterior colors.",
      "faction": "Citizens",
      "riskBias": 0.92,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.9,
      "noveltySeek": 0.08,
      "financialStake": 0.7,
      "memoryDecay": 0.1,
      "platform": "facebook"
    },
    {
      "name": "LocalPastor",
      "backstory": "Spiritual coordinator organizing community aid and youth groups.",
      "faction": "Citizens",
      "riskBias": 0.75,
      "evidenceDemand": 0.65,
      "clarityNeed": 0.75,
      "noveltySeek": 0.2,
      "financialStake": 0.3,
      "memoryDecay": 0.08,
      "platform": "facebook"
    },
    {
      "name": "CoHousingCo",
      "backstory": "Founder organizing collective kitchen and garden spaces in land trust.",
      "faction": "Citizens",
      "riskBias": 0.55,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.7,
      "noveltySeek": 0.75,
      "financialStake": 0.65,
      "memoryDecay": 0.12,
      "platform": "reddit"
    },
    {
      "name": "FamilyMediato",
      "backstory": "Counselor resolving sibling disputes over probate terms and care.",
      "faction": "Advisors",
      "riskBias": 0.8,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.85,
      "noveltySeek": 0.15,
      "financialStake": 0.4,
      "memoryDecay": 0.05,
      "platform": "facebook"
    },
    {
      "name": "SpiritualGuid",
      "backstory": "Meditation instructor guiding breathing exercises and digital detox retreats.",
      "faction": "Advisors",
      "riskBias": 0.6,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.6,
      "noveltySeek": 0.7,
      "financialStake": 0.2,
      "memoryDecay": 0.15,
      "platform": "reddit"
    },
    {
      "name": "MutAidOrganiz",
      "backstory": "Activists keeping community fridges filled and tool libraries running.",
      "faction": "Citizens",
      "riskBias": 0.4,
      "evidenceDemand": 0.55,
      "clarityNeed": 0.65,
      "noveltySeek": 0.85,
      "financialStake": 0.15,
      "memoryDecay": 0.1,
      "platform": "reddit"
    },
    {
      "name": "YouthClubLead",
      "backstory": "Organizer running local sports clubs and tutoring programs.",
      "faction": "Citizens",
      "riskBias": 0.7,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.7,
      "noveltySeek": 0.35,
      "financialStake": 0.3,
      "memoryDecay": 0.12,
      "platform": "facebook"
    },
    {
      "name": "ElderlySupport",
      "backstory": "Social worker arranging home care slots and health coordination.",
      "faction": "Advisors",
      "riskBias": 0.82,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.85,
      "noveltySeek": 0.18,
      "financialStake": 0.25,
      "memoryDecay": 0.08,
      "platform": "facebook"
    },
    {
      "name": "DecentralizedC",
      "backstory": "Server admin coordinating community bots and logging policy breaches.",
      "faction": "Techies",
      "riskBias": 0.35,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.65,
      "noveltySeek": 0.8,
      "financialStake": 0.4,
      "memoryDecay": 0.15,
      "platform": "discord"
    },
    {
      "name": "TradGrandparen",
      "backstory": "Family elder passing down generational recipes and oral histories.",
      "faction": "Citizens",
      "riskBias": 0.88,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.8,
      "noveltySeek": 0.1,
      "financialStake": 0.5,
      "memoryDecay": 0.04,
      "platform": "facebook"
    },
    {
      "name": "LGBTQ_Advocat",
      "backstory": "Campaign coordinator building support systems and municipal pride schedules.",
      "faction": "Citizens",
      "riskBias": 0.5,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.75,
      "noveltySeek": 0.7,
      "financialStake": 0.2,
      "memoryDecay": 0.1,
      "platform": "twitter"
    },
    {
      "name": "FosterParent",
      "backstory": "Guardian providing temporary homes for children in system emergency.",
      "faction": "Citizens",
      "riskBias": 0.78,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.8,
      "noveltySeek": 0.3,
      "financialStake": 0.4,
      "memoryDecay": 0.08,
      "platform": "facebook"
    },
    {
      "name": "BlockPartyHost",
      "backstory": "Neighbor coordinating seasonal block parties and local email lists.",
      "faction": "Citizens",
      "riskBias": 0.65,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.7,
      "noveltySeek": 0.45,
      "financialStake": 0.35,
      "memoryDecay": 0.12,
      "platform": "facebook"
    },
    {
      "name": "GriefCounsel",
      "backstory": "Therapist specializing in family bereavement groups and trauma aid.",
      "faction": "Advisors",
      "riskBias": 0.85,
      "evidenceDemand": 0.82,
      "clarityNeed": 0.85,
      "noveltySeek": 0.2,
      "financialStake": 0.3,
      "memoryDecay": 0.06,
      "platform": "facebook"
    },
    {
      "name": "CharityBoardM",
      "backstory": "Philanthropy director running fundraisers for local homeless shelters.",
      "faction": "Citizens",
      "riskBias": 0.7,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.8,
      "noveltySeek": 0.35,
      "financialStake": 0.5,
      "memoryDecay": 0.1,
      "platform": "facebook"
    }
  ],
  "ENTERTAINMENT": [
    {
      "name": "StreamerGamer",
      "backstory": "A professional live streamer playing competitive games and reacting to internet drama.",
      "faction": "Creators",
      "riskBias": 0.4,
      "evidenceDemand": 0.3,
      "clarityNeed": 0.4,
      "noveltySeek": 0.9,
      "financialStake": 0.7,
      "memoryDecay": 0.25,
      "platform": "discord"
    },
    {
      "name": "MovieCritic",
      "backstory": "A film writer reviewing cinema releases and streaming platforms.",
      "faction": "Writers",
      "riskBias": 0.7,
      "evidenceDemand": 0.85,
      "clarityNeed": 0.75,
      "noveltySeek": 0.6,
      "financialStake": 0.4,
      "memoryDecay": 0.1,
      "platform": "twitter"
    },
    {
      "name": "IndieMusician",
      "backstory": "A singer-songwriter distributing music independently and protesting streaming royalties.",
      "faction": "Artists",
      "riskBias": 0.5,
      "evidenceDemand": 0.6,
      "clarityNeed": 0.7,
      "noveltySeek": 0.8,
      "financialStake": 0.2,
      "memoryDecay": 0.15,
      "platform": "twitter"
    },
    {
      "name": "TalentAgent",
      "backstory": "A representative pitching actors and influencers for corporate sponsorship.",
      "faction": "Corporates",
      "riskBias": 0.3,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.5,
      "noveltySeek": 0.7,
      "financialStake": 0.9,
      "memoryDecay": 0.2,
      "platform": "market"
    },
    {
      "name": "EsportsPro",
      "backstory": "A competitive game player advocating for tournament funding and game balance updates.",
      "faction": "Techies",
      "riskBias": 0.35,
      "evidenceDemand": 0.4,
      "clarityNeed": 0.5,
      "noveltySeek": 0.85,
      "financialStake": 0.5,
      "memoryDecay": 0.2,
      "platform": "discord"
    },
    {
      "name": "ConcertPromot",
      "backstory": "An event organizer managing tickets, venues, and festival security.",
      "faction": "Speculators",
      "riskBias": 0.2,
      "evidenceDemand": 0.4,
      "clarityNeed": 0.45,
      "noveltySeek": 0.8,
      "financialStake": 0.95,
      "memoryDecay": 0.15,
      "platform": "facebook"
    },
    {
      "name": "VfxArtist",
      "backstory": "A digital animator working long hours on superhero movie visual effects.",
      "faction": "Artists",
      "riskBias": 0.6,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.8,
      "noveltySeek": 0.7,
      "financialStake": 0.5,
      "memoryDecay": 0.12,
      "platform": "hn"
    },
    {
      "name": "RealityStar",
      "backstory": "A television personality maintaining public interest through brand sponsorships and gossip.",
      "faction": "Public",
      "riskBias": 0.25,
      "evidenceDemand": 0.3,
      "clarityNeed": 0.4,
      "noveltySeek": 0.95,
      "financialStake": 0.85,
      "memoryDecay": 0.3,
      "platform": "twitter"
    },
    {
      "name": "CopyrightAtt",
      "backstory": "A lawyer defending studio assets and enforcing digital copyright takedowns.",
      "faction": "Legal",
      "riskBias": 0.95,
      "evidenceDemand": 0.95,
      "clarityNeed": 0.95,
      "noveltySeek": 0.1,
      "financialStake": 0.6,
      "memoryDecay": 0.05,
      "platform": "hn"
    },
    {
      "name": "FandomLeader",
      "backstory": "A fan club admin coordinating massive voting campaigns for award shows.",
      "faction": "Citizens",
      "riskBias": 0.45,
      "evidenceDemand": 0.5,
      "clarityNeed": 0.6,
      "noveltySeek": 0.85,
      "financialStake": 0.1,
      "memoryDecay": 0.15,
      "platform": "reddit"
    },
    {
      "name": "PodcastHost",
      "backstory": "An interviewer running a popular weekly podcast discussing tech and culture.",
      "faction": "Media",
      "riskBias": 0.55,
      "evidenceDemand": 0.75,
      "clarityNeed": 0.7,
      "noveltySeek": 0.75,
      "financialStake": 0.6,
      "memoryDecay": 0.1,
      "platform": "hn"
    },
    {
      "name": "TheaterOwner",
      "backstory": "An independent venue operator trying to keep physical stage plays viable.",
      "faction": "Consumers",
      "riskBias": 0.8,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.85,
      "noveltySeek": 0.2,
      "financialStake": 0.7,
      "memoryDecay": 0.12,
      "platform": "facebook"
    },
    {
      "name": "GamerParent",
      "backstory": "A parent concerned about online safety, microtransactions, and screen time limits.",
      "faction": "Consumers",
      "riskBias": 0.85,
      "evidenceDemand": 0.7,
      "clarityNeed": 0.8,
      "noveltySeek": 0.15,
      "financialStake": 0.4,
      "memoryDecay": 0.1,
      "platform": "facebook"
    },
    {
      "name": "SubscripMaxim",
      "backstory": "A streaming service product manager optimizing churn rates and subscription tier prices.",
      "faction": "Corporates",
      "riskBias": 0.4,
      "evidenceDemand": 0.8,
      "clarityNeed": 0.7,
      "noveltySeek": 0.65,
      "financialStake": 0.85,
      "memoryDecay": 0.12,
      "platform": "market"
    },
    {
      "name": "StandUpComed",
      "backstory": "A touring comedian testing jokes about current events and cancel culture.",
      "faction": "Creators",
      "riskBias": 0.35,
      "evidenceDemand": 0.4,
      "clarityNeed": 0.5,
      "noveltySeek": 0.9,
      "financialStake": 0.5,
      "memoryDecay": 0.18,
      "platform": "twitter"
    }
  ]
};

// --- Combined MemTrace Archetypes (Programmatically populated with the 15 fallback ones) ---
export const MEMTRACE_DOMAINS = {};
for (const [domain, specificPool] of Object.entries(SPECIFIC_DOMAINS)) {
  // Pad the specific pool with PSEUDO_ARCHETYPES to make exactly 30 archetypes
  const needed = 30 - specificPool.length;
  let pool = [...specificPool];
  if (needed > 0) {
    pool = [...pool, ...PSEUDO_ARCHETYPES.slice(0, needed)];
  }
  // Now, let's enrich all 30 elements in the pool
  MEMTRACE_DOMAINS[domain] = pool.map((a, index) => {
    // Clone to avoid mutating original objects if shared
    const enriched = { ...a };

    // Hash-based deterministic fallback generator for specific archetypes
    let hash = 0;
    const str = enriched.name || 'agent';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    hash = Math.abs(hash);

    const ages = [23, 29, 34, 42, 48, 55, 62, 67, 71];
    const genders = ['Male', 'Female', 'Non-binary'];
    const regions = ['United States', 'Nigeria', 'Japan', 'Brazil', 'South Africa', 'United Kingdom', 'India', 'Canada', 'Australia'];
    const imprints = [
      "Witnessed the market collapse of 2008 firsthand.",
      "Lost their savings in an early technology startup bubble.",
      "Raised in a rural community affected by industrial pollution.",
      "Managed a local charity during a major policy shift.",
      "Spent years teaching students during a time of extreme social reform.",
      "Developed early software that was open-sourced without compensation.",
      "Experienced housing instability due to regulatory shifts.",
      "Faced layoffs during a corporate automation initiative.",
      "Helped rebuild community infrastructure after a devastating climate event."
    ];

    if (!enriched.age) enriched.age = ages[hash % ages.length];
    if (!enriched.gender) enriched.gender = genders[hash % genders.length];
    if (!enriched.region) enriched.region = regions[hash % regions.length];
    if (!enriched.pseudoName) {
      const handle = enriched.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
      enriched.pseudoName = `@${handle}_${hash % 99}`;
    }
    const imprint = imprints[hash % imprints.length] + " Formative experiences shape their deep suspicion or faith in centralized solutions.";
    enriched.backstory = `${enriched.backstory || ''} Formative memory: ${imprint}`.trim();
    return enriched;
  });
}

// --- Prefix mappings now merged into DOMAINS ---

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const normalizeText = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

function hashString(input) {
  const str = String(input ?? '');
  let hash = 5381;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash >>> 0);
}

function stableId(...parts) {
  const raw = parts.map((p) => String(p ?? '')).join('|');
  return `branch-${hashString(raw).toString(36)}`;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(items) {
  return [...new Set(safeArray(items).map((item) => String(item).trim()).filter(Boolean))];
}

/**
 * Computes a lightweight TF-like cosine similarity between two strings.
 * This does not require any external ML libraries (no Xenova/Transformers).
 */
function textCosineSimilarity(textA, textB) {
  if (!textA || !textB) return 0;
  
  const getTokens = (t) => t.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const tokensA = getTokens(textA);
  const tokensB = getTokens(textB);
  
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  
  const freqA = {};
  const freqB = {};
  const allTokens = new Set([...tokensA, ...tokensB]);
  
  tokensA.forEach(t => freqA[t] = (freqA[t] || 0) + 1);
  tokensB.forEach(t => freqB[t] = (freqB[t] || 0) + 1);
  
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;
  
  allTokens.forEach(t => {
    const a = freqA[t] || 0;
    const b = freqB[t] || 0;
    dotProduct += a * b;
    magA += a * a;
    magB += b * b;
  });
  
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  
  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
}

// -----------------------------------------------------------------------------
// Canonical scenario normalization
// -----------------------------------------------------------------------------
function normalizeScenario(input = {}, personas = [], evidenceProfile = {}, settings = {}) {
  const scenario = isObject(input) ? input : {};
  return {
    domain: normalizeText(scenario.domain || settings.domain || 'general'),
    query: String(scenario.query || scenario.prompt || settings.query || '').trim(),
    objective: normalizeText(scenario.objective || scenario.goal || settings.objective || 'optimize'),
    comparisonMode: Boolean(scenario.comparisonMode || settings.comparisonMode || false),
    branchCount: clamp(Math.round(toNumber(scenario.branchCount ?? settings.branchCount ?? 5, 5)), 3, 8),
    timeHorizon: normalizeText(scenario.timeHorizon || settings.timeHorizon || 'medium'),
    riskTolerance: clamp(toNumber(scenario.riskTolerance ?? settings.riskTolerance ?? 50, 50), 0, 100),
    decisionUrgency: clamp(toNumber(scenario.decisionUrgency ?? settings.decisionUrgency ?? 50, 50), 0, 100),
    constraints: uniqueStrings([
      ...(Array.isArray(scenario.constraints) ? scenario.constraints : []),
      ...(Array.isArray(settings.constraints) ? settings.constraints : [])
    ]),
    entities: safeArray(scenario.entities).length ? safeArray(scenario.entities) : safeArray(settings.entities),
    personas: safeArray(personas),
    evidenceProfile: isObject(evidenceProfile) ? evidenceProfile : {},
    raw: scenario
  };
}

// -----------------------------------------------------------------------------
// Universal pressures (World State)
// -----------------------------------------------------------------------------
function extractEvidenceSignals(evidenceProfile = {}, scenario = {}) {
  const summary = evidenceProfile?.summary || {};
  return {
    volatility: clamp(toNumber(summary.uncertainty ?? evidenceProfile.volatility ?? scenario.volatility ?? 50, 50), 0, 100),
    scarcity: clamp(toNumber(summary.risk ?? evidenceProfile.scarcity ?? scenario.scarcity ?? 50, 50), 0, 100),
    complexity: clamp(toNumber(summary.complexity ?? evidenceProfile.complexity ?? scenario.complexity ?? 50, 50), 0, 100),
    urgency: clamp(toNumber(summary.urgency ?? evidenceProfile.urgency ?? scenario.urgency ?? 50, 50), 0, 100),
    uncertainty: clamp(toNumber(summary.uncertainty ?? evidenceProfile.uncertainty ?? scenario.uncertainty ?? 50, 50), 0, 100),
    coupling: clamp(toNumber(summary.coupling ?? evidenceProfile.coupling ?? scenario.coupling ?? 50, 50), 0, 100),
    switchingCost: clamp(toNumber(summary.switchingCost ?? evidenceProfile.switchingCost ?? scenario.switchingCost ?? 50, 50), 0, 100),
    informationQuality: clamp(toNumber(summary.informationQuality ?? evidenceProfile.informationQuality ?? scenario.informationQuality ?? 50, 50), 0, 100)
  };
}

function evaluateWorldState(scenario = {}, evidenceProfile = {}, settings = {}) {
  const signals = extractEvidenceSignals(evidenceProfile, scenario);
  const domainModifiers = isObject(settings.domainModifiers) ? settings.domainModifiers : {};
  return {
    volatility: clamp(signals.volatility + toNumber(domainModifiers.volatility, 0), 0, 100),
    scarcity: clamp(signals.scarcity + toNumber(domainModifiers.scarcity, 0), 0, 100),
    complexity: clamp(signals.complexity + toNumber(domainModifiers.complexity, 0), 0, 100),
    urgency: clamp(signals.urgency + toNumber(domainModifiers.urgency, 0), 0, 100),
    uncertainty: clamp(signals.uncertainty + toNumber(domainModifiers.uncertainty, 0), 0, 100),
    coupling: clamp(signals.coupling + toNumber(domainModifiers.coupling, 0), 0, 100),
    switchingCost: clamp(signals.switchingCost + toNumber(domainModifiers.switchingCost, 0), 0, 100),
    informationQuality: clamp(signals.informationQuality + toNumber(domainModifiers.informationQuality, 0), 0, 100)
  };
}

// -----------------------------------------------------------------------------
// Objective lens
// -----------------------------------------------------------------------------
function getObjectiveWeights(scenario = {}, settings = {}) {
  const objective = normalizeText(scenario.objective || settings.objective || 'optimize');
  const riskTolerance = clamp(toNumber(scenario.riskTolerance ?? settings.riskTolerance ?? 50, 50), 0, 100);

  const base = { speed: 1, safety: 1, upside: 1, flexibility: 1, efficiency: 1, evidence: 1 };
  
  // Try hard keyword matching first
  let intentClass = 'decide';
  if (objective.match(/\b(avoid|safety|protect|guard|risk)\b/)) intentClass = 'protect';
  else if (objective.match(/\b(grow|maximize|win|capture|scale)\b/)) intentClass = 'grow';
  else if (objective.match(/\b(learn|test|understand|explore|prove)\b/)) intentClass = 'learn';
  else if (objective.match(/\b(optimize|improve|efficient|streamline)\b/)) intentClass = 'optimize';
  else {
    // If no keyword match, use our simple cosine similarity against intent prototypes
    const query = (scenario.query || objective || '').toLowerCase();
    const scores = {
      protect: textCosineSimilarity(query, 'protect avoid danger risk safe guard secure mitigate'),
      grow: textCosineSimilarity(query, 'grow maximize win capture scale expand profit return'),
      learn: textCosineSimilarity(query, 'learn test understand explore prove discover research pilot'),
      optimize: textCosineSimilarity(query, 'optimize improve efficient streamline cost faster better tweak')
    };
    let best = 0;
    for (const [intent, score] of Object.entries(scores)) {
      if (score > best && score > 0.1) {
        best = score;
        intentClass = intent;
      }
    }
  }

  if (intentClass === 'protect') {
    base.safety = 1.6; base.upside = 0.8; base.speed = 0.9;
  } else if (intentClass === 'grow') {
    base.upside = 1.5; base.speed = 1.2; base.safety = 0.9;
  } else if (intentClass === 'learn') {
    base.evidence = 1.6; base.flexibility = 1.3; base.speed = 1; base.upside = 0.9;
  } else if (intentClass === 'optimize') {
    base.efficiency = 1.5; base.evidence = 1.2;
  }

  if (riskTolerance >= 70) { base.upside += 0.2; base.safety -= 0.1; }
  else if (riskTolerance <= 30) { base.safety += 0.3; base.upside -= 0.2; }

  return base;
}

// -----------------------------------------------------------------------------
// Universal strategy library
// -----------------------------------------------------------------------------
function getBaseStrategies() {
  return [
    {
      key: 'observe', label: 'for Clarity',
      description: 'Hold position while collecting better evidence and letting the environment stabilize.',
      sensitivity: { volatility: 0.8, scarcity: 0.3, complexity: 0.6, urgency: 0.2, uncertainty: 0.9 },
      benefits: ['reduces regret', 'preserves flexibility'],
      failureModes: ['missed window', 'passive drift']
    },
    {
      key: 'pilot', label: 'with a Pilot',
      description: 'Test the idea in a constrained setting before committing major resources.',
      sensitivity: { volatility: 0.7, scarcity: 0.5, complexity: 0.6, urgency: 0.5, uncertainty: 0.8 },
      benefits: ['learns quickly', 'limits downside'],
      failureModes: ['false negatives', 'underpowered test']
    },
    {
      key: 'optimize', label: 'Iteratively',
      description: 'Improve the existing setup by removing bottlenecks and increasing efficiency.',
      sensitivity: { volatility: 0.4, scarcity: 0.8, complexity: 0.7, urgency: 0.5, uncertainty: 0.4 },
      benefits: ['higher efficiency', 'incremental gains'],
      failureModes: ['local maximum', 'overfitting current state']
    },
    {
      key: 'diversify', label: 'with Allies',
      description: 'Spread risk across alternatives so no single shock dominates the outcome.',
      sensitivity: { volatility: 0.9, scarcity: 0.6, complexity: 0.7, urgency: 0.4, uncertainty: 0.7 },
      benefits: ['risk reduction', 'resilience'],
      failureModes: ['higher coordination cost', 'fragmentation']
    },
    {
      key: 'commit', label: 'Immediately',
      description: 'Move forward strongly when speed and clarity outweigh the cost of waiting.',
      sensitivity: { volatility: 0.5, scarcity: 0.6, complexity: 0.3, urgency: 0.9, uncertainty: 0.4 },
      benefits: ['speed', 'momentum'],
      failureModes: ['overcommitment', 'inflexibility']
    },
    {
      key: 'sequence', label: 'in Stages',
      description: 'Break the decision into stages so each step reduces the uncertainty of the next.',
      sensitivity: { volatility: 0.6, scarcity: 0.5, complexity: 0.9, urgency: 0.6, uncertainty: 0.8 },
      benefits: ['manages complexity', 'preserves options'],
      failureModes: ['slow execution', 'stage lock-in']
    },
    {
      key: 'hedge', label: 'via Advisors',
      description: 'Use offsets, buffers, redundancies, or contingencies to soften adverse outcomes.',
      sensitivity: { volatility: 0.9, scarcity: 0.5, complexity: 0.6, urgency: 0.5, uncertainty: 0.7 },
      benefits: ['lower downside', 'shock absorption'],
      failureModes: ['cost drag', 'reduced upside']
    },
    {
      key: 'reframe', label: 'Completely',
      description: 'Change the decision frame so the hidden objective or constraint becomes visible.',
      sensitivity: { volatility: 0.4, scarcity: 0.4, complexity: 0.9, urgency: 0.4, uncertainty: 0.8 },
      benefits: ['reveals alternatives', 'reduces false tradeoffs'],
      failureModes: ['analysis delay', 'moving target']
    }
  ];
}

// -----------------------------------------------------------------------------
// Simulation and scoring
// -----------------------------------------------------------------------------
function simulateBranch(strategy, state, objectiveWeights, scenario, settings = {}) {
  const shockCount = clamp(Math.round(toNumber(settings.simulationRuns ?? 200, 200)), 25, 2000);

  const baseUpfront = 55
    + (strategy.sensitivity.urgency * state.urgency * 0.05)
    + (strategy.sensitivity.uncertainty * state.uncertainty * 0.05)
    - (strategy.sensitivity.volatility * state.volatility * 0.05)
    - (strategy.sensitivity.scarcity * state.scarcity * 0.05);

  const riskPenalty = (state.volatility * 0.25) + (state.scarcity * 0.2) + (state.coupling * 0.15) 
    + (state.switchingCost * 0.1) - (state.informationQuality * 0.2);

  const objectiveBoost = (objectiveWeights.upside * 4) + (objectiveWeights.speed * 2) 
    + (objectiveWeights.efficiency * 2) - (objectiveWeights.safety * 2);

  // Cosine similarity boost: does the user's query structurally align with the strategy's core thesis?
  const semanticAlignment = textCosineSimilarity(scenario.query || scenario.objective, strategy.description) * 10;

  const samples = [];
  for (let i = 0; i < shockCount; i += 1) {
    const deterministicShock = (((i * 37) % 100) / 100 - 0.5) * (state.volatility / 50) * 10;
    const sample = clamp(baseUpfront + objectiveBoost + semanticAlignment + deterministicShock - riskPenalty, 0, 100);
    samples.push(sample);
  }

  const mean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
  const variance = samples.reduce((sum, x) => sum + (x - mean) ** 2, 0) / samples.length;
  return {
    expectedScore: round(mean, 2),
    uncertainty: round(Math.sqrt(variance), 2),
    minScore: round(Math.min(...samples), 2),
    maxScore: round(Math.max(...samples), 2),
  };
}

function buildBranchFromStrategy({ strategy, index, scenario, state, objectiveWeights, prefix, settings }) {
  const simulation = simulateBranch(strategy, state, objectiveWeights, scenario, settings);

  const confidence = clamp(100 - state.uncertainty * 0.45 - state.complexity * 0.2 
    + state.informationQuality * 0.25 - simulation.uncertainty * 0.2, 5, 95);

  const actionPhases = [];
  if (state.uncertainty >= 60) actionPhases.push('Reduce ambiguity before committing.');
  if (state.scarcity >= 60) actionPhases.push('Protect limited resources.');
  if (state.urgency >= 70) actionPhases.push('Move with time discipline.');
  if (!actionPhases.length) actionPhases.push('Proceed with balanced execution.');

  return {
    id: stableId(scenario.domain, strategy.key, index, prefix),
    title: `${prefix} ${strategy.label}`,
    strategy: strategy.key,
    description: strategy.description,
    action: actionPhases.join(' '),
    upside: simulation.expectedScore,
    score: simulation.expectedScore, // required by downstream UI
    confidence,
    uncertainty: simulation.uncertainty,
    scoreRange: { low: simulation.minScore, high: simulation.maxScore },
    risks: uniqueStrings([...strategy.failureModes, 
      state.volatility > 60 ? 'high environmental variance' : '',
      state.complexity > 65 ? 'coordination overhead' : '',
      state.scarcity > 65 ? 'resource contention' : ''
    ]),
    strengths: uniqueStrings(strategy.benefits),
    successConditions: uniqueStrings([
      state.informationQuality >= 60 ? 'Evidence quality is sufficient.' : '',
      state.uncertainty < 70 ? 'Uncertainty is bounded.' : ''
    ]),
    failureConditions: uniqueStrings(strategy.failureModes),
    counterfactuals: [
      'What if volatility drops by 20 points?',
      'What if evidence quality improves?',
      'What if scarcity becomes the dominant pressure?'
    ],
    fitTags: uniqueStrings([scenario.domain || 'general', strategy.key, 
      state.urgency > 60 ? 'urgent' : 'patient', state.volatility > 60 ? 'volatile' : 'stable'
    ]),
    intensity: clamp(round(simulation.expectedScore / 10, 1), 1, 10)
  };
}

function getDomainPrefix(domain = 'general', fallback = 'Execute') {
  const normalized = normalizeText(domain);
  let targetDomain = DOMAINS[normalized];
  if (!targetDomain) {
    if (normalized === 'tech') targetDomain = DOMAINS.technology;
    else if (normalized === 'consumer') targetDomain = DOMAINS.consumption;
  }
  return targetDomain?.prefix || fallback;
}

export function buildBranches(scenario, personas, evidenceProfile, settings = {}) {
  const normalizedScenario = normalizeScenario(scenario, personas, evidenceProfile, settings);
  const state = evaluateWorldState(normalizedScenario, normalizedScenario.evidenceProfile, settings);
  const objectiveWeights = getObjectiveWeights(normalizedScenario, settings);
  const count = clamp(normalizedScenario.branchCount, 3, 8);
  const prefix = getDomainPrefix(normalizedScenario.domain, 'Execute');

  const ranked = getBaseStrategies()
    .map((strategy, index) => buildBranchFromStrategy({
      strategy, index, scenario: normalizedScenario, state, objectiveWeights, prefix, settings
    }))
    .sort((a, b) => {
      const scoreA = a.upside + a.confidence * 0.15 - a.uncertainty * 0.1;
      const scoreB = b.upside + b.confidence * 0.15 - b.uncertainty * 0.1;
      return scoreB - scoreA;
    });

  return ranked.slice(0, count);
}

export function buildBranchesForDomain(domain, prefix, state = {}) {
  const normalizedDomain = normalizeText(domain);
  const branchPrefix = prefix || getDomainPrefix(normalizedDomain, 'Execute');
  const scenario = { domain: normalizedDomain, branchCount: 8, objective: 'optimize', query: `${branchPrefix} decision` };
  
  const evidenceProfile = { summary: {
    uncertainty: toNumber(state.volatility ?? state.uncertainty ?? 50, 50),
    risk: toNumber(state.scarcity ?? state.risk ?? 50, 50),
    complexity: toNumber(state.complexity ?? 50, 50),
    urgency: toNumber(state.urgency ?? 50, 50),
    coupling: toNumber(state.coupling ?? 50, 50),
    switchingCost: toNumber(state.switchingCost ?? 50, 50),
    informationQuality: toNumber(state.informationQuality ?? 50, 50)
  }};

  return buildBranches(scenario, [], evidenceProfile, { domain: normalizedDomain, branchCount: 8 });
}

export function getLibraryForDomain(domain) {
  const normalizedDomain = normalizeText(domain);
  const prefix = getDomainPrefix(normalizedDomain, 'Execute');
  // Neutral world-state defaults to 50 on all dims
  return buildBranchesForDomain(normalizedDomain, prefix, {});
}

// Regenerate LIBRARY for static lookup compat
export const LIBRARY = {};
for (const [dom, config] of Object.entries(DOMAINS)) {
  LIBRARY[dom] = buildBranchesForDomain(dom, config.prefix);
}
LIBRARY.general = buildBranchesForDomain('general', 'Execute');
LIBRARY.tech = LIBRARY.technology;
LIBRARY.consumer = LIBRARY.consumption;
