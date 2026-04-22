const bcrypt = require('bcryptjs');
// Hash from dev database for mohameddosho20@gmail.com
const hashFromDevDb = '$2b$10$aAU65m/PSGT.keRro7h3p.W0uFYiwlbEKBCLiWTmB8kJmpuJ5J0Tm';
// Password we're trying
const passwordToTest = 'Dosho10701$';
bcrypt.compare(passwordToTest, hashFromDevDb, (err, result) => {
  if (err) {
    console.error('Bcrypt error:', err);
  } else {
    console.log(`Password '${passwordToTest}' matches dev DB hash?`, result);
  }
});

// Hash from init-test-db.sql for test.surveyor@metardu.com (should be TestPass123!)
const hashFromInitSql = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
const passwordFromInitSql = 'TestPass123!';
bcrypt.compare(passwordFromInitSql, hashFromInitSql, (err, result) => {
  if (err) {
    console.error('Bcrypt error:', err);
  } else {
    console.log(`Password '${passwordFromInitSql}' matches init-test-db.sql hash?`, result);
  }
});