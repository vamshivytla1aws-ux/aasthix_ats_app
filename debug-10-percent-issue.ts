/**
 * DEBUG: Why Aditya is still getting 10%
 * Check what system is actually being used
 */

import { computeEnhancedMatch } from './lib/enhancedAtsMatching';
import { computeRuleBasedMatchScore } from './lib/candidateJobMatchScore';

const businessInsightsJD = `Business Insights & Engagement Partner — Bellfast

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
- Background in business analytics, marketing analytics, or financial analytics`;

const adityaResume = `ADITYA PANDITA
Senior Software Engineer | Full Stack Developer | AWS Certified Solutions Architect

SUMMARY
8+ years of experience building scalable web applications and leading development teams. Expertise in modern JavaScript ecosystems, cloud architecture, and enterprise software development.

EXPERIENCE
Senior Software Engineer
Tech Solutions Inc. | Bangalore, India
Jan 2021 - Present
• Led team of 5 developers in building scalable microservices architecture
• Implemented DevOps practices reducing deployment time by 60%
• Designed and deployed cloud infrastructure serving 1M+ users
• Mentored junior developers and conducted code reviews
• Collaborated with product managers and stakeholders to define requirements
• Developed data analytics dashboards for business insights
• Presented technical solutions to senior leadership

Lead Full Stack Developer
Digital Innovations Lab | Mumbai, India
Jun 2018 - Dec 2020
• Developed full-stack applications using React and Node.js
• Implemented data visualization components for analytics
• Worked with cross-functional teams including marketing and sales
• Presented findings to senior leadership
• Created APIs for data integration and reporting

SKILLS
Technical Skills: React, Node.js, Express.js, MongoDB, PostgreSQL, AWS, Docker, Kubernetes, Redis, GraphQL, REST APIs, Microservices
Cloud Technologies: AWS (EC2, S3, Lambda, RDS), Azure, Google Cloud Platform
Frontend: React, Redux, HTML5, CSS3, JavaScript, TypeScript, Webpack
Backend: Node.js, Express.js, Python, Django, Java, Spring Boot
Databases: MongoDB, PostgreSQL, MySQL, Redis, Elasticsearch
DevOps: Docker, Kubernetes, Jenkins, CI/CD, Terraform, Ansible
Tools: Git, JIRA, Confluence, Slack, VS Code, Postman, Tableau, Power BI, Excel, Python`;

async function debugCurrentSystem() {
  console.log('🔍 DEBUGGING WHY ADITYA GETS 10%');
  console.log('='.repeat(80));

  // Test 1: Original ATS system (what's probably being used)
  console.log('\n📊 TEST 1: ORIGINAL ATS SYSTEM');
  const originalResult = computeRuleBasedMatchScore({
    profile: {
      must_have: ['sql', 'tableau', 'marketing analytics', 'stakeholder management'],
      nice_to_have: ['power bi', 'data storytelling', 'business insights'],
      keywords: ['business', 'analytics', 'data'],
      mode: 'RULE_BASED'
    },
    candidateSkillsRaw: adityaResume,
    candidateLocation: 'Bangalore, India',
    jobLocation: 'San Francisco, CA',
    jobTitle: 'Business Insights & Engagement Partner',
    experienceRequirement: '8+ years'
  });

  console.log(`Original ATS Score: ${originalResult.score}%`);
  console.log('Matched Skills:', originalResult.matched);
  console.log('Missing Skills:', originalResult.missingMust);
  console.log('Penalties:', originalResult.breakdown.penalties);

  // Test 2: Enhanced system (what should be used)
  console.log('\n🚀 TEST 2: ENHANCED ATS SYSTEM');
  const enhancedResult = await computeEnhancedMatch(
    businessInsightsJD,
    adityaResume,
    'Business Insights & Engagement Partner',
    '8+ years'
  );

  console.log(`Enhanced ATS Score: ${enhancedResult.enhanced_score}%`);
  console.log('Transferable Skills:', enhancedResult.transferable_skills);
  console.log('Leadership Indicators:', enhancedResult.leadership_indicators);

  // Test 3: Check if profile extraction is the issue
  console.log('\n🔍 TEST 3: PROFILE EXTRACTION DEBUG');
  
  // What skills are actually being extracted from resume?
  const resumeSkills = adityaResume.toLowerCase();
  
  const requiredSkills = ['sql', 'tableau', 'marketing analytics', 'stakeholder management'];
  const niceSkills = ['power bi', 'data storytelling', 'business insights'];
  
  console.log('Required Skills Analysis:');
  requiredSkills.forEach(skill => {
    const found = resumeSkills.includes(skill.toLowerCase());
    console.log(`  ${skill}: ${found ? '✅ FOUND' : '❌ MISSING'}`);
  });
  
  console.log('\nNice Skills Analysis:');
  niceSkills.forEach(skill => {
    const found = resumeSkills.includes(skill.toLowerCase());
    console.log(`  ${skill}: ${found ? '✅ FOUND' : '❌ MISSING'}`);
  });

  // Test 4: Check what's in the actual resume
  console.log('\n📋 TEST 4: ACTUAL RESUME CONTENT ANALYSIS');
  
  const actualSkills = [
    'tableau', 'power bi', 'sql', 'python', 'excel',
    'data analytics', 'dashboard', 'insights', 'visualization',
    'stakeholder', 'leadership', 'team lead', 'mentored',
    'presented', 'collaborated', 'product managers'
  ];
  
  console.log('Skills Found in Resume:');
  actualSkills.forEach(skill => {
    const found = resumeSkills.includes(skill.toLowerCase());
    if (found) {
      console.log(`  ✅ ${skill}`);
    }
  });

  console.log('\n🎯 DIAGNOSIS:');
  if (originalResult.score <= 10) {
    console.log('❌ ISSUE: Original ATS system is still being used');
    console.log('❌ SOLUTION: Need to integrate enhanced system into actual ATS interface');
  } else if (enhancedResult.enhanced_score >= 60) {
    console.log('✅ Enhanced system works correctly');
    console.log('✅ Problem is integration - enhanced system not being used in UI');
  }

  console.log('\n💡 IMMEDIATE FIX NEEDED:');
  console.log('1. Check which API endpoint is being called in frontend');
  console.log('2. Replace current matching logic with enhanced system');
  console.log('3. Update UI to use /api/enhanced-evaluation endpoint');
  console.log('4. Verify enhanced scores are displayed correctly');

  return { originalResult, enhancedResult };
}

// Run debug
debugCurrentSystem().catch(console.error);
