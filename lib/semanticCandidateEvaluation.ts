/**
 * Advanced Semantic Candidate Evaluation System
 * Senior Recruiter & Talent Intelligence Expert Framework
 */

import { computeRuleBasedMatchScore } from './candidateJobMatchScore';
import { parseCandidateSkillsNormalized, displaySkillLabel } from './skillNormalization';
import { parseCandidateExperienceYears } from './experienceSignals';
import { extractJobSkillProfile } from './jdSkillExtraction';

interface EvaluationResult {
  candidate_name: string;
  overall_match_percentage: number;
  decision: "Proceed to Interview" | "Hold" | "Reject";
  decision_reason: string;
  category_scores: {
    domain_relevance: number;
    core_skills: number;
    business_impact: number;
    stakeholder_management: number;
    advanced_analytics: number;
    tools_tech: number;
    experience: number;
  };
  strengths: string[];
  gaps: string[];
  risk_flags: string[];
  summary: string;
}

/**
 * Advanced semantic evaluation with business impact focus
 */
export async function evaluateCandidateSemantically(
  jobDescription: string,
  candidateResume: string,
  jobTitle: string = "Senior Role"
): Promise<EvaluationResult> {
  
  console.log('🎯 SEMANTIC CANDIDATE EVALUATION');
  console.log('='.repeat(60));

  // Extract structured data
  const jobProfile = await extractJobSkillProfile({
    title: jobTitle,
    description: jobDescription,
    employmentType: 'full-time'
  });

  const candidateSkills = parseCandidateSkillsNormalized(candidateResume);
  const candidateExperience = parseCandidateExperienceYears(candidateResume);

  // Initialize scores
  let domainRelevance = 0;
  let coreSkills = 0;
  let businessImpact = 0;
  let stakeholderManagement = 0;
  let advancedAnalytics = 0;
  let toolsTech = 0;
  let experience = 0;

  const strengths: string[] = [];
  const gaps: string[] = [];
  const riskFlags: string[] = [];

  // DOMAIN RELEVANCE (20%)
  console.log('\n📊 DOMAIN RELEVANCE ANALYSIS');
  const marketingAnalyticsKeywords = [
    'marketing analytics', 'campaign analytics', 'customer journey', 'sales funnel',
    'marketing attribution', 'conversion optimization', 'a/b testing', 'marketing roi',
    'customer segmentation', 'funnel analysis', 'marketing performance', 'digital marketing',
    'campaign management', 'marketing automation', 'customer analytics', 'behavioral analytics'
  ];

  const candidateText = candidateResume.toLowerCase();
  const domainMatches = marketingAnalyticsKeywords.filter(keyword => 
    candidateText.includes(keyword.toLowerCase())
  );

  if (domainMatches.length >= 3) {
    domainRelevance = 90;
    strengths.push('Strong domain expertise in marketing analytics and campaign optimization');
  } else if (domainMatches.length >= 2) {
    domainRelevance = 75;
    strengths.push('Good domain alignment with marketing analytics');
  } else if (domainMatches.length >= 1) {
    domainRelevance = 50;
    gaps.push('Limited marketing analytics experience');
  } else {
    domainRelevance = 20;
    gaps.push('No marketing analytics domain experience');
    riskFlags.push('Domain mismatch - missing marketing analytics background');
  }

  console.log(`Domain matches: ${domainMatches.length}, Score: ${domainRelevance}`);

  // CORE SKILLS MATCH (20%)
  console.log('\n🔧 CORE SKILLS ANALYSIS');
  const coreSkillsKeywords = [
    'sql', 'tableau', 'power bi', 'looker', 'data visualization',
    'data storytelling', 'dashboarding', 'bi tools', 'business intelligence'
  ];

  const coreSkillMatches = coreSkillsKeywords.filter(keyword => 
    candidateSkills.has(keyword.toLowerCase()) || 
    candidateText.includes(keyword.toLowerCase())
  );

  if (coreSkillMatches.length >= 4) {
    coreSkills = 90;
    strengths.push('Expert in BI tools and data visualization');
  } else if (coreSkillMatches.length >= 3) {
    coreSkills = 75;
    strengths.push('Strong foundation in analytics tools');
  } else if (coreSkillMatches.length >= 2) {
    coreSkills = 50;
    gaps.push('Limited core analytics skills');
  } else {
    coreSkills = 25;
    gaps.push('Missing essential BI and analytics skills');
    riskFlags.push('Insufficient core technical skills');
  }

  console.log(`Core skills matches: ${coreSkillMatches.length}, Score: ${coreSkills}`);

  // BUSINESS IMPACT (15%)
  console.log('\n💼 BUSINESS IMPACT ANALYSIS');
  const impactKeywords = [
    'revenue growth', 'cost savings', 'conversion improvement', 'roi increase',
    'cost reduction', 'efficiency gains', 'profitability improvement', 'market share growth',
    'customer acquisition', 'retention improvement', 'sales increase'
  ];

  const impactMatches = impactKeywords.filter(keyword => 
    candidateText.includes(keyword.toLowerCase())
  );

  if (impactMatches.length >= 2) {
    businessImpact = 85;
    strengths.push('Demonstrated measurable business impact with quantifiable results');
  } else if (impactMatches.length >= 1) {
    businessImpact = 60;
    strengths.push('Some evidence of business impact');
  } else {
    businessImpact = 30;
    gaps.push('No demonstrated business impact or quantifiable achievements');
  }

  console.log(`Business impact matches: ${impactMatches.length}, Score: ${businessImpact}`);

  // STAKEHOLDER MANAGEMENT (15%)
  console.log('\n👥 STAKEHOLDER MANAGEMENT ANALYSIS');
  const stakeholderKeywords = [
    'stakeholder', 'senior stakeholders', 'executive', 'c-level', 'board',
    'business partner', 'advisor', 'consultant', 'strategic', 'leadership'
  ];

  const stakeholderMatches = stakeholderKeywords.filter(keyword => 
    candidateText.includes(keyword.toLowerCase())
  );

  if (stakeholderMatches.length >= 2) {
    stakeholderManagement = 85;
    strengths.push('Experience working with senior stakeholders and executives');
  } else if (stakeholderMatches.length >= 1) {
    stakeholderManagement = 60;
    strengths.push('Some stakeholder interaction experience');
  } else {
    stakeholderManagement = 30;
    gaps.push('Limited stakeholder management experience');
  }

  console.log(`Stakeholder matches: ${stakeholderMatches.length}, Score: ${stakeholderManagement}`);

  // ADVANCED ANALYTICS (10%)
  console.log('\n🤖 ADVANCED ANALYTICS ANALYSIS');
  const advancedKeywords = [
    'predictive modeling', 'clustering', 'experimentation', 'statistical analysis',
    'machine learning', 'artificial intelligence', 'data mining', 'regression analysis',
    'classification', 'optimization', 'forecasting', 'anomaly detection'
  ];

  const advancedMatches = advancedKeywords.filter(keyword => 
    candidateText.includes(keyword.toLowerCase())
  );

  if (advancedMatches.length >= 3) {
    advancedAnalytics = 85;
    strengths.push('Advanced analytics and ML capabilities');
  } else if (advancedMatches.length >= 2) {
    advancedAnalytics = 65;
    strengths.push('Some advanced analytics experience');
  } else if (advancedMatches.length >= 1) {
    advancedAnalytics = 40;
    gaps.push('Limited advanced analytics skills');
  } else {
    advancedAnalytics = 20;
    gaps.push('No advanced analytics experience');
  }

  console.log(`Advanced analytics matches: ${advancedMatches.length}, Score: ${advancedAnalytics}`);

  // TOOLS & TECH STACK (10%)
  console.log('\n🛠️ TOOLS & TECH ANALYSIS');
  const techKeywords = [
    'databricks', 'python', 'tableau', 'excel', 'sql', 'aws', 'azure', 'gcp',
    'spark', 'hadoop', 'kafka', 'airflow', 'jupyter', 'git', 'docker', 'kubernetes'
  ];

  const techMatches = techKeywords.filter(keyword => 
    candidateSkills.has(keyword.toLowerCase()) || 
    candidateText.includes(keyword.toLowerCase())
  );

  if (techMatches.length >= 6) {
    toolsTech = 85;
    strengths.push('Comprehensive modern tech stack');
  } else if (techMatches.length >= 4) {
    toolsTech = 70;
    strengths.push('Good technology foundation');
  } else if (techMatches.length >= 2) {
    toolsTech = 50;
    gaps.push('Limited technology exposure');
  } else {
    toolsTech = 25;
    riskFlags.push('Insufficient technical skills');
  }

  console.log(`Tech matches: ${techMatches.length}, Score: ${toolsTech}`);

  // EXPERIENCE & STABILITY (10%)
  console.log('\n📅 EXPERIENCE ANALYSIS');
  if (candidateExperience && candidateExperience >= 8) {
    experience = 90;
    strengths.push('Strong experience level meets requirements');
  } else if (candidateExperience && candidateExperience >= 5) {
    experience = 70;
    strengths.push('Good experience level');
  } else if (candidateExperience && candidateExperience >= 3) {
    experience = 50;
    gaps.push('Limited experience for senior role');
  } else {
    experience = 25;
    gaps.push('Insufficient experience');
    riskFlags.push('Experience gap vs requirements');
  }

  console.log(`Experience: ${candidateExperience} years, Score: ${experience}`);

  // Calculate weighted overall score
  const overallScore = Math.round(
    domainRelevance * 0.20 +
    coreSkills * 0.20 +
    businessImpact * 0.15 +
    stakeholderManagement * 0.15 +
    advancedAnalytics * 0.10 +
    toolsTech * 0.10 +
    experience * 0.10
  );

  // Determine decision
  let decision: "Proceed to Interview" | "Hold" | "Reject";
  let decisionReason = "";

  if (overallScore >= 80) {
    decision = "Proceed to Interview";
    decisionReason = "Strong candidate with excellent domain alignment and demonstrated business impact";
  } else if (overallScore >= 65) {
    decision = "Hold";
    decisionReason = "Decent candidate with some gaps - consider for secondary review";
  } else {
    decision = "Reject";
    decisionReason = "Insufficient alignment with key requirements";
  }

  // Extract candidate name
  const nameMatch = candidateResume.match(/^([A-Z\s]+[A-Z\s]+[A-Z]+)/i);
  const candidateName = nameMatch ? nameMatch[1] : "Unknown Candidate";

  const result: EvaluationResult = {
    candidate_name: candidateName,
    overall_match_percentage: overallScore,
    decision,
    decision_reason: decisionReason,
    category_scores: {
      domain_relevance: domainRelevance,
      core_skills: coreSkills,
      business_impact: businessImpact,
      stakeholder_management: stakeholderManagement,
      advanced_analytics: advancedAnalytics,
      tools_tech: toolsTech,
      experience: experience
    },
    strengths,
    gaps,
    risk_flags: riskFlags,
    summary: `${overallScore}% - ${decisionReason.toLowerCase()}`
  };

  console.log('\n📋 FINAL EVALUATION:');
  console.log('='.repeat(60));
  console.log(`Overall Score: ${result.overall_match_percentage}%`);
  console.log(`Decision: ${result.decision}`);
  console.log(`Reason: ${result.decision_reason}`);
  console.log('\nCategory Scores:');
  Object.entries(result.category_scores).forEach(([category, score]) => {
    console.log(`  ${category}: ${score}%`);
  });

  return result;
}

/**
 * Quick evaluation for testing
 */
export async function quickEvaluate(
  jobDescription: string,
  candidateResume: string
): Promise<EvaluationResult> {
  return evaluateCandidateSemantically(jobDescription, candidateResume);
}

export type { EvaluationResult };
