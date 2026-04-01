/**
 * Enhanced match debugging and visibility utilities
 */

import type { MatchBreakdown } from "@/lib/candidateJobMatchScore";
import type { AiMatchResult } from "@/lib/matchScoreAi";

export interface MatchDebugInfo {
  candidate_id: number;
  candidate_name: string;
  final_score: number;
  rule_score: number;
  ai_score: number | null;
  breakdown: MatchBreakdown;
  insights: MatchInsight[];
  recommendations: string[];
  comparison: ScoreComparison;
}

export interface MatchInsight {
  type: 'strength' | 'weakness' | 'neutral';
  category: 'skills' | 'experience' | 'role' | 'location' | 'ai';
  title: string;
  description: string;
  impact: number; // -100 to 100
  actionable: boolean;
}

export interface ScoreComparison {
  vs_previous_score?: number;
  vs_ai_only?: number;
  vs_rule_only?: number;
  confidence_level: 'high' | 'medium' | 'low';
}

/**
 * Generate comprehensive debugging information for match results
 */
export function generateMatchDebugInfo(
  candidateId: number,
  candidateName: string,
  breakdown: MatchBreakdown,
  aiResult: AiMatchResult | null,
  previousScore?: number
): MatchDebugInfo {
  const insights: MatchInsight[] = [];
  
  // Skills insights
  if (breakdown.must_total > 0) {
    const mustHitRate = breakdown.must_matched / breakdown.must_total;
    if (mustHitRate >= 0.9) {
      insights.push({
        type: 'strength',
        category: 'skills',
        title: 'Excellent Core Skills Match',
        description: `Candidate has ${breakdown.must_matched}/${breakdown.must_total} required skills (${Math.round(mustHitRate * 100)}%)`,
        impact: 25,
        actionable: false
      });
    } else if (mustHitRate < 0.5) {
      insights.push({
        type: 'weakness',
        category: 'skills',
        title: 'Critical Skills Gap',
        description: `Missing ${breakdown.must_total - breakdown.must_matched} required skills`,
        impact: -30,
        actionable: true
      });
    }
  }
  
  // Experience insights
  if (breakdown.job_experience_label && breakdown.candidate_years_estimated !== null) {
    const expFit = breakdown.experience_component;
    if (expFit >= 90) {
      insights.push({
        type: 'strength',
        category: 'experience',
        title: 'Perfect Experience Alignment',
        description: `Candidate experience matches JD requirement perfectly`,
        impact: 15,
        actionable: false
      });
    } else if (expFit < 50) {
      insights.push({
        type: 'weakness',
        category: 'experience',
        title: 'Experience Mismatch',
        description: `Experience level misalignment detected`,
        impact: -20,
        actionable: true
      });
    }
  }
  
  // Title/Role insights
  if (breakdown.title_component >= 85) {
    insights.push({
      type: 'strength',
      category: 'role',
      title: 'Strong Role Alignment',
      description: 'Title and role semantics match well',
      impact: 10,
      actionable: false
    });
  } else if (breakdown.title_component < 60) {
    insights.push({
      type: 'weakness',
      category: 'role',
      title: 'Role Mismatch',
      description: 'Title and role context misalignment',
      impact: -15,
      actionable: true
    });
  }
  
  // AI insights
  if (aiResult) {
    if (aiResult.match_score >= 80) {
      insights.push({
        type: 'strength',
        category: 'ai',
        title: 'AI Confirms Strong Match',
        description: aiResult.reasoning,
        impact: 10,
        actionable: false
      });
    } else if (aiResult.match_score < 60) {
      insights.push({
        type: 'weakness',
        category: 'ai',
        title: 'AI Flags Concerns',
        description: aiResult.reasoning,
        impact: -15,
        actionable: true
      });
    }
  }
  
  // Penalty insights
  if (breakdown.penalties.length > 0) {
    insights.push({
      type: 'weakness',
      category: 'skills',
      title: 'Penalties Applied',
      description: breakdown.penalties.join('; '),
      impact: -10,
      actionable: true
    });
  }
  
  // Generate recommendations
  const recommendations = generateRecommendations(insights, breakdown, aiResult);
  
  // Calculate confidence level
  const confidenceLevel = calculateConfidenceLevel(breakdown, aiResult);
  
  // Score comparison
  const comparison: ScoreComparison = {
    vs_previous_score: previousScore,
    vs_ai_only: aiResult?.match_score,
    vs_rule_only: breakdown.rule_score,
    confidence_level: confidenceLevel
  };
  
  return {
    candidate_id: candidateId,
    candidate_name: candidateName,
    final_score: breakdown.hybrid_score,
    rule_score: breakdown.rule_score,
    ai_score: breakdown.ai_score,
    breakdown,
    insights,
    recommendations,
    comparison
  };
}

/**
 * Generate actionable recommendations based on match analysis
 */
function generateRecommendations(
  insights: MatchInsight[],
  breakdown: MatchBreakdown,
  aiResult: AiMatchResult | null
): string[] {
  const recommendations: string[] = [];
  
  const skillWeaknesses = insights.filter(i => i.category === 'skills' && i.type === 'weakness');
  const experienceWeaknesses = insights.filter(i => i.category === 'experience' && i.type === 'weakness');
  const roleWeaknesses = insights.filter(i => i.category === 'role' && i.type === 'weakness');
  
  if (skillWeaknesses.length > 0) {
    if (breakdown.ai_missing_skills && breakdown.ai_missing_skills.length > 0) {
      recommendations.push(`Focus on missing critical skills: ${breakdown.ai_missing_skills.slice(0, 3).join(', ')}`);
    }
    recommendations.push('Consider skills assessment for missing required competencies');
  }
  
  if (experienceWeaknesses.length > 0) {
    recommendations.push('Verify experience level through detailed interview questions');
    recommendations.push('Consider portfolio review for practical experience validation');
  }
  
  if (roleWeaknesses.length > 0) {
    recommendations.push('Explore candidate\'s interest in role transition');
    recommendations.push('Assess transferable skills from previous roles');
  }
  
  if (breakdown.ai_score && breakdown.rule_score) {
    const scoreDiff = Math.abs(breakdown.ai_score - breakdown.rule_score);
    if (scoreDiff > 20) {
      recommendations.push('Review discrepancy between AI and rule-based scoring');
    }
  }
  
  // Positive recommendations for strong matches
  const strongInsights = insights.filter(i => i.type === 'strength');
  if (strongInsights.length >= 3) {
    recommendations.push('High-priority candidate - consider fast-tracking');
  }
  
  return recommendations;
}

/**
 * Calculate confidence level for the match score
 */
function calculateConfidenceLevel(
  breakdown: MatchBreakdown,
  aiResult: AiMatchResult | null
): 'high' | 'medium' | 'low' {
  let confidence = 50;
  
  // Higher confidence when AI and rule scores align
  if (aiResult) {
    const scoreDiff = Math.abs(breakdown.rule_score - aiResult.match_score);
    if (scoreDiff < 10) confidence += 30;
    else if (scoreDiff < 20) confidence += 15;
    else confidence -= 10;
  }
  
  // Higher confidence with more data points
  if (breakdown.must_total >= 3) confidence += 10;
  if (breakdown.experience_component > 0) confidence += 10;
  if (breakdown.title_component > 0) confidence += 10;
  
  // Lower confidence with many penalties
  if (breakdown.penalties.length > 2) confidence -= 15;
  
  if (confidence >= 75) return 'high';
  if (confidence >= 50) return 'medium';
  return 'low';
}

/**
 * Format match breakdown for UI display
 */
export function formatMatchForUI(debugInfo: MatchDebugInfo): {
  scoreDisplay: string;
  scoreColor: string;
  insightsByCategory: Record<string, MatchInsight[]>;
  scoreBreakdown: Array<{ label: string; value: number; weight: number }>;
  trendIndicator?: 'up' | 'down' | 'stable';
} {
  const { final_score, breakdown, insights, comparison } = debugInfo;
  
  // Score display formatting
  let scoreDisplay = `${final_score}%`;
  let scoreColor = 'gray';
  
  if (final_score >= 85) {
    scoreColor = 'green';
    scoreDisplay = `${final_score}% (Excellent)`;
  } else if (final_score >= 70) {
    scoreColor = 'blue';
    scoreDisplay = `${final_score}% (Strong)`;
  } else if (final_score >= 55) {
    scoreColor = 'yellow';
    scoreDisplay = `${final_score}% (Fair)`;
  } else {
    scoreColor = 'red';
    scoreDisplay = `${final_score}% (Weak)`;
  }
  
  // Group insights by category
  const insightsByCategory = insights.reduce((acc, insight) => {
    if (!acc[insight.category]) acc[insight.category] = [];
    acc[insight.category].push(insight);
    return acc;
  }, {} as Record<string, MatchInsight[]>);
  
  // Score breakdown components
  const scoreBreakdown = [
    { label: 'Skills Match', value: breakdown.skills_component, weight: 50 },
    { label: 'Experience Fit', value: breakdown.experience_component, weight: 20 },
    { label: 'Title/Role Match', value: breakdown.title_component, weight: 15 },
    { label: 'Location Match', value: breakdown.location_component, weight: 5 },
    { label: 'Bonus Skills', value: breakdown.bonus_component, weight: 10 }
  ];
  
  // Trend indicator
  let trendIndicator: 'up' | 'down' | 'stable' | undefined;
  if (comparison.vs_previous_score !== undefined) {
    const diff = final_score - comparison.vs_previous_score;
    if (diff > 5) trendIndicator = 'up';
    else if (diff < -5) trendIndicator = 'down';
    else trendIndicator = 'stable';
  }
  
  return {
    scoreDisplay,
    scoreColor,
    insightsByCategory,
    scoreBreakdown,
    trendIndicator
  };
}

/**
 * Export match data for analysis
 */
export function exportMatchData(debugInfos: MatchDebugInfo[]): {
  summary: {
    total_candidates: number;
    average_score: number;
    high_matches: number;
    medium_matches: number;
    low_matches: number;
    confidence_distribution: Record<string, number>;
  };
  candidates: MatchDebugInfo[];
} {
  const total = debugInfos.length;
  const avgScore = Math.round(debugInfos.reduce((sum, info) => sum + info.final_score, 0) / total);
  
  const highMatches = debugInfos.filter(info => info.final_score >= 70).length;
  const mediumMatches = debugInfos.filter(info => info.final_score >= 55 && info.final_score < 70).length;
  const lowMatches = debugInfos.filter(info => info.final_score < 55).length;
  
  const confidenceDist = debugInfos.reduce((acc, info) => {
    acc[info.comparison.confidence_level] = (acc[info.comparison.confidence_level] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return {
    summary: {
      total_candidates: total,
      average_score: avgScore,
      high_matches: highMatches,
      medium_matches: mediumMatches,
      low_matches: lowMatches,
      confidence_distribution: confidenceDist
    },
    candidates: debugInfos
  };
}
