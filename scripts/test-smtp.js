#!/usr/bin/env node
/**
 * Test SMTP connection directly from this machine
 */
const nodemailer = require('nodemailer');

async function test() {
  const configs = [
    { user: 'mohameddosho20@gmail.com', pass: 'zihw pdrv fmol kppz', label: 'New password' },
    { user: 'mohameddosh20@gmail.com', pass: 'zihw pdrv fmol kppz', label: 'Old username + new password' },
    { user: 'mohameddosho20@gmail.com', pass: 'duuh jhpq jhql jzpe', label: 'Old password' },
  ];

  for (const cfg of configs) {
    console.log(`\nTesting: ${cfg.label} (${cfg.user})`);
    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: cfg.user, pass: cfg.pass },
      });
      await transporter.verify();
      console.log(`  ✅ SMTP connection verified!`);
      transporter.close();
      return; // First one that works, we're done
    } catch (err) {
      console.log(`  ❌ Failed: ${err.message}`);
    }
  }
}

test();
