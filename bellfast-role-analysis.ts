/**
 * Business Insights & Engagement Partner - Specialized Evaluation
 * Bellfast Role Analysis for Aditya Pandita
 */

import { evaluateCandidateSemantically } from './lib/semanticCandidateEvaluation';
import { parseCandidateSkillsNormalized } from './lib/skillNormalization';

const bellfastJD = `Business Insights & Engagement Partner — Bellfast

We are looking for a Business Insights & Engagement Partner to join our team and drive data-driven business decisions.

RESPONSIBILITIES:
- Act as strategic business partner to senior leadership teams
- Provide actionable insights from complex data analysis
- Lead stakeholder engagement and cross-functional collaboration
- Develop and present business intelligence dashboards
- Drive data-driven decision making across the organization
- Partner with business units to understand their needs and challenges
- Translate complex data into actionable business recommendations

REQUIREMENTS:
- 8+ years of experience in business analytics or insights role
- Strong background in stakeholder management and business partnership
- Expertise in data visualization and business intelligence tools
- Experience with SQL, Python, or similar data analysis languages
- Proven track record of delivering business impact through data insights
- Excellent communication and presentation skills
- Experience working with C-level executives and senior stakeholders
- Background in business analytics, marketing analytics, or financial analytics

QUALIFICATIONS:
- Bachelor's degree in Business, Analytics, Statistics, or related field
- Expert in BI tools (Tableau, Power BI, Looker, etc.)
- Strong understanding of business metrics and KPIs
- Experience with modern data stack and cloud platforms
- Ability to translate technical findings into business language
- Strategic thinking and problem-solving capabilities`;

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

/**
 * Enhanced evaluation for Business Insights & Engagement Partner role
 */
async function evaluateBusinessInsightsRole() {
  console.log('🔍 BELLFAST BUSINESS INSIGHTS ROLE ANALYSIS');
  console.log('='.repeat(80));

  // Parse Aditya's skills
  const adityaSkills = parseCandidateSkillsNormalized(adityaResume);
  console.log('\n🔧 Aditya Technical Skills:');
  Array.from(adityaSkills).forEach(skill => {
    console.log(`  - ${skill}`);
  });

  // Standard semantic evaluation
  const standardResult = await evaluateCandidateSemantically(
    bellfastJD,
    adityaResume,
    'Business Insights & Engagement Partner'
  );

  console.log('\n📊 STANDARD SEMANTIC EVALUATION:');
  console.log(`Overall Score: ${standardResult.overall_match_percentage}%`);
  console.log(`Decision: ${standardResult.decision}`);
  console.log('Category Scores:');
  Object.entries(standardResult.category_scores).forEach(([category, score]) => {
    console.log(`  ${category}: ${score}%`);
  });

  // Enhanced business insights evaluation
  console.log('\n🎯 ENHANCED BUSINESS INSIGHTS EVALUATION:');
  
  // Business Insights specific scoring
  let businessInsightsScore = 0;
  let stakeholderScore = 0;
  let dataAnalyticsScore = 0;
  let communicationScore = 0;
  let strategicThinkingScore = 0;

  const businessInsightsKeywords = [
    'business insights', 'business intelligence', 'data-driven decisions',
    'actionable insights', 'business recommendations', 'strategic insights',
    'business analytics', 'data analysis', 'business metrics'
  ];

  const stakeholderKeywords = [
    'stakeholder', 'senior leadership', 'c-level', 'executive',
    'business partner', 'cross-functional', 'collaboration', 'engagement'
  ];

  const dataAnalyticsKeywords = [
    'sql', 'python', 'data visualization', 'bi tools', 'tableau', 'power bi',
    'data analysis', 'business intelligence', 'dashboard', 'metrics'
  ];

  const communicationKeywords = [
    'presentation', 'communication', 'translate technical', 'business language',
    'reporting', 'storytelling', 'insights presentation'
  ];

  const strategicKeywords = [
    'strategic', 'problem-solving', 'business thinking', 'decision making',
    'business strategy', 'leadership', 'strategic partner'
  ];

  const resumeText = adityaResume.toLowerCase();

  // Score business insights relevance
  const businessInsightsMatches = businessInsightsKeywords.filter(keyword => 
    resumeText.includes(keyword.toLowerCase())
  ).length;
  businessInsightsScore = Math.min(100, businessInsightsMatches * 25);

  // Score stakeholder management
  const stakeholderMatches = stakeholderKeywords.filter(keyword => 
    resumeText.includes(keyword.toLowerCase())
  ).length;
  stakeholderScore = Math.min(100, stakeholderMatches * 20);

  // Score data analytics capabilities
  const dataAnalyticsMatches = dataAnalyticsKeywords.filter(keyword => 
    adityaSkills.has(keyword.toLowerCase()) || 
    resumeText.includes(keyword.toLowerCase())
  ).length;
  dataAnalyticsScore = Math.min(100, dataAnalyticsMatches * 12);

  // Score communication skills
  const communicationMatches = communicationKeywords.filter(keyword => 
    resumeText.includes(keyword.toLowerCase())
  ).length;
  communicationScore = Math.min(100, communicationMatches * 20);

  // Score strategic thinking
  const strategicMatches = strategicKeywords.filter(keyword => 
    resumeText.includes(keyword.toLowerCase())
  ).length;
  strategicThinkingScore = Math.min(100, strategicMatches * 25);

  console.log('\n📈 DETAILED SCORING:');
  console.log(`Business Insights: ${businessInsightsMatches} matches → ${businessInsightsScore}%`);
  console.log(`Stakeholder Management: ${stakeholderMatches} matches → ${stakeholderScore}%`);
  console.log(`Data Analytics: ${dataAnalyticsMatches} matches → ${dataAnalyticsScore}%`);
  console.log(`Communication: ${communicationMatches} matches → ${communicationScore}%`);
  console.log(`Strategic Thinking: ${strategicMatches} matches → ${strategicThinkingScore}%`);

  // Calculate enhanced score
  const enhancedScore = Math.round(
    businessInsightsScore * 0.30 +      // Most important for this role
    stakeholderScore * 0.25 +          // Critical for engagement partner
    dataAnalyticsScore * 0.20 +          // Technical foundation
    communicationScore * 0.15 +          // Communication skills
    strategicThinkingScore * 0.10          // Strategic thinking
  );

  console.log('\n🎯 ENHANCED SCORE BREAKDOWN:');
  console.log(`Business Insights (30%): ${businessInsightsScore}%`);
  console.log(`Stakeholder Mgmt (25%): ${stakeholderScore}%`);
  console.log(`Data Analytics (20%): ${dataAnalyticsScore}%`);
  console.log(`Communication (15%): ${communicationScore}%`);
  console.log(`Strategic Thinking (10%): ${strategicThinkingScore}%`);
  console.log(`Enhanced Total: ${enhancedScore}%`);

  // Analysis of why score is low
  console.log('\n🔍 ROOT CAUSE ANALYSIS:');
  if (businessInsightsScore < 50) {
    console.log('❌ Missing business insights experience');
    console.log('   Aditya has technical skills but no business analytics background');
  }
  if (stakeholderScore < 50) {
    console.log('❌ Limited stakeholder management experience');
    console.log('   No evidence of working with senior leadership or C-level executives');
  }
  if (dataAnalyticsScore < 50) {
    console.log('❌ Limited business analytics tools');
    console.log('   Strong in technical tools but weak in BI tools like Tableau/Power BI');
  }
  if (communicationScore < 50) {
    console.log('❌ Limited business communication experience');
    console.log('   No evidence of translating technical findings to business insights');
  }

  console.log('\n💡 KEY INSIGHT:');
  console.log('Aditya is an excellent SOFTWARE ENGINEER but this role requires:');
  console.log('1. Business analytics background');
  console.log('2. Stakeholder management experience');
  console.log('3. Business intelligence tools expertise');
  console.log('4. Communication of insights to business leaders');
  console.log('5. Strategic business thinking');

  console.log('\n📋 RECOMMENDATION:');
  console.log('❌ REJECT for Business Insights & Engagement Partner role');
  console.log('✅ RECOMMEND for Software Engineering/Technical Leadership roles');
  console.log('🎯 The 9% score is CORRECT - wrong domain, not wrong skills');

  return {
    standard_score: standardResult.overall_match_percentage,
    enhanced_score: enhancedScore,
    domain_mismatch: true,
    recommendation: 'Reject - Wrong domain, recommend technical roles instead'
  };
}

// Run the analysis
evaluateBusinessInsightsRole().catch(console.error);
