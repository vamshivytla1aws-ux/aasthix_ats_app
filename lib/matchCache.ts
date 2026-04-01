/**
 * Performance optimizations and caching for matching system
 */

import type { ExtractedSkillProfile } from '@/lib/jdSkillExtraction';
import type { MatchBreakdown } from '@/lib/candidateJobMatchScore';
import type { AiMatchResult } from '@/lib/matchScoreAi';

// Cache interfaces
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface MatchCacheKey {
  candidateId: number;
  jobId: number;
  profileHash: string;
  candidateHash: string;
}

interface SkillCacheKey {
  text: string;
  type: 'job' | 'candidate';
}

// Cache configuration
const CACHE_CONFIG = {
  MATCH_TTL: 30 * 60 * 1000, // 30 minutes
  SKILL_TTL: 60 * 60 * 1000, // 1 hour
  AI_TTL: 15 * 60 * 1000, // 15 minutes
  MAX_CACHE_SIZE: 10000,
  CLEANUP_INTERVAL: 5 * 60 * 1000 // 5 minutes
};

// In-memory caches (in production, use Redis or similar)
const matchCache = new Map<string, CacheEntry<MatchBreakdown>>();
const skillCache = new Map<string, CacheEntry<ExtractedSkillProfile>>();
const aiCache = new Map<string, CacheEntry<Map<number, AiMatchResult>>>();

// Cache statistics
const cacheStats = {
  hits: 0,
  misses: 0,
  sets: 0,
  evictions: 0
};

/**
 * Generate cache key for match results
 */
function generateMatchKey(key: MatchCacheKey): string {
  return `match:${key.candidateId}:${key.jobId}:${key.profileHash}:${key.candidateHash}`;
}

/**
 * Generate cache key for skill extraction
 */
function generateSkillKey(key: SkillCacheKey): string {
  return `skill:${key.type}:${Buffer.from(key.text).toString('base64').slice(0, 16)}`;
}

/**
 * Generate hash for caching
 */
function generateHash(data: any): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Check if cache entry is valid
 */
function isCacheEntryValid<T>(entry: CacheEntry<T>): boolean {
  return Date.now() - entry.timestamp < entry.ttl;
}

/**
 * Get value from cache
 */
function getFromCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) {
    cacheStats.misses++;
    return null;
  }
  
  if (!isCacheEntryValid(entry)) {
    cache.delete(key);
    cacheStats.misses++;
    return null;
  }
  
  cacheStats.hits++;
  return entry.data;
}

/**
 * Set value in cache with eviction
 */
function setInCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T, ttl: number): void {
  // Evict oldest entries if cache is full
  if (cache.size >= CACHE_CONFIG.MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
      cacheStats.evictions++;
    }
  }
  
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl
  });
  cacheStats.sets++;
}

/**
 * Clean up expired cache entries
 */
function cleanupCache(): void {
  const now = Date.now();
  
  [matchCache, skillCache, aiCache].forEach(cache => {
    for (const [key, entry] of cache.entries()) {
      if (now - entry.timestamp >= entry.ttl) {
        cache.delete(key);
      }
    }
  });
}

// Start cleanup interval
if (typeof window === 'undefined') { // Only run on server
  setInterval(cleanupCache, CACHE_CONFIG.CLEANUP_INTERVAL);
}

/**
 * Cached match computation
 */
export function computeMatchWithCache(
  candidateId: number,
  jobId: number,
  profile: ExtractedSkillProfile,
  candidateSkillsRaw: string | null | undefined,
  computeMatch: () => MatchBreakdown,
  candidateLocation?: string | null,
  jobLocation?: string | null,
  jobTitle?: string | null,
  experienceRequirement?: string | null
): MatchBreakdown {
  const profileHash = generateHash(profile);
  const candidateHash = generateHash({
    skills: candidateSkillsRaw,
    location: candidateLocation
  });
  
  const cacheKey = generateMatchKey({
    candidateId,
    jobId,
    profileHash,
    candidateHash
  });
  
  // Try to get from cache
  const cached = getFromCache(matchCache, cacheKey);
  if (cached) {
    return cached;
  }
  
  // Compute and cache result
  const result = computeMatch();
  setInCache(matchCache, cacheKey, result, CACHE_CONFIG.MATCH_TTL);
  
  return result;
}

/**
 * Cached skill extraction
 */
export function extractSkillsWithCache(
  text: string,
  type: 'job' | 'candidate',
  extractSkills: () => ExtractedSkillProfile
): ExtractedSkillProfile {
  const cacheKey = generateSkillKey({ text: text || '', type });
  
  // Try to get from cache
  const cached = getFromCache(skillCache, cacheKey);
  if (cached) {
    return cached;
  }
  
  // Extract and cache result
  const result = extractSkills();
  setInCache(skillCache, cacheKey, result, CACHE_CONFIG.SKILL_TTL);
  
  return result;
}

/**
 * Cached AI scoring
 */
export function scoreWithAIWithCache(
  jobData: any,
  candidates: any[],
  scoreWithAI: () => Promise<Map<number, AiMatchResult> | null>
): Promise<Map<number, AiMatchResult> | null> {
  const jobHash = generateHash(jobData);
  const candidatesHash = generateHash(candidates.map(c => c.id));
  const cacheKey = `ai:${jobHash}:${candidatesHash}`;
  
  // Try to get from cache
  const cached = getFromCache(aiCache, cacheKey);
  if (cached) {
    return Promise.resolve(cached);
  }
  
  // Score and cache result
  return scoreWithAI().then(result => {
    if (result) {
      setInCache(aiCache, cacheKey, result, CACHE_CONFIG.AI_TTL);
    }
    return result;
  });
}

/**
 * Batch match computation with caching
 */
export async function batchComputeMatches(
  candidates: Array<{
    id: number;
    name: string;
    skills: string | null;
    location?: string | null;
  }>,
  jobData: {
    id: number;
    title: string;
    description: string;
    experienceRequirement?: string | null;
    location?: string | null;
    profile: ExtractedSkillProfile;
  },
  computeMatchFn: (candidate: any, jobData: any) => MatchBreakdown
): Promise<Array<{ candidate: any; result: MatchBreakdown }>> {
  const results: Array<{ candidate: any; result: MatchBreakdown }> = [];
  
  // Process in parallel batches to optimize performance
  const batchSize = 10;
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    
    const batchPromises = batch.map(candidate => {
      const result = computeMatchWithCache(
        candidate.id,
        jobData.id,
        jobData.profile,
        candidate.skills,
        () => computeMatchFn(candidate, jobData),
        candidate.location,
        jobData.location,
        jobData.title,
        jobData.experienceRequirement
      );
      
      return { candidate, result };
    });
    
    results.push(...batchPromises);
  }
  
  return results;
}

/**
 * Preload cache for common scenarios
 */
export async function preloadCache(
  commonJobs: Array<{
    id: number;
    profile: ExtractedSkillProfile;
  }>,
  commonCandidates: Array<{
    id: number;
    skills: string;
    location: string;
  }>
): Promise<void> {
  // Preload common job-candidate combinations
  for (const job of commonJobs) {
    for (const candidate of commonCandidates) {
      // This would trigger caching of common patterns
      // Implementation depends on your specific use case
    }
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    ...cacheStats,
    hitRate: cacheStats.hits / (cacheStats.hits + cacheStats.misses) || 0,
    matchCacheSize: matchCache.size,
    skillCacheSize: skillCache.size,
    aiCacheSize: aiCache.size
  };
}

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
  matchCache.clear();
  skillCache.clear();
  aiCache.clear();
  
  // Reset stats
  cacheStats.hits = 0;
  cacheStats.misses = 0;
  cacheStats.sets = 0;
  cacheStats.evictions = 0;
}

/**
 * Optimize memory usage
 */
export function optimizeMemory(): void {
  // Force cleanup of expired entries
  cleanupCache();
  
  // If caches are still too large, evict oldest entries
  const targetSize = CACHE_CONFIG.MAX_CACHE_SIZE * 0.8;
  
  // Handle each cache separately to avoid type conflicts
  if (matchCache.size > targetSize) {
    const entries = Array.from(matchCache.entries());
    const toEvict = entries.slice(0, entries.length - targetSize);
    toEvict.forEach(([key]) => matchCache.delete(key));
    cacheStats.evictions += toEvict.length;
  }
  
  if (skillCache.size > targetSize) {
    const entries = Array.from(skillCache.entries());
    const toEvict = entries.slice(0, entries.length - targetSize);
    toEvict.forEach(([key]) => skillCache.delete(key));
    cacheStats.evictions += toEvict.length;
  }
  
  if (aiCache.size > targetSize) {
    const entries = Array.from(aiCache.entries());
    const toEvict = entries.slice(0, entries.length - targetSize);
    toEvict.forEach(([key]) => aiCache.delete(key));
    cacheStats.evictions += toEvict.length;
  }
}

/**
 * Cache warming for better performance
 */
export function warmCache(
  recentJobs: Array<{ id: number; profile: ExtractedSkillProfile }>,
  recentCandidates: Array<{ id: number; skills: string }>
): void {
  // Pre-compute and cache recent matches
  // This would be called during application startup or scheduled intervals
  console.log(`Warming cache with ${recentJobs.length} jobs and ${recentCandidates.length} candidates`);
}

/**
 * Performance monitoring
 */
export function getPerformanceMetrics() {
  return {
    cacheStats: getCacheStats(),
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime()
  };
}

/**
 * Adaptive cache TTL based on usage patterns
 */
export function getAdaptiveTTL(baseTTL: number, accessFrequency: number): number {
  // More frequently accessed items stay in cache longer
  const multiplier = Math.min(3, 1 + (accessFrequency / 100));
  return Math.round(baseTTL * multiplier);
}

/**
 * Export cache data for persistence (in production, use proper database)
 */
export function exportCacheData() {
  return {
    matchCache: Array.from(matchCache.entries()),
    skillCache: Array.from(skillCache.entries()),
    aiCache: Array.from(aiCache.entries()),
    timestamp: Date.now()
  };
}

/**
 * Import cache data (in production, use proper database)
 */
export function importCacheData(data: any): void {
  if (data.matchCache) {
    const matchEntries = Array.from(data.matchCache) as Array<[string, CacheEntry<MatchBreakdown>]>;
    matchEntries.forEach(([key, entry]) => {
      if (isCacheEntryValid(entry)) {
        matchCache.set(key, entry);
      }
    });
  }
  
  if (data.skillCache) {
    const skillEntries = Array.from(data.skillCache) as Array<[string, CacheEntry<ExtractedSkillProfile>]>;
    skillEntries.forEach(([key, entry]) => {
      if (isCacheEntryValid(entry)) {
        skillCache.set(key, entry);
      }
    });
  }
  
  if (data.aiCache) {
    const aiEntries = Array.from(data.aiCache) as Array<[string, CacheEntry<Map<number, AiMatchResult>>]>;
    aiEntries.forEach(([key, entry]) => {
      if (isCacheEntryValid(entry)) {
        aiCache.set(key, entry);
      }
    });
  }
}
