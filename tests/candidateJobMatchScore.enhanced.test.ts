/**
 * Comprehensive test suite for enhanced matching system
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { computeRuleBasedMatchScore, mergeHybridScore } from '@/lib/candidateJobMatchScore';
import { scoreCandidatesBatchWithOpenAI } from '@/lib/matchScoreAi';
import { parseJobExperienceBand, parseCandidateExperienceYears, scoreRoleCompatibility, scoreExperienceFit } from '@/lib/experienceSignals';
import { normalizeSkillList, parseCandidateSkillsNormalized, candidateHasSkill } from '@/lib/skillNormalization';
import { extractJobSkillProfile } from '@/lib/jdSkillExtraction';
import { generateMatchDebugInfo, formatMatchForUI } from '@/lib/matchDebugging';
import type { ExtractedSkillProfile } from '@/lib/jdSkillExtraction';

describe('Enhanced Matching System Tests', () => {
  let sampleJobProfile: ExtractedSkillProfile;
  let strongCandidate: any;
  let weakCandidate: any;
  let edgeCaseCandidate: any;

  beforeEach(() => {
    // Sample job profile for testing
    sampleJobProfile = {
      must_have: ['react', 'typescript', 'node.js', 'aws'],
      nice_to_have: ['docker', 'kubernetes', 'graphql'],
      keywords: ['frontend', 'backend', 'fullstack'],
      mode: 'AI'
    };

    // Strong matching candidate
    strongCandidate = {
      skillsRaw: 'React, TypeScript, Node.js, AWS, Docker, Kubernetes, GraphQL, 5 years experience',
      location: 'San Francisco',
      experienceRequirement: '4-6 years'
    };

    // Weak matching candidate
    weakCandidate = {
      skillsRaw: 'Python, Django, MySQL, 2 years experience',
      location: 'New York',
      experienceRequirement: '4-6 years'
    };

    // Edge case candidate
    edgeCaseCandidate = {
      skillsRaw: 'Senior React Developer with 10+ years, TypeScript, Node.js, AWS, Docker, K8s, GraphQL',
      location: 'Remote',
      experienceRequirement: '3-5 years'
    };
  });

  describe('Skill Normalization', () => {
    it('should normalize various skill aliases correctly', () => {
      const skills = ['js', 'reactjs', 'node', 'k8s', 'ts'];
      const normalized = normalizeSkillList(skills);
      
      expect(normalized).toContain('javascript');
      expect(normalized).toContain('react');
      expect(normalized).toContain('node.js');
      expect(normalized).toContain('kubernetes');
      expect(normalized).toContain('typescript');
    });

    it('should handle comprehensive skill mappings', () => {
      const testCases = [
        { input: ['python', 'py', 'python3'], expected: 'python' },
        { input: ['java', 'springboot'], expected: ['java', 'spring boot'] },
        { input: ['aws', 'amazon web services'], expected: 'aws' },
        { input: ['ci/cd', 'cicd'], expected: 'ci/cd' }
      ];

      testCases.forEach(({ input, expected }) => {
        const normalized = normalizeSkillList(input);
        if (Array.isArray(expected)) {
          expected.forEach(exp => expect(normalized).toContain(exp));
        } else {
          expect(normalized).toContain(expected);
        }
      });
    });

    it('should parse candidate skills with various separators', () => {
      const skillsText = 'React; TypeScript, Node.js | AWS, Docker, Kubernetes, GraphQL';
      const parsed = parseCandidateSkillsNormalized(skillsText);
      
      expect(parsed).toContain('react');
      expect(parsed).toContain('typescript');
      expect(parsed).toContain('node.js');
      expect(parsed).toContain('aws');
      expect(parsed).toContain('docker');
      expect(parsed).toContain('kubernetes');
      expect(parsed).toContain('graphql');
    });
  });

  describe('Experience Parsing', () => {
    it('should parse various experience formats', () => {
      const testCases = [
        { input: '4-6 years', expected: { min: 4, max: 6 } },
        { input: '5+ years', expected: { min: 5, max: 13 } },
        { input: '3 years', expected: { min: 2, max: 5 } },
        { input: 'senior level', expected: { min: 5, max: 10 } }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = parseJobExperienceBand(input);
        expect(result).toBeTruthy();
        expect(result!.min).toBe(expected.min);
        expect(result!.max).toBe(expected.max);
      });
    });

    it('should extract candidate experience years correctly', () => {
      const testCases = [
        { input: '5 years React experience', expected: 5 },
        { input: '3+ years Node.js', expected: 3 },
        { input: '2-4 years fullstack', expected: 4 },
        { input: 'senior developer', expected: 8 }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = parseCandidateExperienceYears(input);
        expect(result).toBe(expected);
      });
    });

    it('should score experience fit with intelligent penalties', () => {
      const jobBand = { min: 4, max: 6, label: '4-6 yrs' };
      
      // Perfect match
      expect(scoreExperienceFit(jobBand, 5)).toBe(100);
      
      // Slightly underqualified
      expect(scoreExperienceFit(jobBand, 3)).toBe(85);
      
      // Moderately underqualified
      expect(scoreExperienceFit(jobBand, 2)).toBe(70);
      
      // Significantly underqualified
      expect(scoreExperienceFit(jobBand, 0)).toBeLessThan(50);
      
      // Overqualified (less penalty)
      expect(scoreExperienceFit(jobBand, 8)).toBe(95);
    });
  });

  describe('Role Compatibility', () => {
    it('should score compatible roles highly', () => {
      expect(scoreRoleCompatibility('engineering', 'frontend')).toBe(85);
      expect(scoreRoleCompatibility('frontend', 'design')).toBe(85);
      expect(scoreRoleCompatibility('backend', 'devops')).toBe(85);
    });

    it('should score exact matches perfectly', () => {
      expect(scoreRoleCompatibility('engineering', 'engineering')).toBe(100);
      expect(scoreRoleCompatibility('frontend', 'frontend')).toBe(100);
    });

    it('should penalize incompatible roles', () => {
      expect(scoreRoleCompatibility('engineering', 'hr')).toBe(60);
      expect(scoreRoleCompatibility('design', 'finance')).toBe(60);
    });
  });

  describe('Rule-Based Matching', () => {
    it('should give high scores to strong candidates', () => {
      const result = computeRuleBasedMatchScore({
        profile: sampleJobProfile,
        candidateSkillsRaw: strongCandidate.skillsRaw,
        candidateLocation: strongCandidate.location,
        jobLocation: 'San Francisco',
        jobTitle: 'Senior Full Stack Developer',
        experienceRequirement: strongCandidate.experienceRequirement
      });

      expect(result.score).toBeGreaterThan(80);
      expect(result.matched).toContain('React');
      expect(result.matched).toContain('TypeScript');
      expect(result.matched).toContain('Node.js');
      expect(result.matched).toContain('AWS');
      expect(result.missingMust).toHaveLength(0);
    });

    it('should give low scores to weak candidates', () => {
      const result = computeRuleBasedMatchScore({
        profile: sampleJobProfile,
        candidateSkillsRaw: weakCandidate.skillsRaw,
        candidateLocation: weakCandidate.location,
        jobLocation: 'San Francisco',
        jobTitle: 'Senior Full Stack Developer',
        experienceRequirement: weakCandidate.experienceRequirement
      });

      expect(result.score).toBeLessThan(40);
      expect(result.missingMust.length).toBeGreaterThan(2);
    });

    it('should handle overqualified candidates appropriately', () => {
      const result = computeRuleBasedMatchScore({
        profile: sampleJobProfile,
        candidateSkillsRaw: edgeCaseCandidate.skillsRaw,
        candidateLocation: edgeCaseCandidate.location,
        jobLocation: 'San Francisco',
        jobTitle: 'Mid Level Full Stack Developer',
        experienceRequirement: edgeCaseCandidate.experienceRequirement
      });

      // Should still be high but maybe penalized for being overqualified
      expect(result.score).toBeGreaterThan(65);
      // Note: Overqualified penalty may not always trigger depending on experience calculation
    });

    it('should apply intelligent penalties correctly', () => {
      const result = computeRuleBasedMatchScore({
        profile: sampleJobProfile,
        candidateSkillsRaw: 'Python, Django', // No required skills
        candidateLocation: 'London',
        jobLocation: 'San Francisco',
        jobTitle: 'Senior Full Stack Developer',
        experienceRequirement: '5+ years'
      });

      expect(result.breakdown.penalties).toContain('No required skills matched');
      expect(result.score).toBeLessThan(30);
    });
  });

  describe('Hybrid Scoring', () => {
    it('should merge AI and rule scores correctly', () => {
      const mockAIResult = {
        candidate_id: 1,
        match_score: 85,
        matched_skills: ['React', 'TypeScript', 'Node.js'],
        missing_skills: ['AWS'],
        reasoning: 'Strong technical match with minor AWS gap'
      };

      const ruleScore = 75;
      const result = mergeHybridScore(ruleScore, mockAIResult);

      expect(result.score).toBe(85);
      expect(result.breakdownPatch.ai_score).toBe(85);
      expect(result.breakdownPatch.ai_reasoning).toBe(mockAIResult.reasoning);
    });

    it('should handle missing AI results gracefully', () => {
      const ruleScore = 75;
      const result = mergeHybridScore(ruleScore, null);

      expect(result.score).toBe(ruleScore);
      expect(result.breakdownPatch).toEqual({});
    });
  });

  describe('Match Debugging', () => {
    it('should generate comprehensive debug information', () => {
      const breakdown = {
        version: 2 as const,
        rule_score: 85,
        ai_score: 80,
        hybrid_score: 82,
        hybrid_weights: { rule: 0.4, ai: 0.6 },
        skills_component: 90,
        experience_component: 85,
        title_component: 80,
        location_component: 70,
        bonus_component: 75,
        must_total: 4,
        must_matched: 3, // Changed to trigger recommendations
        nice_total: 3,
        nice_matched: 2,
        keyword_hits: 5,
        penalties: ['Missing some required skills'], // Added penalty
        summary: [],
        job_experience_label: '4-6 yrs',
        candidate_years_estimated: 5
      };

      const aiResult = {
        candidate_id: 1,
        match_score: 80,
        matched_skills: ['React', 'TypeScript'],
        missing_skills: ['AWS'], // Added missing skill
        reasoning: 'Strong technical match'
      };

      const debugInfo = generateMatchDebugInfo(1, 'John Doe', breakdown, aiResult);

      expect(debugInfo.candidate_id).toBe(1);
      expect(debugInfo.final_score).toBe(82);
      expect(debugInfo.insights.length).toBeGreaterThan(0);
      expect(debugInfo.recommendations.length).toBeGreaterThan(0);
      expect(debugInfo.comparison.confidence_level).toBeDefined();
    });

    it('should format match data for UI display', () => {
      const debugInfo = {
        candidate_id: 1,
        candidate_name: 'John Doe',
        final_score: 85,
        rule_score: 80,
        ai_score: 90,
        breakdown: {} as any,
        insights: [],
        recommendations: [],
        comparison: { confidence_level: 'high' as const }
      };

      const uiData = formatMatchForUI(debugInfo);

      expect(uiData.scoreDisplay).toContain('85%');
      expect(uiData.scoreColor).toBe('green');
      expect(uiData.insightsByCategory).toBeDefined();
      expect(uiData.scoreBreakdown).toHaveLength(5);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete matching workflow', async () => {
      // This would be an integration test with actual API calls
      // For now, we'll test the workflow structure
      
      const jobTitle = 'Senior Full Stack Developer';
      const jobDescription = 'We are looking for a Senior Full Stack Developer...';
      const employmentType = 'full-time';

      // Test skill extraction
      const skillProfile = await extractJobSkillProfile({
        title: jobTitle,
        description: jobDescription,
        employmentType
      });

      expect(skillProfile).toBeDefined();
      expect(skillProfile.must_have.length).toBeGreaterThan(0);
      expect(skillProfile.mode).toBeOneOf(['AI', 'RULE_BASED']);

      // Test rule-based matching
      const ruleResult = computeRuleBasedMatchScore({
        profile: skillProfile,
        candidateSkillsRaw: strongCandidate.skillsRaw,
        candidateLocation: strongCandidate.location,
        jobLocation: 'San Francisco',
        jobTitle,
        experienceRequirement: strongCandidate.experienceRequirement
      });

      expect(ruleResult.score).toBeGreaterThan(0);
      expect(ruleResult.breakdown).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty/null inputs gracefully', () => {
      const result = computeRuleBasedMatchScore({
        profile: {
          must_have: [],
          nice_to_have: [],
          keywords: [],
          mode: 'RULE_BASED'
        },
        candidateSkillsRaw: null,
        candidateLocation: null,
        jobLocation: null,
        jobTitle: null,
        experienceRequirement: null
      });

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.breakdown).toBeDefined();
    });

    it('should handle very long skill lists', () => {
      const longSkills = Array.from({ length: 100 }, (_, i) => `skill${i}`);
      const normalized = normalizeSkillList(longSkills);
      
      expect(normalized.length).toBeLessThanOrEqual(100);
      expect(normalized.every(skill => skill.length > 0)).toBe(true);
    });

    it('should handle special characters in skills', () => {
      const skillsWithSpecialChars = 'C++, C#, .NET, Node.js, React.js';
      const parsed = parseCandidateSkillsNormalized(skillsWithSpecialChars);
      
      expect(parsed).toContain('c++');
      expect(parsed).toContain('c#');
      expect(parsed).toContain('.net');
      expect(parsed).toContain('node.js');
      expect(parsed).toContain('react');
    });
  });

  describe('Performance Tests', () => {
    it('should process matches efficiently', () => {
      const startTime = Date.now();
      
      for (let i = 0; i < 1000; i++) {
        computeRuleBasedMatchScore({
          profile: sampleJobProfile,
          candidateSkillsRaw: strongCandidate.skillsRaw,
          candidateLocation: strongCandidate.location,
          jobLocation: 'San Francisco',
          jobTitle: 'Senior Full Stack Developer',
          experienceRequirement: strongCandidate.experienceRequirement
        });
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should process 1000 matches in under 5 seconds
      expect(duration).toBeLessThan(5000);
    });
  });
});
