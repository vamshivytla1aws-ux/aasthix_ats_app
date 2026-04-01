/**
 * Test the comprehensive JD-Resume matching system
 */

import { comprehensiveJDResumeMatch } from './lib/comprehensiveJDResumeMatch';

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

Full Stack Developer
StartUp Solutions | Pune, India
Jul 2016 - May 2018
• Built web applications for various clients
• Developed data visualization components for analytics
• Collaborated with business analysts to understand requirements

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
Tools: Git, JIRA, Confluence, Slack, VS Code, Postman, Tableau, Power BI, Excel, Python`;

async function testComprehensiveMatching() {
  console.log('🚀 TESTING COMPREHENSIVE JD-RESUME MATCHING');
  console.log('='.repeat(80));

  const startTime = Date.now();

  try {
    const result = await comprehensiveJDResumeMatch(
      bellfastJD,
      adityaResume,
      'Business Insights & Engagement Partner'
    );

    const processingTime = Date.now() - startTime;

    console.log('\n🎯 FINAL RESULTS:');
    console.log('='.repeat(50));
    console.log(`Candidate: ${result.candidate_name}`);
    console.log(`Overall Score: ${result.overall_score}%`);
    console.log(`Decision: ${result.decision}`);
    console.log(`Reason: ${result.decision_reason}`);
    console.log(`Processing Time: ${processingTime}ms`);

    console.log('\n📋 JD UNDERSTANDING:');
    console.log(`Role Type: ${result.detailed_analysis.jd_understanding.role_type}`);
    console.log(`Seniority: ${result.detailed_analysis.jd_understanding.seniority_level}`);
    console.log(`Business Context: ${result.detailed_analysis.jd_understanding.business_context}`);
    console.log(`Industry: ${result.detailed_analysis.jd_understanding.industry_focus}`);

    console.log('\n👤 RESUME ANALYSIS:');
    console.log(`Leadership Experience: ${result.detailed_analysis.resume_analysis.leadership_experience.length} items`);
    console.log(`Business Impact: ${result.detailed_analysis.resume_analysis.business_impact.length} items`);
    console.log(`Domain Expertise: ${result.detailed_analysis.resume_analysis.domain_expertise.length} items`);
    console.log(`Technical Depth: ${result.detailed_analysis.resume_analysis.technical_depth.length} items`);

    console.log('\n🧠 SEMANTIC MATCH:');
    console.log(`Role Alignment: ${result.detailed_analysis.semantic_match.role_alignment}%`);
    console.log(`Seniority Match: ${result.detailed_analysis.semantic_match.seniority_match}%`);
    console.log(`Responsibility Overlap: ${result.detailed_analysis.semantic_match.responsibility_overlap}%`);
    console.log(`Business Context Fit: ${result.detailed_analysis.semantic_match.business_context_fit}%`);

    console.log('\n🔄 TRANSFERABLE SKILLS:');
    console.log(`Leadership → Stakeholder: ${result.detailed_analysis.transferable_skills.leadership_to_stakeholder}%`);
    console.log(`Technical → Business: ${result.detailed_analysis.transferable_skills.technical_to_business}%`);
    console.log(`Analytics → Insights: ${result.detailed_analysis.transferable_skills.analytics_to_insights}%`);
    console.log(`Project Mgmt → Partnership: ${result.detailed_analysis.transferable_skills.project_management_to_partnership}%`);

    console.log('\n💪 STRENGTHS:');
    result.detailed_analysis.strengths.forEach(strength => {
      console.log(`  ✅ ${strength}`);
    });

    console.log('\n⚠️ GAPS:');
    result.detailed_analysis.gaps.forEach(gap => {
      console.log(`  ❌ ${gap}`);
    });

    console.log('\n🚨 RISK FACTORS:');
    result.detailed_analysis.risk_factors.forEach(risk => {
      console.log(`  ⚠️ ${risk}`);
    });

    console.log('\n📊 PERFORMANCE METRICS:');
    console.log(`Processing Time: ${result.performance_metrics.processing_time_ms}ms`);
    console.log(`Analysis Depth: ${result.performance_metrics.analysis_depth}`);
    console.log(`Confidence Level: ${result.performance_metrics.confidence_level}%`);

    // Analysis
    console.log('\n🎯 ANALYSIS:');
    if (result.overall_score >= 75) {
      console.log('✅ STRONG CANDIDATE - High semantic alignment with transferable skills');
    } else if (result.overall_score >= 60) {
      console.log('⚠️ MODERATE CANDIDATE - Some alignment but gaps exist');
    } else {
      console.log('❌ WEAK CANDIDATE - Poor semantic alignment');
    }

    console.log('\n🚀 COMPARISON WITH PREVIOUS SYSTEMS:');
    console.log(`Original ATS: ~10% (too low)`);
    console.log(`Enhanced ATS: ~77% (better)`);
    console.log(`Comprehensive: ${result.overall_score}% (full semantic analysis)`);

    return result;

  } catch (error) {
    console.error('❌ Error in comprehensive matching:', error);
    throw error;
  }
}

// Run the test
testComprehensiveMatching().catch(console.error);
