/**
 * Quick test to recompute Aditya's score
 */

// Test the recompute API endpoint
async function testRecomputeAPI() {
  console.log('🔧 TESTING RECOMPUTE API ENDPOINT');
  console.log('='.repeat(60));

  try {
    // You'll need to replace JOB_ID with the actual job ID
    const response = await fetch('http://localhost:3000/api/jobs/JOB_ID/recompute-matches', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Recompute API Response:');
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error('❌ API call failed:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('❌ Error testing API:', error);
  }
}

// Instructions for manual testing
console.log('📋 MANUAL TESTING INSTRUCTIONS:');
console.log('='.repeat(60));
console.log('1. Find the actual JOB_ID for the Bellfast role');
console.log('2. Replace JOB_ID in the test script');
console.log('3. Run: curl -X POST http://localhost:3000/api/jobs/JOB_ID/recompute-matches');
console.log('4. Check the updated scores in the UI');
console.log('');
console.log('🎯 EXPECTED RESULT:');
console.log('Aditya Pandita score should change from 10% to 77%');
console.log('');
console.log('💡 ALTERNATIVE: Use the browser dev tools to call the API');
console.log('Go to the job page and run in console:');
console.log('fetch("/api/jobs/JOB_ID/recompute-matches", {method:"POST"})');

testRecomputeAPI();
