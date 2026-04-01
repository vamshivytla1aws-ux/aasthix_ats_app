/**
 * Simple test script to verify the enhanced matching system is working
 */

// Test the enhanced matching system
import { computeRuleBasedMatchScore } from './lib/candidateJobMatchScore';
import { parseCandidateSkillsNormalized, displaySkillLabel } from './lib/skillNormalization';
import { parseCandidateExperienceYears, scoreRoleCompatibility } from './lib/experienceSignals';

// Test data
const jobProfile = {
  must_have: ['react', 'typescript', 'node.js', 'aws'],
  nice_to_have: ['docker', 'kubernetes', 'graphql'],
  keywords: ['frontend', 'backend', 'fullstack'],
  mode: 'AI' as const
};

const testCandidates = [
  {
    name: 'Strong Candidate',
    skills: 'React, TypeScript, Node.js, AWS, Docker, Kubernetes, GraphQL, 5 years experience',
    location: 'San Francisco'
  },
  {
    name: 'Weak Candidate', 
    skills: 'Python, Django, MySQL, 2 years experience',
    location: 'New York'
  },
  {
    name: 'Overqualified Candidate',
    skills: 'Senior React Developer with 10+ years, TypeScript, Node.js, AWS, Docker, K8s, GraphQL',
    location: 'Remote'
  }
];

console.log('🚀 Testing Enhanced Matching System\n');

testCandidates.forEach((candidate, index) => {
  console.log(`\n--- Candidate ${index + 1}: ${candidate.name} ---`);
  
  // Test skill parsing
  const parsedSkills = parseCandidateSkillsNormalized(candidate.skills);
  console.log('Parsed skills:', Array.from(parsedSkills).map(displaySkillLabel).join(', '));
  
  // Test experience parsing
  const experience = parseCandidateExperienceYears(candidate.skills);
  console.log('Experience years:', experience);
  
  // Test matching
  const result = computeRuleBasedMatchScore({
    profile: jobProfile,
    candidateSkillsRaw: candidate.skills,
    candidateLocation: candidate.location,
    jobLocation: 'San Francisco',
    jobTitle: 'Senior Full Stack Developer',
    experienceRequirement: '4-6 years'
  });
  
  console.log(`Match Score: ${result.score}%`);
  console.log(`Matched Skills: ${result.matched.join(', ')}`);
  console.log(`Missing Skills: ${result.missingMust.join(', ')}`);
  console.log(`Penalties: ${result.breakdown.penalties.join('; ')}`);
  console.log(`Components: Skills ${result.breakdown.skills_component}%, Experience ${result.breakdown.experience_component}%, Title ${result.breakdown.title_component}%`);
});

console.log('\n✅ Enhanced Matching System Test Complete!');
