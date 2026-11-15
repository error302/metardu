throw new Error('Disabled: this helper embedded a production credential and fabricated sessions. Use normal sign-in or isolated synthetic test fixtures.');
import { encode } from 'next-auth/jwt';

const secret = 'REMOVED_EXPOSED_SIGNING_SECRET';

async function testMint() {
  const token = {
    id: '5a278317-81db-4db9-b9b6-d5f8ca10ec38',
    email: 'mohameddosho20@gmail.com',
    name: 'Mohamed Dosho',
    role: 'admin',
    provider: 'google',
    sub: '5a278317-81db-4db9-b9b6-d5f8ca10ec38',
    session_version: 1,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  };

  const jwt = await encode({
    token,
    secret,
  });

  console.log('Minted JWT successfully, length:', jwt.length);
  return jwt;
}

testMint().catch(console.error);
