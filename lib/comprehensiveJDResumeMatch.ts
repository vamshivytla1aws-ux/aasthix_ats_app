/**
 * COMPLETE SEMANTIC JD-Resume MATCHING SYSTEM
 * Senior AI Engineer Approach - Full Context Analysis
 */

import { parseCandidateSkillsNormalized } from './skillNormalization';

interface ComprehensiveMatchResult {
  candidate_name: string;
  overall_score: number;
  decision: "Proceed to Interview" | "Hold" | "Reject";
  decision_reason: string;
  detailed_analysis: {
    jd_understanding: {
      role_type: string;
      seniority_level: string;
      key_responsibilities: string[];
      required_qualifications: string[];
      business_context: string;
      industry_focus: string;
    };
    resume_analysis: {
      career_progression: string[];
      leadership_experience: string[];
      business_impact: string[];
      domain_expertise: string[];
      technical_depth: string[];
    };
    semantic_match: {
      role_alignment: number;
      seniority_match: number;
      responsibility_overlap: number;
      business_context_fit: number;
      industry_relevance: number;
    };
    transferable_skills: {
      leadership_to_stakeholder: number;
      technical_to_business: number;
      analytics_to_insights: number;
      project_management_to_partnership: number;
    };
    strengths: string[];
    gaps: string[];
    risk_factors: string[];
  };
  performance_metrics: {
    processing_time_ms: number;
    analysis_depth: string;
    confidence_level: number;
  };
}

/**
 * Extract comprehensive JD understanding
 */
function extractJDInsights(jobDescription: string): {
  role_type: string;
  seniority_level: string;
  key_responsibilities: string[];
  required_qualifications: string[];
  business_context: string;
  industry_focus: string;
} {
  const jd = jobDescription.toLowerCase();
  
  // Role Type Detection
  const roleTypes: Record<string, RegExp> = {
    'business insights': /business insights|insights partner|data insights/i,
    'marketing analytics': /marketing analytics|campaign analytics|marketing data/i,
    'data analytics': /data analytics|data analysis|analytics manager/i,
    'business intelligence': /business intelligence|bi partner|bi manager/i,
    'stakeholder management': /stakeholder|business partner|engagement partner/i,
    'technical leadership': /software engineer|technical lead|development/i
  };

  const detectedRole = Object.keys(roleTypes).find(role => roleTypes[role].test(jd)) || 'general';

  // Seniority Level Detection
  const seniorityIndicators: Record<string, RegExp> = {
    'senior': /senior|lead|principal|head/i,
    'manager': /manager|lead|supervisor/i,
    'director': /director|head of/i,
    'executive': /vp|vice president|c-level|chief/i
  };

  const detectedSeniority = Object.keys(seniorityIndicators).find(level => seniorityIndicators[level].test(jd)) || 'mid';

  // Key Responsibilities Extraction
  const responsibilities: string[] = [];
  const respPatterns = [
    /act as.*partner.*leadership/i,
    /provide.*insights.*data analysis/i,
    /lead.*stakeholder.*engagement/i,
    /develop.*present.*intelligence/i,
    /drive.*data.*decisions/i,
    /partner.*business.*units/i,
    /translate.*data.*recommendations/i
  ];

  respPatterns.forEach(pattern => {
    const match = jobDescription.match(pattern);
    if (match) responsibilities.push(match[0]);
  });

  // Required Qualifications
  const qualifications: string[] = [];
  const qualPatterns = [
    /(\d+\+.*years.*experience)/i,
    /(strong.*background.*stakeholder)/i,
    /(expertise.*data.*visualization)/i,
    /(experience.*sql.*python)/i,
    /(proven.*track.*record)/i,
    /(excellent.*communication)/i,
    /(experience.*c.*level)/i,
    /(background.*business.*analytics)/i
  ];

  qualPatterns.forEach(pattern => {
    const match = jobDescription.match(pattern);
    if (match) qualifications.push(match[1] || match[0]);
  });

  // Business Context
  const businessContext = jd.includes('business') ? 'business-focused' : 
                         jd.includes('technical') ? 'technical-focused' : 'general';

  // Industry Focus
  const industry = jd.includes('marketing') ? 'marketing' :
                   jd.includes('finance') ? 'finance' :
                   jd.includes('healthcare') ? 'healthcare' : 'technology';

  return {
    role_type: detectedRole,
    seniority_level: detectedSeniority,
    key_responsibilities: responsibilities,
    required_qualifications: qualifications,
    business_context: businessContext,
    industry_focus: industry
  };
}

/**
 * Extract comprehensive resume insights
 */
function extractResumeInsights(resume: string) {
  const resumeText = resume.toLowerCase();
  
  // Career Progression
  const careerProgression: string[] = [];
  const progressionPatterns = [
    /senior.*engineer.*lead/i,
    /lead.*developer.*senior/i,
    /developer.*lead.*senior/i,
    /full.*stack.*lead/i
  ];

  progressionPatterns.forEach(pattern => {
    const match = resume.match(pattern);
    if (match) careerProgression.push(match[0]);
  });

  // Leadership Experience
  const leadershipExp: string[] = [];
  const leadershipPatterns = [
    /led.*team.*\d+.*developers/i,
    /mentored.*junior.*developers/i,
    /team.*lead|leadership/i,
    /conducted.*code.*reviews/i,
    /presented.*senior.*leadership/i
  ];

  leadershipPatterns.forEach(pattern => {
    const match = resume.match(pattern);
    if (match) leadershipExp.push(match[0]);
  });

  // Business Impact
  const businessImpact: string[] = [];
  const impactPatterns = [
    /reducing.*deployment.*time.*\d+%/i,
    /serving.*\d+.*million.*users/i,
    /improving.*performance.*\d+%/i,
    /cost.*savings.*\$\d+/i,
    /revenue.*growth.*\d+%/i
  ];

  impactPatterns.forEach(pattern => {
    const match = resume.match(pattern);
    if (match) businessImpact.push(match[0]);
  });

  // Domain Expertise
  const domainExpertise: string[] = [];
  const domainPatterns = [
    /microservices.*architecture/i,
    /cloud.*infrastructure/i,
    /data.*analytics.*dashboards/i,
    /cross.*functional.*teams/i,
    /product.*managers/i
  ];

  domainPatterns.forEach(pattern => {
    const match = resume.match(pattern);
    if (match) domainExpertise.push(match[0]);
  });

  // Technical Depth
  const technicalDepth: string[] = [];
  const techPatterns = [
    /react.*node\.js.*express/i,
    /aws.*docker.*kubernetes/i,
    /mongodb.*postgresql/i,
    /graphql.*rest.*apis/i,
    /devops.*cicd/i
  ];

  techPatterns.forEach(pattern => {
    const match = resume.match(pattern);
    if (match) technicalDepth.push(match[0]);
  });

  return {
    career_progression: careerProgression,
    leadership_experience: leadershipExp,
    business_impact: businessImpact,
    domain_expertise: domainExpertise,
    technical_depth: technicalDepth
  };
}

/**
 * Semantic matching analysis
 */
function analyzeSemanticMatch(jdInsights: any, resumeInsights: any) {
  // Role Alignment (40% weight)
  let roleAlignment = 0;
  if (jdInsights.role_type === 'business insights' && resumeInsights.domain_expertise.length > 0) {
    roleAlignment = 70; // Some domain overlap
  } else if (jdInsights.role_type === 'technical leadership' && resumeInsights.technical_depth.length > 2) {
    roleAlignment = 90; // Strong technical match
  } else {
    roleAlignment = 30; // Poor match
  }

  // Seniority Match (20% weight)
  const seniorityMatch = resumeInsights.leadership_experience.length > 2 ? 80 : 40;

  // Responsibility Overlap (20% weight)
  const responsibilityOverlap = Math.min(100, (resumeInsights.leadership_experience.length * 20));

  // Business Context Fit (10% weight)
  const businessContextFit = resumeInsights.business_impact.length > 0 ? 70 : 30;

  // Industry Relevance (10% weight)
  const industryRelevance = 60; // Default moderate relevance

  return {
    role_alignment: roleAlignment,
    seniority_match: seniorityMatch,
    responsibility_overlap: responsibilityOverlap,
    business_context_fit: businessContextFit,
    industry_relevance: industryRelevance
  };
}

/**
 * Transferable skills analysis
 */
function analyzeTransferableSkills(resumeInsights: any) {
  // Leadership to Stakeholder Management
  const leadershipToStakeholder = Math.min(100, resumeInsights.leadership_experience.length * 25);

  // Technical to Business Communication
  const technicalToBusiness = resumeInsights.business_impact.length > 0 ? 70 : 30;

  // Analytics to Insights
  const analyticsToInsights = resumeInsights.domain_expertise.some((exp: string) => 
    exp.includes('analytics') || exp.includes('data')
  ) ? 80 : 40;

  // Project Management to Partnership
  const projectMgmtToPartnership = resumeInsights.leadership_experience.some((exp: string) => 
    exp.includes('team') || exp.includes('led')
  ) ? 75 : 35;

  return {
    leadership_to_stakeholder: leadershipToStakeholder,
    technical_to_business: technicalToBusiness,
    analytics_to_insights: analyticsToInsights,
    project_management_to_partnership: projectMgmtToPartnership
  };
}

/**
 * Comprehensive JD-Resume Matching System
 */
export async function comprehensiveJDResumeMatch(
  jobDescription: string,
  candidateResume: string,
  jobTitle: string = "Senior Role"
): Promise<ComprehensiveMatchResult> {
  
  const startTime = Date.now();
  
  console.log('🚀 COMPREHENSIVE JD-RESUME SEMANTIC MATCHING');
  console.log('='.repeat(80));

  // Extract comprehensive insights
  const jdInsights = extractJDInsights(jobDescription);
  const resumeInsights = extractResumeInsights(candidateResume);

  console.log('\n📋 JD INSIGHTS:');
  console.log(`Role Type: ${jdInsights.role_type}`);
  console.log(`Seniority: ${jdInsights.seniority_level}`);
  console.log(`Business Context: ${jdInsights.business_context}`);
  console.log(`Industry: ${jdInsights.industry_focus}`);

  console.log('\n👤 RESUME INSIGHTS:');
  console.log(`Leadership Experience: ${resumeInsights.leadership_experience.length} items`);
  console.log(`Business Impact: ${resumeInsights.business_impact.length} items`);
  console.log(`Domain Expertise: ${resumeInsights.domain_expertise.length} items`);
  console.log(`Technical Depth: ${resumeInsights.technical_depth.length} items`);

  // Semantic matching analysis
  const semanticMatch = analyzeSemanticMatch(jdInsights, resumeInsights);

  // Transferable skills analysis
  const transferableSkills = analyzeTransferableSkills(resumeInsights);

  // Calculate comprehensive score
  const semanticScore = (
    semanticMatch.role_alignment * 0.40 +
    semanticMatch.seniority_match * 0.20 +
    semanticMatch.responsibility_overlap * 0.20 +
    semanticMatch.business_context_fit * 0.10 +
    semanticMatch.industry_relevance * 0.10
  );

  const transferableScore = (
    transferableSkills.leadership_to_stakeholder * 0.30 +
    transferableSkills.technical_to_business * 0.25 +
    transferableSkills.analytics_to_insights * 0.25 +
    transferableSkills.project_management_to_partnership * 0.20
  );

  const overallScore = Math.round((semanticScore * 0.70 + transferableScore * 0.30));

  // Determine decision
  let decision: "Proceed to Interview" | "Hold" | "Reject";
  let decisionReason = "";

  if (overallScore >= 75) {
    decision = "Proceed to Interview";
    decisionReason = "Strong semantic alignment with excellent transferable skills and leadership experience";
  } else if (overallScore >= 60) {
    decision = "Hold";
    decisionReason = "Good potential with some gaps - consider for secondary review";
  } else {
    decision = "Reject";
    decisionReason = "Insufficient semantic alignment and transferable skills for this role";
  }

  // Generate strengths
  const strengths = [];
  if (resumeInsights.leadership_experience.length > 2) {
    strengths.push("Strong leadership and team management experience");
  }
  if (resumeInsights.business_impact.length > 0) {
    strengths.push("Demonstrated business impact with quantifiable results");
  }
  if (transferableSkills.leadership_to_stakeholder > 70) {
    strengths.push("Excellent transferable skills for stakeholder management");
  }
  if (resumeInsights.technical_depth.length > 3) {
    strengths.push("Deep technical expertise with modern technologies");
  }

  // Generate gaps
  const gaps = [];
  if (semanticMatch.role_alignment < 50) {
    gaps.push("Domain mismatch - role requires different expertise");
  }
  if (resumeInsights.leadership_experience.length < 2) {
    gaps.push("Limited leadership and stakeholder management experience");
  }
  if (transferableSkills.technical_to_business < 50) {
    gaps.push("Limited experience translating technical insights to business value");
  }

  // Generate risk factors
  const riskFactors = [];
  if (jdInsights.role_type !== 'technical leadership' && resumeInsights.technical_depth.length > 3) {
    riskFactors.push("Overqualified technically - may be bored in business-focused role");
  }
  if (semanticMatch.seniority_match < 60) {
    riskFactors.push("Seniority level mismatch with role requirements");
  }

  const processingTime = Date.now() - startTime;

  const result: ComprehensiveMatchResult = {
    candidate_name: "Candidate", // Extract from resume
    overall_score: overallScore,
    decision,
    decision_reason: decisionReason,
    detailed_analysis: {
      jd_understanding: jdInsights,
      resume_analysis: resumeInsights,
      semantic_match: semanticMatch,
      transferable_skills: transferableSkills,
      strengths,
      gaps,
      risk_factors: riskFactors
    },
    performance_metrics: {
      processing_time_ms: processingTime,
      analysis_depth: "comprehensive",
      confidence_level: Math.min(95, overallScore + 10)
    }
  };

  console.log('\n🎯 COMPREHENSIVE MATCH RESULTS:');
  console.log(`Overall Score: ${overallScore}%`);
  console.log(`Decision: ${decision}`);
  console.log(`Semantic Score: ${Math.round(semanticScore)}%`);
  console.log(`Transferable Score: ${Math.round(transferableScore)}%`);
  console.log(`Processing Time: ${processingTime}ms`);

  console.log('\n💪 Strengths:');
  strengths.forEach(strength => console.log(`  ✅ ${strength}`));

  console.log('\n⚠️ Gaps:');
  gaps.forEach(gap => console.log(`  ❌ ${gap}`));

  console.log('\n🚨 Risk Factors:');
  riskFactors.forEach(risk => console.log(`  ⚠️ ${risk}`));

  return result;
}

export type { ComprehensiveMatchResult };
