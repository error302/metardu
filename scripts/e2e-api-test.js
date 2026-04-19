/**
 * End-to-end API test: simulates exactly what the browser UI does
 * 1. Login via NextAuth credentials endpoint
 * 2. Fetch dashboard/projects list
 * 3. Call Generate Report (AI endpoint)
 */

const BASE = 'http://localhost:3000';

async function main() {
  console.log('=== METARDU E2E API TEST ===\n');

  // Step 1: Login via NextAuth CSRF + credentials
  console.log('1. Getting CSRF token...');
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const csrfData = await csrfRes.json();
  const csrfToken = csrfData.csrfToken;
  console.log(`   CSRF token: ${csrfToken.substring(0, 20)}...`);

  // Extract cookies from CSRF response
  const csrfCookies = csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie() : [];
  const cookieJar = csrfCookies.map(c => c.split(';')[0]).join('; ');

  console.log('\n2. Logging in as mohameddosho20@gmail.com...');
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieJar,
    },
    body: new URLSearchParams({
      csrfToken,
      email: 'mohameddosho20@gmail.com',
      password: 'Dosho10701$',
      json: 'true',
    }),
    redirect: 'manual',
  });
  
  console.log(`   Login response: ${loginRes.status} ${loginRes.statusText}`);
  
  // Collect session cookies
  const loginCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [];
  const allCookies = [...csrfCookies, ...loginCookies].map(c => c.split(';')[0]).join('; ');
  
  // Step 2: Verify session
  console.log('\n3. Verifying session...');
  const sessionRes = await fetch(`${BASE}/api/auth/session`, {
    headers: { 'Cookie': allCookies },
  });
  const session = await sessionRes.json();
  console.log(`   Session user: ${JSON.stringify(session.user || 'NOT LOGGED IN')}`);

  if (!session.user) {
    console.error('\n❌ LOGIN FAILED - cannot proceed with integration test');
    process.exit(1);
  }

  console.log('\n✅ LOGIN SUCCESSFUL');

  // Step 3: Test the AI endpoint  
  console.log('\n4. Testing Generate Report (AI endpoint)...');
  const aiRes = await fetch(`${BASE}/api/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': allCookies,
    },
    body: JSON.stringify({
      action: 'generate-section',
      data: {
        sectionType: 'Methodology',
        surveyType: 'cadastral',
        projectData: {
          projectName: 'Kiambu 4-Acre Subdivision',
          location: 'Kiambu County',
          utmZone: '37S',
          points: [
            { name: 'BN-A', easting: 260500, northing: 9852100, elevation: 1650 },
            { name: 'BN-B', easting: 260620, northing: 9852100, elevation: 1648.5 },
            { name: 'BN-C', easting: 260620, northing: 9852235, elevation: 1649.2 },
            { name: 'BN-D', easting: 260500, northing: 9852235, elevation: 1651 },
          ],
          area: '4.0 acres (16,187.43 sqm)',
          misclosure: '1:6500',
        },
        customInstructions: 'Reference the Survey Act Cap 299, RDM 1.1, and Land Registration Act 2012. Include specific equipment used (Leica TS16, Comnav T300 GNSS). This is for a 4-acre subdivision in Kiambu County.',
      },
    }),
  });

  console.log(`   AI response status: ${aiRes.status}`);
  const aiData = await aiRes.json();
  
  if (aiRes.ok && aiData.result) {
    const content = typeof aiData.result === 'string' ? aiData.result : JSON.stringify(aiData.result, null, 2);
    console.log('\n✅ AI REPORT GENERATED SUCCESSFULLY');
    console.log('─'.repeat(60));
    console.log(content.substring(0, 2000));
    if (content.length > 2000) console.log(`\n... (${content.length - 2000} more characters)`);
    console.log('─'.repeat(60));

    // Write the full report to a file
    const fs = require('fs');
    fs.writeFileSync('artifacts/e2e_generated_report.md', `# E2E Test: AI Generated Report\n\n**Project:** Kiambu 4-Acre Subdivision\n**Section:** Methodology\n**Generated:** ${new Date().toISOString()}\n\n---\n\n${content}`);
    console.log('\n📄 Full report saved to artifacts/e2e_generated_report.md');
  } else {
    console.error('\n❌ AI REPORT GENERATION FAILED');
    console.error('   Error:', aiData.error || 'Unknown error');
  }

  // Step 4: Also test the QA validation
  console.log('\n5. Testing Survey QA Validation...');
  const qaRes = await fetch(`${BASE}/api/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': allCookies,
    },
    body: JSON.stringify({
      action: 'survey-qa',
      data: {
        surveyType: 'cadastral',
        projectName: 'Kiambu 4-Acre Subdivision',
        points: [
          { name: 'BN-A', easting: 260500, northing: 9852100 },
          { name: 'BN-B', easting: 260620, northing: 9852100 },
          { name: 'BN-C', easting: 260620, northing: 9852235 },
          { name: 'BN-D', easting: 260500, northing: 9852235 },
        ],
        misclosure: 0.018,
        precisionRatio: '1:6500',
      },
    }),
  });

  const qaData = await qaRes.json();
  if (qaRes.ok) {
    console.log('✅ QA VALIDATION RESPONSE:');
    const qaContent = typeof qaData.result === 'string' ? qaData.result : JSON.stringify(qaData.result, null, 2);
    console.log(qaContent.substring(0, 1000));
  } else {
    console.error('❌ QA Validation failed:', qaData.error);
  }

  console.log('\n=== E2E TEST COMPLETE ===');
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
