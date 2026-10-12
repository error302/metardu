// Isolated fictional account for browser QA. No customer data is changed.
const fs = require('fs');
const {randomUUID, randomBytes} = require('crypto');
const {Pool} = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({path:'.env', quiet:true});
const pool = new Pool({host:'127.0.0.1',port:5432,user:process.env.POSTGRES_USER||'metardu',password:process.env.POSTGRES_PASSWORD,database:process.env.POSTGRES_DB||'metardu'});
(async()=>{
  try {
    const id=randomUUID();
    const email=`cadastral-qa-${id}@example.invalid`;
    const password=randomBytes(18).toString('base64url');
    await pool.query(`INSERT INTO users(id,email,password_hash,full_name,role,email_verified) VALUES($1,$2,$3,'Cadastral browser QA - fictional','surveyor',true)`,[id,email,await bcrypt.hash(password,10)]);
    await pool.query('INSERT INTO profiles(id,full_name) SELECT id,full_name FROM users WHERE id=$1',[id]);
    await pool.query("INSERT INTO surveyor_profiles(user_id,role,is_suspended) VALUES($1,'surveyor',false)",[id]);
    fs.mkdirSync('live-test-results',{recursive:true});
    fs.writeFileSync('live-test-results/cadastral-browser-fixture.json',JSON.stringify({id,email,password}));
    console.log(JSON.stringify({email,password}));
  } finally { await pool.end(); }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
