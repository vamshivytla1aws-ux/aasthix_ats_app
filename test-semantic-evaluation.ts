/**
 * Test the new semantic evaluation system
 */

import { evaluateCandidateSemantically } from './lib/semanticCandidateEvaluation';

const sampleJobDescription = `We are looking for a Senior Marketing Analytics Manager to lead our data-driven marketing initiatives.

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
- Advanced analytics capabilities (predictive modeling, clustering preferred)

QUALIFICATIONS:
- Bachelor's degree in Analytics, Statistics, or related field
- Expert in marketing analytics tools and BI platforms
- Strong data storytelling and communication skills
- Experience with modern data stack (Python, SQL, cloud platforms)`;

const strongCandidateResume = `JOHN SMITH
Senior Marketing Analytics Manager | Data-Driven Marketing Leader

SUMMARY
10+ years of experience in marketing analytics and campaign optimization, delivering measurable business impact through data-driven insights.

EXPERIENCE
Senior Marketing Analytics Manager
TechCorp | San Francisco, CA
Jan 2018 - Present

• Lead team of 5 analysts in developing marketing analytics and campaign performance dashboards
• Implemented predictive modeling that improved campaign ROI by 35%
• Developed customer journey analysis that reduced acquisition costs by 22%
• Present insights to C-suite executives, influencing $10M+ marketing budget decisions
• Managed A/B testing program across 50+ campaigns with 15% conversion improvement

Marketing Analytics Lead
DataDriven Inc. | New York, NY
Jun 2014 - Dec 2017

• Built campaign analytics platform from scratch using SQL and Tableau
• Analyzed customer behavior patterns leading to 25% increase in conversion rates
• Created automated dashboards for real-time campaign monitoring
• Worked with sales and marketing teams to optimize funnel performance

Data Analyst
Analytics Corp | Boston, MA
Jul 2012 - May 2014

• Developed SQL queries and Tableau dashboards for marketing campaign analysis
• Performed statistical analysis on customer segmentation and campaign effectiveness
• Created data visualizations that uncovered $2M in cost savings opportunities

EDUCATION
Master of Science in Business Analytics
University of Pennsylvania | 2010-2012

SKILLS
Technical Skills: SQL, Python, Tableau, Power BI, Looker, Databricks, AWS, Google Analytics, Adobe Analytics, R, Excel
Analytics: Campaign Analytics, Customer Journey Analysis, Funnel Analysis, A/B Testing, Conversion Optimization, Predictive Modeling, Statistical Analysis, Data Storytelling
Business Intelligence: Dashboarding, Reporting, KPI Development, Stakeholder Communication
Tools: JIRA, Confluence, Slack, Git, Jupyter, AWS S3, Redshift`;

const weakCandidateResume = `JANE DOE
Business Analyst
General Analytics Background

SUMMARY
4 years of experience in business analysis and reporting.

EXPERIENCE
Business Analyst
Finance Corp | Chicago, IL
Jan 2020 - Present

• Create monthly reports and dashboards for business performance tracking
• Analyze financial data and create presentations for management
• Work with various departments to gather requirements and deliver insights

EDUCATION
Bachelor of Arts in Business Administration
University of Illinois | 2016-2020

SKILLS
Technical Skills: Excel, PowerPoint, SQL basics, Tableau fundamentals
Business Skills: Report Writing, Data Entry, Basic Analysis`;

async function runSemanticEvaluation() {
  console.log('🎯 TESTING SEMANTIC EVALUATION SYSTEM\n');
  console.log('='.repeat(80));

  // Test strong candidate
  console.log('\n📈 TESTING STRONG CANDIDATE (JOHN SMITH)');
  const strongResult = await evaluateCandidateSemantically(
    sampleJobDescription,
    strongCandidateResume,
    'Senior Marketing Analytics Manager'
  );
  
  console.log('\nStrong Candidate Results:');
  console.log(JSON.stringify(strongResult, null, 2));

  // Test weak candidate
  console.log('\n📉 TESTING WEAK CANDIDATE (JANE DOE)');
  const weakResult = await evaluateCandidateSemantically(
    sampleJobDescription,
    weakCandidateResume,
    'Senior Marketing Analytics Manager'
  );
  
  console.log('\nWeak Candidate Results:');
  console.log(JSON.stringify(weakResult, null, 2));

  // Comparison analysis
  console.log('\n📊 COMPARISON ANALYSIS');
  console.log('='.repeat(50));
  console.log(`Strong Candidate: ${strongResult.overall_match_percentage}% - ${strongResult.decision}`);
  console.log(`Weak Candidate: ${weakResult.overall_match_percentage}% - ${weakResult.decision}`);
  
  const scoreDifference = strongResult.overall_match_percentage - weakResult.overall_match_percentage;
  console.log(`Score Difference: ${scoreDifference}%`);
  
  if (scoreDifference > 30) {
    console.log('✅ Excellent differentiation between strong and weak candidates');
  } else if (scoreDifference > 15) {
    console.log('⚠️ Good differentiation between candidates');
  } else {
    console.log('❌ Poor differentiation - review scoring logic');
  }

  console.log('\n🎯 SEMANTIC EVALUATION TEST COMPLETE');
}

// Run the test
runSemanticEvaluation().catch(console.error);
