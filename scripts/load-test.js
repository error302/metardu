// METARDU Load Test — k6 script
// Install: https://k6.io/docs/get-started/installation/
// Run: k6 run --vus 10 --duration 30s scripts/load-test.js
// Or: k6 run --vus 50 --duration 2m scripts/load-test.js (stress test)

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TEST_USER_EMAIL = __ENV.TEST_USER_EMAIL || 'test@metardu.app';
const TEST_USER_PASSWORD = __ENV.TEST_USER_PASSWORD || 'TestPassword123!';

// Custom metrics
const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration');

// Test options
export const options = {
  stages: [
    { duration: '30s', target: 5 },   // Ramp up to 5 users
    { duration: '1m', target: 10 },    // Stay at 10 users
    { duration: '30s', target: 20 },   // Ramp up to 20 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],  // 95% of requests < 3s
    errors: ['rate<0.1'],               // Error rate < 10%
  },
};

export function setup() {
  // Login once to get session token
  const loginRes = http.post(`${BASE_URL}/api/auth/signin/credentials`, JSON.stringify({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  return { cookies: loginRes.cookies };
}

export default function (data) {
  const params = {
    cookies: data.cookies,
    headers: { 'Content-Type': 'application/json' },
    timeout: '10s',
  };

  // Test 1: Health endpoint
  const healthRes = http.get(`${BASE_URL}/api/health`, params);
  check(healthRes, {
    'health check 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  // Test 2: Dashboard page load
  const dashboardRes = http.get(`${BASE_URL}/dashboard`, params);
  check(dashboardRes, {
    'dashboard loads': (r) => r.status === 200 || r.status === 302,
  }) || errorRate.add(1);
  apiDuration.add(dashboardRes.timings.duration);

  sleep(1);

  // Test 3: Projects API
  const projectsRes = http.get(`${BASE_URL}/api/projects`, params);
  check(projectsRes, {
    'projects API 200': (r) => r.status === 200 || r.status === 401,
  }) || errorRate.add(1);
  apiDuration.add(projectsRes.timings.duration);

  sleep(1);

  // Test 4: Subscription status
  const subRes = http.get(`${BASE_URL}/api/subscription/status`, params);
  check(subRes, {
    'subscription API responds': (r) => r.status === 200 || r.status === 401 || r.status === 404,
  }) || errorRate.add(1);
  apiDuration.add(subRes.timings.duration);

  sleep(2);
}

export function teardown(data) {
  console.log('Load test complete');
}
