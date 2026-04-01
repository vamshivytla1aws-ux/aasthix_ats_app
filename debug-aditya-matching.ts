/**
 * Comprehensive debugging script for Aditya Pandita matching issue
 */

import { computeRuleBasedMatchScore } from './lib/candidateJobMatchScore.js';
import { parseCandidateSkillsNormalized, displaySkillLabel } from './lib/skillNormalization.js';
import { parseCandidateExperienceYears } from './lib/experienceSignals.js';
import { extractJobSkillProfile } from './lib/jdSkillExtraction.js';
import { scoreCandidatesBatchWithOpenAI } from './lib/matchScoreAi.js';

// Test data for Aditya Pandita
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

const sampleJobDescription = `We are looking for a Senior Full Stack Developer to join our growing team.

REQUIREMENTS:
- 8+ years of experience in software development
- Strong proficiency in React and Node.js
- Experience with AWS cloud services
- Knowledge of modern web development practices
- Bachelor's degree in Computer Science or related field

RESPONSIBILITIES:
- Design and develop scalable web applications
- Lead technical projects and mentor junior developers
- Collaborate with cross-functional teams
- Ensure code quality and best practices
- Deploy and maintain applications on cloud platforms

QUALIFICATIONS:
- Expert in React, Node.js, and JavaScript
- Experience with AWS, Docker, and Kubernetes
- Strong understanding of databases and REST APIs
- Excellent problem-solving and communication skills
- Experience with agile development methodologies`;

console.log('🔍 DEBUGGING ADITYA PANDITA MATCHING ISSUE\n');
console.log('='.repeat(80));

// STEP 1: DEBUG INPUT DATA
console.log('\n📋 STEP 1: INPUT DATA ANALYSIS');
console.log('Resume Text Length:', adityaResume.length, 'characters');

// Parse candidate skills
const candidateSkills = parseCandidateSkillsNormalized(adityaResume);
console.log('\n🔧 Candidate Skills Extracted:');
Array.from(candidateSkills).forEach(skill => {
  console.log(`  - ${displaySkillLabel(skill)}`);
});

// Parse candidate experience
const candidateExperience = parseCandidateExperienceYears(adityaResume);
console.log('\n💼 Candidate Experience:', candidateExperience, 'years');

// Extract job profile
console.log('\n📝 Extracting Job Profile...');
const jobProfile = await extractJobSkillProfile({
  title: 'Senior Full Stack Developer',
  description: sampleJobDescription,
  employmentType: 'full-time'
});

console.log('\n📊 Job Profile Extracted:');
console.log('Must Have Skills:', jobProfile.must_have);
console.log('Nice to Have Skills:', jobProfile.nice_to_have);
console.log('Keywords:', jobProfile.keywords);
console.log('Extraction Mode:', jobProfile.mode);

// STEP 2: CURRENT ATS MATCHING
console.log('\n🎯 STEP 2: CURRENT ATS MATCHING');
const currentResult = computeRuleBasedMatchScore({
  profile: jobProfile,
  candidateSkillsRaw: adityaResume,
  candidateLocation: 'Bangalore, India',
  jobLocation: 'Bangalore, India',
  jobTitle: 'Senior Full Stack Developer',
  experienceRequirement: '8+ years'
});

console.log('\n📈 Current ATS Results:');
console.log(`Final Score: ${currentResult.score}%`);
console.log('Matched Skills:', currentResult.matched);
console.log('Missing Skills:', currentResult.missingMust);
console.log('Breakdown:', currentResult.breakdown);
console.log('Penalties:', currentResult.breakdown.penalties);

// STEP 3: AI GROUND TRUTH
console.log('\n🤖 STEP 3: AI GROUND TRUTH COMPARISON');

const aiPrompt = `You are an expert technical recruiter. Compare this candidate with the job description and provide a detailed analysis.

CANDIDATE: Aditya Pandita
${adityaResume}

JOB DESCRIPTION:
${sampleJobDescription}

Please analyze and return:
1. match_score (0-100): Overall match percentage
2. matched_skills: List of skills that match the requirements
3. missing_skills: List of important skills that are missing
4. reasoning: Detailed explanation of the score

Return ONLY valid JSON format:
{
  "match_score": number,
  "matched_skills": string[],
  "missing_skills": string[],
  "reasoning": string
}`;

// Call OpenAI for ground truth
try {
  const aiResult = await scoreCandidatesBatchWithOpenAI({
    jobTitle: 'Senior Full Stack Developer',
    jobDescriptionExcerpt: sampleJobDescription,
    experienceRequirement: '8+ years',
    mustHave: jobProfile.must_have,
    niceToHave: jobProfile.nice_to_have,
    keywords: jobProfile.keywords,
    candidates: [{
      id: 1,
      full_name: 'Aditya Pandita',
      skills: adityaResume,
      location: 'Bangalore, India'
    }]
  });

  if (aiResult && aiResult.has(1)) {
    const aiData = aiResult.get(1);
    if (aiData) {
      console.log('\n🎯 AI Ground Truth Results:');
      console.log(`AI Score: ${aiData.match_score}%`);
      console.log('AI Matched Skills:', aiData.matched_skills);
      console.log('AI Missing Skills:', aiData.missing_skills);
      console.log('AI Reasoning:', aiData.reasoning);

      // STEP 4: COMPARISON ANALYSIS
      console.log('\n📊 STEP 4: COMPARISON ANALYSIS');
      console.log('='.repeat(50));
      console.log(`ATS Score:    ${currentResult.score}%`);
      console.log(`AI Score:     ${aiData.match_score}%`);
      console.log(`Difference:    ${Math.abs(currentResult.score - aiData.match_score)}%`);
      
      if (Math.abs(currentResult.score - aiData.match_score) > 30) {
        console.log('\n🚨 CRITICAL ISSUE: Large score discrepancy detected!');
        console.log('Possible causes:');
        console.log('1. ATS parsing issues');
        console.log('2. Skill normalization problems');
        console.log('3. Scoring logic errors');
        console.log('4. Missing semantic understanding');
      }

      // STEP 5: DETAILED BREAKDOWN ANALYSIS
      console.log('\n🔍 STEP 5: DETAILED BREAKDOWN ANALYSIS');
      console.log('ATS Components:');
      console.log(`  Skills Component: ${currentResult.breakdown.skills_component}%`);
      console.log(`  Experience Component: ${currentResult.breakdown.experience_component}%`);
      console.log(`  Title Component: ${currentResult.breakdown.title_component}%`);
      console.log(`  Location Component: ${currentResult.breakdown.location_component}%`);
      console.log(`  Bonus Component: ${currentResult.breakdown.bonus_component}%`);

      // Analyze skill matching
      const requiredSkills = new Set(jobProfile.must_have);
      const matchedSkills = new Set(candidateSkills);
      let actualMatches = 0;
      let actualMisses = 0;

      requiredSkills.forEach(skill => {
        if (matchedSkills.has(skill)) {
          actualMatches++;
        } else {
          actualMisses++;
          console.log(`❌ Missing required skill: ${displaySkillLabel(skill)}`);
        }
      });

      console.log(`\nSkill Analysis:`);
      console.log(`  Required: ${requiredSkills.size}`);
      console.log(`  Matched: ${actualMatches}`);
      console.log(`  Missed: ${actualMisses}`);
      console.log(`  Match Rate: ${((actualMatches / requiredSkills.size) * 100).toFixed(1)}%`);
    }
  } else {
    console.log('❌ AI API call failed');
  }

} catch (error) {
  console.error('❌ Error during AI comparison:', error);
}

console.log('\n🎯 DEBUGGING COMPLETE');
console.log('='.repeat(80));
