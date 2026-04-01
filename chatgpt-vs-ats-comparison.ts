/**
 * ChatGPT vs ATS Comparison Analysis
 * Why Aditya gets high ratings from ChatGPT but low scores in ATS
 */

import { evaluateCandidateSemantically } from './lib/semanticCandidateEvaluation';
import { parseCandidateSkillsNormalized } from './lib/skillNormalization';

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

Lead Full Stack Developer
Digital Innovations Lab | Mumbai, India
Jun 2018 - Dec 2020
• Developed full-stack applications using React and Node.js
• Implemented data analytics dashboards for business insights
• Worked with cross-functional teams including marketing and sales
• Presented technical solutions to senior leadership
• Optimized database queries improving performance by 40%

Full Stack Developer
StartUp Solutions | Pune, India
Jul 2016 - May 2018
• Built web applications for various clients
• Developed data visualization components for analytics
• Collaborated with business analysts to understand requirements
• Created APIs for data integration and reporting

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
Tools: Git, JIRA, Confluence, Slack, VS Code, Postman, Tableau, Power BI, Excel`;

const arunResume = `ARUN KRISHNAN
Business Analyst | Data Analytics Professional

SUMMARY
5+ years of experience in business analytics and data-driven decision making. Focus on marketing analytics and stakeholder management.

EXPERIENCE
Business Analyst
Analytics Corp | Chennai, India
Jan 2020 - Present
• Analyze marketing campaign performance and provide insights
• Create dashboards using Tableau and Power BI
• Work with marketing teams to optimize campaign strategies
• Present findings to senior management and stakeholders
• Develop data-driven recommendations for business decisions

Junior Business Analyst
Data Insights Ltd. | Bangalore, India
Jun 2018 - Dec 2019
• Support senior analysts in data collection and analysis
• Create reports and visualizations for business metrics
• Assist in stakeholder meetings and presentations
• Learn BI tools and data analysis techniques

EDUCATION
Master of Business Administration
Indian Institute of Management | 2016-2018

Bachelor of Commerce
University of Madras | 2012-2016

SKILLS
Analytics: Tableau, Power BI, SQL, Excel, R, Python
Business: Marketing Analytics, Stakeholder Management, Data Storytelling
Communication: Presentations, Report Writing, Business Insights`;

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

/**
 * Enhanced evaluation that matches ChatGPT's reasoning
 */
async function enhancedEvaluation(
  resume: string,
  jobDescription: string,
  candidateName: string
) {
  console.log(`\n🎯 ENHANCED EVALUATION FOR ${candidateName}`);
  console.log('='.repeat(60));

  const resumeText = resume.toLowerCase();
  const skills = parseCandidateSkillsNormalized(resume);

  // Marketing Analytics Evaluation
  const marketingKeywords = [
    'marketing analytics', 'campaign performance', 'marketing insights',
    'campaign optimization', 'marketing data', 'customer analytics',
    'marketing metrics', 'digital marketing', 'marketing roi'
  ];

  const marketingMatches = marketingKeywords.filter(keyword => 
    resumeText.includes(keyword.toLowerCase())
  ).length;

  // Data Storytelling Evaluation  
  const storytellingKeywords = [
    'data storytelling', 'visualization', 'dashboard', 'insights',
    'presentation', 'reporting', 'business insights', 'recommendations'
  ];

  const storytellingMatches = storytellingKeywords.filter(keyword => 
    resumeText.includes(keyword.toLowerCase())
  ).length;

  // Stakeholder Management Evaluation
  const stakeholderKeywords = [
    'stakeholder', 'senior leadership', 'c-level', 'executive',
    'management', 'team lead', 'leadership', 'cross-functional'
  ];

  const stakeholderMatches = stakeholderKeywords.filter(keyword => 
    resumeText.includes(keyword.toLowerCase())
  ).length;

  // BI & Tools Evaluation
  const biTools = ['tableau', 'power bi', 'sql', 'excel', 'python', 'r'];
  const biMatches = biTools.filter(tool => 
    skills.has(tool.toLowerCase()) || resumeText.includes(tool.toLowerCase())
  ).length;

  // ML/AI Evaluation
  const mlKeywords = [
    'machine learning', 'artificial intelligence', 'ml', 'ai',
    'predictive modeling', 'clustering', 'statistical analysis'
  ];

  const mlMatches = mlKeywords.filter(keyword => 
    resumeText.includes(keyword.toLowerCase())
  ).length;

  // Domain Relevance Evaluation
  const domainKeywords = [
    'business analytics', 'data analysis', 'insights', 'business intelligence',
    'marketing analytics', 'stakeholder', 'consulting', 'strategy'
  ];

  const domainMatches = domainKeywords.filter(keyword => 
    resumeText.includes(keyword.toLowerCase())
  ).length;

  // Calculate scores (0-5 scale like ChatGPT)
  const marketingScore = Math.min(5, Math.max(1, marketingMatches));
  const storytellingScore = Math.min(5, Math.max(1, storytellingMatches));
  const stakeholderScore = Math.min(5, Math.max(1, stakeholderMatches));
  const biScore = Math.min(5, Math.max(1, biMatches));
  const mlScore = Math.min(5, Math.max(1, mlMatches));
  const domainScore = Math.min(5, Math.max(1, domainMatches));

  console.log('\n📊 DETAILED SCORING:');
  console.log(`Marketing Analytics: ${marketingMatches} matches → ${marketingScore}/5 ⭐`);
  console.log(`Data Storytelling: ${storytellingMatches} matches → ${storytellingScore}/5 ⭐`);
  console.log(`Stakeholder Mgmt: ${stakeholderMatches} matches → ${stakeholderScore}/5 ⭐`);
  console.log(`BI & Tools: ${biMatches} matches → ${biScore}/5 ⭐`);
  console.log(`ML/AI: ${mlMatches} matches → ${mlScore}/5 ⭐`);
  console.log(`Domain Relevance: ${domainMatches} matches → ${domainScore}/5 ⭐`);

  // Overall fit calculation
  const overallScore = Math.round(
    (marketingScore + storytellingScore + stakeholderScore + biScore + mlScore + domainScore) / 6 * 20
  );

  const decision = overallScore >= 70 ? "Strong" : overallScore >= 50 ? "Moderate" : "Weak";

  console.log(`\n🎯 OVERALL FIT: ${overallScore}% - ${decision}`);
  
  return {
    candidate_name: candidateName,
    marketing_analytics: marketingScore,
    data_storytelling: storytellingScore,
    stakeholder_mgmt: stakeholderScore,
    bi_tools: biScore,
    ml_ai: mlScore,
    domain_relevance: domainScore,
    overall_fit: overallScore,
    decision
  };
}

/**
 * Compare Aditya vs Arun using ChatGPT-style evaluation
 */
async function compareCandidates() {
  console.log('🔍 CHATGPT VS ATS COMPARISON ANALYSIS');
  console.log('='.repeat(80));

  // Evaluate Aditya
  const adityaResult = await enhancedEvaluation(
    adityaResume,
    businessInsightsJD,
    'Aditya Pandita'
  );

  // Evaluate Arun
  const arunResult = await enhancedEvaluation(
    arunResume,
    businessInsightsJD,
    'Arun Krishnan'
  );

  // Display comparison
  console.log('\n📊 CANDIDATE COMPARISON:');
  console.log('='.repeat(50));
  console.log('Criteria           | Aditya Pandita | Arun Krishnan');
  console.log('-------------------|---------------|-------------');
  console.log(`Marketing Analytics | ${'⭐'.repeat(adityaResult.marketing_analytics)}${'⭐'.repeat(5-adityaResult.marketing_analytics)} | ${'⭐'.repeat(arunResult.marketing_analytics)}${'⭐'.repeat(5-arunResult.marketing_analytics)}`);
  console.log(`Data Storytelling   | ${'⭐'.repeat(adityaResult.data_storytelling)}${'⭐'.repeat(5-adityaResult.data_storytelling)} | ${'⭐'.repeat(arunResult.data_storytelling)}${'⭐'.repeat(5-arunResult.data_storytelling)}`);
  console.log(`Stakeholder Mgmt    | ${'⭐'.repeat(adityaResult.stakeholder_mgmt)}${'⭐'.repeat(5-adityaResult.stakeholder_mgmt)} | ${'⭐'.repeat(arunResult.stakeholder_mgmt)}${'⭐'.repeat(5-arunResult.stakeholder_mgmt)}`);
  console.log(`BI & Tools          | ${'⭐'.repeat(adityaResult.bi_tools)}${'⭐'.repeat(5-adityaResult.bi_tools)} | ${'⭐'.repeat(arunResult.bi_tools)}${'⭐'.repeat(5-arunResult.bi_tools)}`);
  console.log(`ML/AI               | ${'⭐'.repeat(adityaResult.ml_ai)}${'⭐'.repeat(5-adityaResult.ml_ai)} | ${'⭐'.repeat(arunResult.ml_ai)}${'⭐'.repeat(5-arunResult.ml_ai)}`);
  console.log(`Domain Relevance    | ${'⭐'.repeat(adityaResult.domain_relevance)}${'⭐'.repeat(5-adityaResult.domain_relevance)} | ${'⭐'.repeat(arunResult.domain_relevance)}${'⭐'.repeat(5-arunResult.domain_relevance)}`);
  console.log(`Overall Fit         | ${adityaResult.decision === 'Strong' ? '✅ Strong' : adityaResult.decision === 'Moderate' ? '⚠️ Moderate' : '❌ Weak'} | ${arunResult.decision === 'Strong' ? '✅ Strong' : arunResult.decision === 'Moderate' ? '⚠️ Moderate' : '❌ Weak'}`);

  console.log('\n🎯 KEY INSIGHTS:');
  console.log(`Aditya: ${adityaResult.overall_fit}% - ${adityaResult.decision}`);
  console.log(`Arun: ${arunResult.overall_fit}% - ${arunResult.decision}`);
  
  const scoreDifference = adityaResult.overall_fit - arunResult.overall_fit;
  console.log(`Difference: ${scoreDifference}%`);

  if (scoreDifference > 20) {
    console.log('\n🚨 ISSUE IDENTIFIED:');
    console.log('ChatGPT-style evaluation shows Aditya stronger than ATS');
    console.log('ATS is missing transferable skills and leadership potential');
  }

  console.log('\n💡 RECOMMENDATIONS:');
  console.log('1. ATS should recognize transferable skills');
  console.log('2. Leadership experience should count for stakeholder management');
  console.log('3. Technical leadership should count as business partnership');
  console.log('4. Data visualization experience should count for BI tools');
  console.log('5. Cross-functional collaboration should count for domain relevance');

  return { adityaResult, arunResult };
}

// Run comparison
compareCandidates().catch(console.error);
