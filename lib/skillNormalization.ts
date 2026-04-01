/**
 * Canonical skill keys + aliases for consistent matching (Phase 1).
 * All matching uses lowercase canonical tokens.
 */

/** Alias / typo → canonical key (lowercase, stable). */
const ALIAS_TO_CANONICAL: Record<string, string> = {
  // JavaScript/TypeScript
  js: "javascript",
  javascript: "javascript",
  ecma: "javascript",
  es6: "javascript",
  es2015: "javascript",
  es2020: "javascript",
  es2021: "javascript",
  es2022: "javascript",
  ts: "typescript",
  typescript: "typescript",
  
  // Frontend Frameworks
  react: "react",
  reactjs: "react",
  "react.js": "react",
  reactnative: "react native",
  "react native": "react native",
  rn: "react native",
  next: "next.js",
  nextjs: "next.js",
  "next.js": "next.js",
  nuxt: "nuxt",
  nuxtjs: "nuxt",
  vue: "vue",
  vuejs: "vue",
  vue2: "vue",
  vue3: "vue",
  angular: "angular",
  angularjs: "angularjs",
  angular2: "angular",
  angular4: "angular",
  angular8: "angular",
  angular10: "angular",
  svelte: "svelte",
  solid: "solidjs",
  solidjs: "solidjs",
  
  // State Management
  redux: "redux",
  mobx: "mobx",
  zustand: "zustand",
  recoil: "recoil",
  vuex: "vuex",
  pinia: "pinia",
  ngrx: "ngrx",
  
  // Backend/Node.js
  node: "node.js",
  nodejs: "node.js",
  "node.js": "node.js",
  express: "express",
  expressjs: "express",
  koa: "koa",
  fastify: "fastify",
  nest: "nestjs",
  nestjs: "nestjs",
  
  // Database
  sql: "sql",
  mysql: "mysql",
  postgres: "postgresql",
  postgresql: "postgresql",
  psql: "postgresql",
  mongo: "mongodb",
  mongodb: "mongodb",
  mongoose: "mongoose",
  dynamodb: "dynamodb",
  firebase: "firebase",
  firestore: "firestore",
  supabase: "supabase",
  prisma: "prisma",
  sequelize: "sequelize",
  typeorm: "typeorm",
  
  // Cloud/DevOps
  aws: "aws",
  amazon: "aws",
  "amazon web services": "aws",
  azure: "azure",
  gcp: "gcp",
  "google cloud": "gcp",
  docker: "docker",
  k8s: "kubernetes",
  kubernetes: "kubernetes",
  terraform: "terraform",
  pulumi: "pulumi",
  ansible: "ansible",
  chef: "chef",
  puppet: "puppet",
  jenkins: "jenkins",
  github: "github",
  gitlab: "gitlab",
  bitbucket: "bitbucket",
  
  // Build Tools
  webpack: "webpack",
  vite: "vite",
  parcel: "parcel",
  rollup: "rollup",
  gulp: "gulp",
  grunt: "grunt",
  babel: "babel",
  postcss: "postcss",
  
  // Testing
  jest: "jest",
  mocha: "mocha",
  chai: "chai",
  cypress: "cypress",
  playwright: "playwright",
  selenium: "selenium",
  testing: "testing",
  "unit testing": "unit testing",
  "integration testing": "integration testing",
  "e2e testing": "e2e testing",
  
  // CSS/Styling
  html: "html",
  css: "css",
  css3: "css",
  html5: "html",
  tailwind: "tailwind",
  tailwindcss: "tailwind",
  sass: "sass",
  scss: "sass",
  less: "less",
  stylus: "stylus",
  "styled components": "styled components",
  styledcomponents: "styled components",
  emotion: "emotion",
  
  // Java Ecosystem
  java: "java",
  spring: "spring",
  springboot: "spring boot",
  "spring boot": "spring boot",
  springmvc: "spring mvc",
  "spring mvc": "spring mvc",
  maven: "maven",
  gradle: "gradle",
  kotlin: "kotlin",
  scala: "scala",
  
  // Python Ecosystem
  python: "python",
  py: "python",
  python3: "python",
  django: "django",
  flask: "flask",
  fastapi: "fastapi",
  pyramid: "pyramid",
  tornado: "tornado",
  pandas: "pandas",
  numpy: "numpy",
  scipy: "scipy",
  matplotlib: "matplotlib",
  
  // AI/ML/Data Science
  ml: "machine learning",
  "machine learning": "machine learning",
  ai: "artificial intelligence",
  "artificial intelligence": "artificial intelligence",
  dl: "deep learning",
  "deep learning": "deep learning",
  nlp: "nlp",
  "natural language processing": "nlp",
  cv: "computer vision",
  "computer vision": "computer vision",
  tensorflow: "tensorflow",
  tf: "tensorflow",
  keras: "keras",
  pytorch: "pytorch",
  torch: "pytorch",
  scikit: "scikit-learn",
  "scikit-learn": "scikit-learn",
  sklearn: "scikit-learn",
  
  // Data Engineering
  etl: "etl",
  elt: "elt",
  data: "data engineering",
  "data engineering": "data engineering",
  "data pipeline": "data pipeline",
  airflow: "airflow",
  dbt: "dbt",
  
  // Go Ecosystem
  golang: "go",
  go: "go",
  gin: "gin",
  echo: "echo",
  
  // Rust/C++
  rust: "rust",
  cpp: "c++",
  "c++": "c++",
  cplusplus: "c++",
  
  // .NET Ecosystem
  csharp: "c#",
  "c#": "c#",
  dotnet: ".net",
  ".net": ".net",
  aspnet: "asp.net",
  "asp.net": "asp.net",
  blazor: "blazor",
  
  // Mobile
  ios: "ios",
  swift: "swift",
  objectivec: "objective-c",
  "objective-c": "objective-c",
  android: "android",
  kotlinandroid: "kotlin",
  flutter: "flutter",
  dart: "dart",
  xamarin: "xamarin",
  
  // APIs/Protocols
  rest: "rest",
  restful: "rest",
  "rest api": "rest api",
  graphql: "graphql",
  gql: "graphql",
  grpc: "grpc",
  soap: "soap",
  api: "api",
  
  // Message Queues
  kafka: "kafka",
  rabbitmq: "rabbitmq",
  sqs: "sqs",
  sns: "sns",
  redis: "redis",
  
  // Search
  elasticsearch: "elasticsearch",
  solr: "solr",
  algolia: "algolia",
  
  // Monitoring/Observability
  prometheus: "prometheus",
  grafana: "grafana",
  datadog: "datadog",
  newrelic: "newrelic",
  splunk: "splunk",
  
  // Security
  security: "security",
  cybersecurity: "security",
  owasp: "owasp",
  penetration: "penetration testing",
  "penetration testing": "penetration testing",
  pentesting: "penetration testing",
  
  // Architecture/Patterns
  microservices: "microservices",
  "micro service": "microservices",
  serverless: "serverless",
  "server less": "serverless",
  jamstack: "jamstack",
  headless: "headless",
  
  // Project Management
  agile: "agile",
  scrum: "scrum",
  kanban: "kanban",
  jira: "jira",
  confluence: "confluence",
  
  // Design/UX
  figma: "figma",
  sketch: "sketch",
  adobe: "adobe creative suite",
  photoshop: "photoshop",
  illustrator: "illustrator",
  xd: "adobe xd",
  
  // Business Intelligence
  bi: "business intelligence",
  "business intelligence": "business intelligence",
  tableau: "tableau",
  "power bi": "power bi",
  powerbi: "power bi",
  excel: "excel",
  
  // Marketing
  seo: "seo",
  sem: "sem",
  "digital marketing": "digital marketing",
  "content marketing": "content marketing",
  
  // HR/Recruiting
  hr: "hr",
  "human resources": "hr",
  recruitment: "recruitment",
  "talent acquisition": "talent acquisition",
  payroll: "payroll",
  compliance: "compliance",
  
  // Blockchain
  blockchain: "blockchain",
  solidity: "solidity",
  ethereum: "ethereum",
  "smart contract": "smart contract",
  web3: "web3",
  
  // Version Control
  git: "git",
  svn: "svn",
  
  // CI/CD
  cicd: "ci/cd",
  "ci/cd": "ci/cd",
  "continuous integration": "ci/cd",
  "continuous deployment": "ci/cd",
  
  // Operating Systems
  linux: "linux",
  ubuntu: "linux",
  centos: "linux",
  redhat: "linux",
  windows: "windows",
  macos: "macos",
  unix: "unix",
  
  // Shells/Scripting
  bash: "bash",
  shell: "shell",
  powershell: "powershell",
  zsh: "zsh",
  
  // Other Tools
  slack: "slack",
  teams: "microsoft teams",
  zoom: "zoom",
  notion: "notion",
  
  // Soft Skills (normalized)
  leadership: "leadership",
  communication: "communication",
  "problem solving": "problem solving",
  teamwork: "teamwork",
  collaboration: "collaboration",
  "time management": "time management",
  "project management": "project management",
  mentoring: "mentoring",
  coaching: "coaching",
};

const STOP_SKILL_TOKENS = new Set([
  "and",
  "or",
  "the",
  "with",
  "using",
  "etc",
  "strong",
  "good",
  "knowledge",
  "experience",
  "years",
  "year",
]);

export function normalizeWhitespace(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Strip punctuation except .+# for tech tokens */
function stripNoise(s: string) {
  return s.replace(/[^\w\s.+#/-]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Map raw skill phrase → canonical key (lowercase).
 */
export function canonicalSkillKey(raw: string): string {
  let t = stripNoise(normalizeWhitespace(raw));
  if (t.length < 2) return t;
  if (ALIAS_TO_CANONICAL[t]) return ALIAS_TO_CANONICAL[t];
  const noDotJs = t.replace(/\.js$/i, "");
  if (ALIAS_TO_CANONICAL[noDotJs]) return ALIAS_TO_CANONICAL[noDotJs];
  return t;
}

/**
 * Phrases that are equivalent for rule-based matching (marketing/BI/analytics roles).
 * Representative is the first phrase in each group (canonicalized).
 */
const SEMANTIC_EQUIVALENCE_GROUPS: string[][] = [
  [
    "data analysis",
    "analytics",
    "marketing analytics",
    "digital analytics",
    "business analytics",
    "web analytics",
    "campaign analytics",
    "marketing analysis",
    "insight generation",
    "actionable insights",
    "strategic insights",
    "performance analytics",
    "revenue analytics",
  ],
  [
    "account management",
    "stakeholder management",
    "stakeholder engagement",
    "business partnering",
    "business partner",
    "key stakeholders",
    "executive stakeholders",
    "client management",
    "relationship management",
    "trusted advisor",
    "cross-functional collaboration",
  ],
  [
    "data storytelling",
    "data visualization",
    "visualization",
    "dashboard",
    "dashboarding",
    "dashboards",
    "reporting",
    "narratives",
    "presentation",
  ],
  [
    "business intelligence",
    "bi",
    "insights reporting",
    "kpi tracking",
  ],
  [
    "sales funnel",
    "funnel analysis",
    "buyer journey",
    "customer journey",
    "pipeline analysis",
    "conversion analysis",
    "demand generation",
    "lead generation",
  ],
  [
    "crm analytics",
    "crm",
    "salesforce",
    "hubspot",
  ],
  [
    "statistical analysis",
    "statistics",
    "hypothesis testing",
    "experimentation",
    "a/b testing",
    "ab testing",
  ],
];

const SEMANTIC_SKILL_REP = new Map<string, string>();
for (const group of SEMANTIC_EQUIVALENCE_GROUPS) {
  if (group.length === 0) continue;
  const rep = canonicalSkillKey(group[0]);
  if (rep.length < 2) continue;
  for (const phrase of group) {
    const k = canonicalSkillKey(phrase);
    if (k.length >= 2 && !SEMANTIC_SKILL_REP.has(k)) SEMANTIC_SKILL_REP.set(k, rep);
  }
}

/** Map a canonical skill key to its semantic cluster representative (or itself). */
export function semanticSkillRepresentative(canonicalKey: string): string {
  return SEMANTIC_SKILL_REP.get(canonicalKey) ?? canonicalKey;
}

/**
 * Parse comma/semicolon-separated skills → unique canonical keys.
 */
export function parseCandidateSkillsNormalized(skills: string | null | undefined): Set<string> {
  const set = new Set<string>();
  if (!skills) return set;
  for (const part of String(skills).split(/[,;|/]+/)) {
    const key = canonicalSkillKey(part);
    if (key.length >= 2 && !STOP_SKILL_TOKENS.has(key)) set.add(key);
  }
  return set;
}

export function normalizeSkillList(skills: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of skills) {
    const k = canonicalSkillKey(s);
    if (k.length < 2 || STOP_SKILL_TOKENS.has(k)) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/**
 * Whether candidate satisfies required canonical skill (exact or safe partial).
 * Avoids false positives for very short tokens (e.g. "go" in "mongodb").
 */
export function candidateHasSkill(candidateKeys: Set<string>, requiredCanonical: string): boolean {
  if (!requiredCanonical) return false;
  if (candidateKeys.has(requiredCanonical)) return true;

  const reqRep = semanticSkillRepresentative(requiredCanonical);
  if (reqRep !== requiredCanonical || SEMANTIC_SKILL_REP.has(requiredCanonical)) {
    for (const c of candidateKeys) {
      if (semanticSkillRepresentative(c) === reqRep) return true;
    }
  }

  if (requiredCanonical.length >= 4) {
    for (const c of candidateKeys) {
      if (c === requiredCanonical) return true;
      if (c.length >= 4 && requiredCanonical.length >= 4) {
        if (c.includes(requiredCanonical) || requiredCanonical.includes(c)) {
          const shorter = Math.min(c.length, requiredCanonical.length);
          const longer = Math.max(c.length, requiredCanonical.length);
          if (shorter / longer >= 0.72) return true;
        }
      }
    }
  }
  return false;
}

export function displaySkillLabel(canonical: string): string {
  // Special cases for proper capitalization
  const specialCases: Record<string, string> = {
    'typescript': 'TypeScript',
    'javascript': 'JavaScript',
    'node.js': 'Node.js',
    'next.js': 'Next.js',
    'react.js': 'React.js',
    'vue.js': 'Vue.js',
    'angularjs': 'AngularJS',
    'jquery': 'jQuery',
    'postgresql': 'PostgreSQL',
    'mysql': 'MySQL',
    'mongodb': 'MongoDB',
    'redis': 'Redis',
    'aws': 'AWS',
    'gcp': 'GCP',
    'azure': 'Azure',
    'ai': 'AI',
    'ml': 'ML',
    'nlp': 'NLP',
    'ci/cd': 'CI/CD',
    'ios': 'iOS',
    'android': 'Android',
    'c#': 'C#',
    'c++': 'C++',
    '.net': '.NET',
    'asp.net': 'ASP.NET',
    'react native': 'React Native',
    'objective-c': 'Objective-C',
    'spring boot': 'Spring Boot',
    'spring mvc': 'Spring MVC'
  };
  
  if (specialCases[canonical]) {
    return specialCases[canonical];
  }
  
  return canonical
    .split(/[\s/-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
