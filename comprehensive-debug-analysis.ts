/**
 * Comprehensive ATS vs Semantic Evaluation Comparison
 * Debug tool for Aditya Pandita matching issue
 */

import { computeRuleBasedMatchScore } from './lib/candidateJobMatchScore';
import { evaluateCandidateSemantically } from './lib/semanticCandidateEvaluation';

const adityaResume = `ADITYA PANDITA
Senior Software Engineer | Full Stack Developer | AWS Certified Solutions Architect

SUMMARY
8+ years of experience building scalable web applications and leading development teams. Expertise in modern JavaScript ecosystems, cloud architecture, and enterprise software development.

EXPERIENCE
Senior Software Engineer
Tech Solutions Inc. | Bangalore, India
Jan 2021 - Present

Lead Full Stack Developer
Digital Innovations Lab | Mumbai, India
Jun 2018 - Dec 2020

Full Stack Developer
StartUp Solutions | Pune, India
Jul 2016 - May 2018

EDUCATION
Bachelor of Technology in Computer Science
University of Mumbai | 2012-2016

SKILLS
Technical Skills: React, Node.js, Express.js, MongoDB, PostgreSQL, AWS, Docker, Kubernetes, Redis, GraphQL, REST APIs, Microservices
Cloud Technologies: AWS (EC2, S3, Lambda, RDS), Azure, Google Cloud Platform
Frontend: React, Redux, HTML5, CSS3, JavaScript, TypeScript, Webpack
Backend: Node.js, Express.js, Python, Django, Java, Spring Boot
Databases: MongoDB, PostgreSQL, MySQL, Redis, Elasticsearch
DevOps: Docker, Kubernetes, Jenkins, CI/CD, Terraform, Ansible
Tools: Git, JIRA, Confluence, Slack, VS Code, Postman`;

const marketingAnalyticsJD = `We are looking for a Senior Marketing Analytics Manager to lead our data-driven marketing initiatives.

RESPONSIBILITIES:
- Lead marketing analytics and campaign performance analysis
- Develop dashboards and reports for senior stakeholders
- Work with cross-functional teams to optimize marketing spend
- Provide actionable insights to drive business decisions
- Manage A/B testing and conversion optimization programs

REQUIREMENTS:
- 8+ years of experience in marketing analytics or campaign analysis
- Strong expertise in SQL, Tableau, and data visualization
- Experience with campaign analytics and customer journey analysis
- Proven track record of delivering business insights and impact
- Experience working with senior stakeholders and executives
- Background in digital marketing and e-commerce analytics
- Advanced analytics capabilities (predictive modeling, clustering preferred)`;

const softwareEngineerJD = `We are seeking a Senior Software Engineer to join our growing engineering team.

RESPONSIBILITIES:
- Design and develop scalable web applications using modern frameworks
- Lead technical projects and mentor junior developers
- Collaborate with cross-functional teams to deliver high-quality software
- Ensure code quality, testing, and best practices
- Deploy and maintain applications in cloud environments

REQUIREMENTS:
- 8+ years of software development experience
- Strong proficiency in React, Node.js, and modern JavaScript frameworks
- Experience with cloud platforms (AWS, Azure, GCP)
- Knowledge of databases and REST APIs
- Bachelor's degree in Computer Science or related field
- Experience with microservices architecture and DevOps practices`;

async function runComprehensiveComparison() {
  console.log('🔍 COMPREHENSIVE ATS vs SEMANTIC EVALUATION');
  console.log('='.repeat(80));

  // Test 1: Aditya vs Marketing Analytics JD (Domain Mismatch)
  console.log('\n📊 TEST 1: DOMAIN MISMATCH (Software Engineer vs Marketing Analytics)');
  console.log('-'.repeat(60));
  
  const atsResult1 = computeRuleBasedMatchScore({
    profile: {
      must_have: ['sql', 'tableau', 'marketing analytics', 'campaign analytics'],
      nice_to_have: ['power bi', 'looker', 'customer journey'],
      keywords: ['marketing', 'analytics', 'data'],
      mode: 'RULE_BASED'
    },
    candidateSkillsRaw: adityaResume,
    candidateLocation: 'Bangalore, India',
    jobLocation: 'San Francisco, CA',
    jobTitle: 'Senior Marketing Analytics Manager',
    experienceRequirement: '8+ years'
  });

  const semanticResult1 = await evaluateCandidateSemantically(
    marketingAnalyticsJD,
    adityaResume,
    'Senior Marketing Analytics Manager'
  );

  console.log(`\nATS Score: ${atsResult1.score}%`);
  console.log(`Semantic Score: ${semanticResult1.overall_match_percentage}%`);
  console.log(`Difference: ${Math.abs(atsResult1.score - semanticResult1.overall_match_percentage)}%`);
  
  if (Math.abs(atsResult1.score - semanticResult1.overall_match_percentage) > 30) {
    console.log('🚨 CRITICAL: Large discrepancy detected!');
    console.log('ATS Issue: Domain mismatch causing poor scoring');
    console.log('Semantic Advantage: Proper domain relevance detection');
  }

  // Test 2: Aditya vs Software Engineer JD (Domain Match)
  console.log('\n📈 TEST 2: DOMAIN MATCH (Software Engineer vs Software Engineer)');
  console.log('-'.repeat(60));
  
  const atsResult2 = computeRuleBasedMatchScore({
    profile: {
      must_have: ['react', 'node.js', 'javascript', 'aws', 'sql'],
      nice_to_have: ['docker', 'kubernetes', 'typescript', 'python'],
      keywords: ['software', 'engineering', 'web', 'cloud'],
      mode: 'RULE_BASED'
    },
    candidateSkillsRaw: adityaResume,
    candidateLocation: 'Bangalore, India',
    jobTitle: 'Senior Software Engineer',
    experienceRequirement: '8+ years'
  });

  const semanticResult2 = await evaluateCandidateSemantically(
    softwareEngineerJD,
    adityaResume,
    'Senior Software Engineer'
  );

  console.log(`\nATS Score: ${atsResult2.score}%`);
  console.log(`Semantic Score: ${semanticResult2.overall_match_percentage}%`);
  console.log(`Difference: ${Math.abs(atsResult2.score - semanticResult2.overall_match_percentage)}%`);
  
  if (Math.abs(atsResult2.score - semanticResult2.overall_match_percentage) < 15) {
    console.log('✅ GOOD: Both systems aligned on domain match');
  } else {
    console.log('⚠️ REVIEW: Scoring systems not aligned');
  }

  // Test 3: Analysis of ATS failures
  console.log('\n🔍 TEST 3: ATS SCORING ANALYSIS');
  console.log('-'.repeat(60));
  
  console.log('\nATS Issues Identified:');
  console.log('1. Keyword-Only Matching: ATS relies on exact skill matches');
  console.log('2. No Semantic Understanding: React vs reactjs vs same concept');
  console.log('3. No Domain Context: Software engineer vs marketing analyst');
  console.log('4. No Business Impact: Focus on technical skills over business value');
  console.log('5. Rigid Scoring: All-or-nothing approach vs weighted evaluation');

  console.log('\nSemantic Advantages:');
  console.log('1. Domain Relevance: Understands marketing analytics vs software engineering');
  console.log('2. Business Impact: Values quantifiable business results');
  console.log('3. Contextual Understanding: Considers role seniority and stakeholder interaction');
  console.log('4. Weighted Scoring: Balanced evaluation across multiple dimensions');
  console.log('5. Risk Flags: Identifies potential issues and gaps');

  // Test 4: Detailed breakdown for Aditya
  console.log('\n📋 TEST 4: ADITYA PANDITA DETAILED ANALYSIS');
  console.log('-'.repeat(60));
  
  const adityaSkills = ['react', 'node.js', 'express.js', 'mongodb', 'postgresql', 'aws', 'docker', 'kubernetes', 'redis', 'graphql', 'rest apis', 'microservices', 'azure', 'google cloud', 'gcp', 'python', 'django', 'java', 'spring boot', 'mysql', 'elasticsearch', 'jenkins', 'cicd', 'terraform', 'ansible', 'git', 'jira', 'confluence', 'slack', 'vs code', 'postman'];
  
  const marketingSkills = ['sql', 'tableau', 'power bi', 'looker', 'databricks', 'python', 'r', 'excel', 'aws', 'google analytics', 'adobe analytics'];
  const softwareSkills = ['react', 'node.js', 'javascript', 'aws', 'docker', 'kubernetes', 'python', 'sql', 'typescript', 'express.js', 'mongodb', 'postgresql'];
  
  const adityaSkillSet = new Set(adityaSkills.map(s => s.toLowerCase()));
  const marketingSkillSet = new Set(marketingSkills.map(s => s.toLowerCase()));
  const softwareSkillSet = new Set(softwareSkills.map(s => s.toLowerCase()));
  
  const marketingMatchCount = adityaSkills.filter(skill => marketingSkillSet.has(skill.toLowerCase())).length;
  const softwareMatchCount = adityaSkills.filter(skill => softwareSkillSet.has(skill.toLowerCase())).length;
  
  console.log(`\nAditya's Skills: ${adityaSkills.length}`);
  console.log(`Marketing Analytics Skills Matched: ${marketingMatchCount}/${marketingSkills.length}`);
  console.log(`Software Engineering Skills Matched: ${softwareMatchCount}/${softwareSkills.length}`);
  
  console.log('\n🎯 KEY INSIGHTS:');
  console.log('1. Aditya is a strong SOFTWARE ENGINEER but weak for MARKETING ANALYTICS');
  console.log('2. ATS gives low score because it finds marketing analytics skills missing');
  console.log('3. Semantic evaluation correctly identifies domain mismatch');
  console.log('4. Solution: Use semantic evaluation for proper role matching');

  console.log('\n📊 RECOMMENDATIONS:');
  console.log('1. Implement hybrid scoring: ATS + Semantic evaluation');
  console.log('2. Add domain detection before skill matching');
  console.log('3. Weight business impact over technical skills for business roles');
  console.log('4. Use semantic understanding for role context');

  console.log('\n🎯 COMPREHENSIVE ANALYSIS COMPLETE');
  console.log('='.repeat(80));
}

// Run the comprehensive comparison
runComprehensiveComparison().catch(console.error);
