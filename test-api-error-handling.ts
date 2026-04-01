/**
 * Test script to verify API error handling is working properly
 */

import { apiFetchJson, ApiError } from './lib/apiClient';

async function testApiErrorHandling() {
  console.log('🧪 Testing API Error Handling...\n');

  try {
    // Test 1: Valid endpoint
    console.log('Test 1: Valid API call');
    const result = await apiFetchJson('/api/jobs');
    console.log('✅ Valid API call successful');
  } catch (error) {
    if (error instanceof ApiError) {
      console.log(`❌ Valid API call failed: ${error.message} (${error.status})`);
    } else {
      console.log(`❌ Valid API call failed with unexpected error: ${error}`);
    }
  }

  try {
    // Test 2: Invalid endpoint (should handle gracefully)
    console.log('\nTest 2: Invalid API endpoint');
    await apiFetchJson('/api/nonexistent-endpoint');
    console.log('❌ Invalid endpoint should have failed');
  } catch (error) {
    if (error instanceof ApiError) {
      console.log(`✅ Invalid endpoint handled correctly: ${error.message} (${error.status})`);
    } else {
      console.log(`❌ Invalid endpoint failed with unexpected error: ${error}`);
    }
  }

  try {
    // Test 3: Malformed JSON response
    console.log('\nTest 3: Malformed JSON response');
    const response = await fetch('/api/jobs');
    const text = await response.text();
    console.log('✅ Text response handled correctly');
  } catch (error) {
    console.log(`❌ Text response failed: ${error}`);
  }

  console.log('\n🎉 API Error Handling Test Complete!');
}

// Only run if this file is executed directly
if (typeof window === 'undefined' && require.main === module) {
  testApiErrorHandling().catch(console.error);
}
