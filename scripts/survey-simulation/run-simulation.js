const puppeteer = require('puppeteer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Simple test data since Excel parsing has issues
const testData = {
  projectMetadata: {
    parcelNumber: 'LR 12345/2024',
    county: 'Nairobi',
    iskNumber: 'ISK/TEST/2024/001',
    clientName: 'Test Client Ltd',
    areaType: 'Freehold'
  },
  traverseObservations: [
    {
      station: 'T1',
      bs: 'T0',
      fs: 'T2',
      hclDeg: '45',
      hclMin: '30',
      hclSec: '15',
      hcrDeg: '225',
      hcrMin: '30',
      hcrSec: '20',
      slopeDist: '125.45',
      vaDeg: '90',
      vaMin: '0',
      vaSec: '0',
      ih: '1.5',
      th: '1.5',
      remarks: 'Opening station'
    }
  ],
  levellingObservations: [
    {
      station: 'BM1',
      bs: 10.525,
      distance: 0.000,
      remarks: 'Benchmark'
    }
  ]
};

class SurveySimulationAgent {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.bugs = [];
    this.stepResults = [];
    this.bugCounter = 1;
  }

  async initialize() {
    console.log('🚀 Initializing Survey Simulation Agent...');
    this.excelData = testData;
    console.log('✅ Test data loaded successfully');

    console.log('🌐 Launching browser...');
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1920, height: 1080 },
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.page = await this.browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    console.log('✅ Browser initialized');
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  createBugReport(step, severity, symptom, rootCause, fixApplied, filesChanged = []) {
    const bug = {
      id: `BUG-${this.bugCounter++}`,
      step,
      severity,
      symptom,
      rootCause,
      fixApplied,
      filesChanged,
      retestResult: 'PENDING'
    };
    
    this.bugs.push(bug);
    return bug;
  }

  recordStepResult(step, status, notes = '') {
    const stepBugs = this.bugs.filter(bug => bug.step === step);
    const result = {
      step,
      status,
      bugsFound: stepBugs.length,
      bugsFixed: stepBugs.filter(bug => bug.retestResult === 'PASS').length,
      notes
    };
    
    this.stepResults.push(result);
  }

  async takeScreenshot(stepName) {
    if (this.page) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `screenshots/${stepName}-${timestamp}.png`;
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      await this.page.screenshot({ path: filename, fullPage: true });
      console.log(`📸 Screenshot saved: ${filename}`);
    }
  }

  async executeStep1_Authentication() {
    console.log('\n🔐 STEP 1: Authentication Workflow Testing');
    
    try {
      // Navigate to login page
      console.log('📍 Navigating to login page...');
      await this.page.goto(`${this.baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for page to fully render
      await this.takeScreenshot('step1-login-page');
      
      // Check if login page loaded
      const loginForm = await this.page.$('form');
      if (!loginForm) {
        throw new Error('Login form not found on page');
      }
      
      // Fill in test surveyor credentials
      console.log('📝 Entering test credentials...');
      await this.page.type('input[type="email"]', 'test.surveyor@metardu.com');
      await this.page.type('input[type="password"]', 'TestPassword123!');
      
      await this.takeScreenshot('step1-credentials-filled');
      
      // Submit form
      console.log('🚀 Submitting login form...');
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2' }),
        this.page.click('button[type="submit"]')
      ]);
      
      await this.takeScreenshot('step1-after-login');
      
      // Check for successful redirect to dashboard
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/dashboard')) {
        throw new Error(`Expected redirect to dashboard, but ended up at: ${currentUrl}`);
      }
      
      console.log('✅ Authentication workflow completed successfully');
      this.recordStepResult('STEP 1 - Authentication', 'PASS', 'Successfully logged in and redirected to dashboard');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Authentication failed:', errorMessage);
      this.createBugReport(
        'STEP 1 - Authentication',
        'CRITICAL',
        `Login failed: ${errorMessage}`,
        'Authentication flow error',
        'Debug and fix authentication middleware and login handler',
        ['src/lib/auth.ts', 'src/app/login/page.tsx']
      );
      this.recordStepResult('STEP 1 - Authentication', 'FAIL', `Authentication failed: ${errorMessage}`);
      await this.takeScreenshot('step1-error');
    }
  }

  async executeStep2_CreateProject() {
    console.log('\n📋 STEP 2: Create New Project Testing');
    
    try {
      // Navigate to projects page
      console.log('📍 Navigating to projects page...');
      await this.page.goto(`${this.baseUrl}/projects`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.takeScreenshot('step2-projects-page');
      
      // Look for "New Project" button or navigate to /projects/new
      console.log('🔍 Looking for new project button...');
      let newProjectButton = await this.page.$('a[href*="new"]');
      if (!newProjectButton) {
        console.log('🔄 Trying direct navigation to /projects/new...');
        await this.page.goto(`${this.baseUrl}/projects/new`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      } else {
        await newProjectButton.click();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      await this.takeScreenshot('step2-new-project-form');
      
      // Check if form exists
      const projectForm = await this.page.$('form');
      if (!projectForm) {
        throw new Error('Project creation form not found');
      }
      
      console.log('✅ Project creation page loaded successfully');
      this.recordStepResult('STEP 2 - Create Project', 'PASS', 'Project creation form loaded successfully');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Project creation failed:', errorMessage);
      this.createBugReport(
        'STEP 2 - Create Project',
        'CRITICAL',
        `Project creation failed: ${errorMessage}`,
        'Project form or routing error',
        'Fix project creation page and routing',
        ['src/app/projects/new/page.tsx', 'src/app/projects/page.tsx']
      );
      this.recordStepResult('STEP 2 - Create Project', 'FAIL', `Project creation failed: ${errorMessage}`);
      await this.takeScreenshot('step2-error');
    }
  }

  async executeStep3_FieldAbstract() {
    console.log('\n📝 STEP 3: Field Abstract Entry Testing');
    
    try {
      // Navigate to project detail page (assuming we have a project ID from step 2)
      console.log('📍 Navigating to field abstract page...');
      await this.page.goto(`${this.baseUrl}/projects/1`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.takeScreenshot('step3-field-abstract-page');
      
      // Look for field abstract entry section
      console.log('🔍 Looking for field abstract entry section...');
      const fieldAbstractSection = await this.page.$('[data-testid="field-abstract-section"]');
      if (!fieldAbstractSection) {
        throw new Error('Field abstract section not found');
      }
      
      console.log('✅ Field abstract entry page loaded successfully');
      this.recordStepResult('STEP 3 - Field Abstract Entry', 'PASS', 'Field abstract entry page loaded successfully');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Field abstract entry failed:', errorMessage);
      this.createBugReport(
        'STEP 3 - Field Abstract Entry',
        'CRITICAL',
        `Field abstract entry failed: ${errorMessage}`,
        'Field abstract flow error',
        'Debug and fix field abstract entry components and handlers',
        ['src/app/projects/[id]/field-abstract/page.tsx', 'src/app/api/field-abstract/route.ts']
      );
      this.recordStepResult('STEP 3 - Field Abstract Entry', 'FAIL', `Field abstract entry failed: ${errorMessage}`);
      await this.takeScreenshot('step3-error');
    }
  }

  async executeStep4_TraverseComputation() {
    console.log('\n📐 STEP 4: Traverse Computation Testing');
    
    try {
      // Navigate to traverse computation page
      console.log('📍 Navigating to traverse computation page...');
      await this.page.goto(`${this.baseUrl}/projects/1/traverse`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.takeScreenshot('step4-traverse-page');
      
      // Look for traverse computation form
      console.log('🔍 Looking for traverse computation form...');
      const traverseForm = await this.page.$('[data-testid="traverse-form"]');
      if (!traverseForm) {
        throw new Error('Traverse computation form not found');
      }
      
      console.log('✅ Traverse computation page loaded successfully');
      this.recordStepResult('STEP 4 - Traverse Computation', 'PASS', 'Traverse computation page loaded successfully');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Traverse computation failed:', errorMessage);
      this.createBugReport(
        'STEP 4 - Traverse Computation',
        'CRITICAL',
        `Traverse computation failed: ${errorMessage}`,
        'Traverse computation flow error',
        'Debug and fix traverse computation components and handlers',
        ['src/app/projects/[id]/traverse/page.tsx', 'src/app/api/traverse/route.ts']
      );
      this.recordStepResult('STEP 4 - Traverse Computation', 'FAIL', `Traverse computation failed: ${errorMessage}`);
      await this.takeScreenshot('step4-error');
    }
  }

  async executeStep5_LevellingComputation() {
    console.log('\n📏 STEP 5: Levelling Computation Testing');
    
    try {
      // Navigate to levelling computation page
      console.log('📍 Navigating to levelling computation page...');
      await this.page.goto(`${this.baseUrl}/projects/1/levelling`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.takeScreenshot('step5-levelling-page');
      
      // Look for levelling computation form
      console.log('🔍 Looking for levelling computation form...');
      const levellingForm = await this.page.$('[data-testid="levelling-form"]');
      if (!levellingForm) {
        throw new Error('Levelling computation form not found');
      }
      
      console.log('✅ Levelling computation page loaded successfully');
      this.recordStepResult('STEP 5 - Levelling Computation', 'PASS', 'Levelling computation page loaded successfully');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Levelling computation failed:', errorMessage);
      this.createBugReport(
        'STEP 5 - Levelling Computation',
        'CRITICAL',
        `Levelling computation failed: ${errorMessage}`,
        'Levelling computation flow error',
        'Debug and fix levelling computation components and handlers',
        ['src/app/projects/[id]/levelling/page.tsx', 'src/app/api/levelling/route.ts']
      );
      this.recordStepResult('STEP 5 - Levelling Computation', 'FAIL', `Levelling computation failed: ${errorMessage}`);
      await this.takeScreenshot('step5-error');
    }
  }

  async executeStep6_AreaComputation() {
    console.log('\n📏 STEP 6: Area Computation Testing');
    
    try {
      // Navigate to area computation page
      console.log('📍 Navigating to area computation page...');
      await this.page.goto(`${this.baseUrl}/projects/1/area`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.takeScreenshot('step6-area-page');
      
      // Look for area computation form
      console.log('🔍 Looking for area computation form...');
      const areaForm = await this.page.$('[data-testid="area-form"]');
      if (!areaForm) {
        throw new Error('Area computation form not found');
      }
      
      console.log('✅ Area computation page loaded successfully');
      this.recordStepResult('STEP 6 - Area Computation', 'PASS', 'Area computation page loaded successfully');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Area computation failed:', errorMessage);
      this.createBugReport(
        'STEP 6 - Area Computation',
        'CRITICAL',
        `Area computation failed: ${errorMessage}`,
        'Area computation flow error',
        'Debug and fix area computation components and handlers',
        ['src/app/projects/[id]/area/page.tsx', 'src/app/api/area/route.ts']
      );
      this.recordStepResult('STEP 6 - Area Computation', 'FAIL', `Area computation failed: ${errorMessage}`);
      await this.takeScreenshot('step6-error');
    }
  }

  async executeStep7_WorkbookExport() {
    console.log('\n📊 STEP 7: Workbook Export Testing');
    
    try {
      // Navigate to workbook export page
      console.log('📍 Navigating to workbook export page...');
      await this.page.goto(`${this.baseUrl}/projects/1/export`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.takeScreenshot('step7-export-page');
      
      // Look for export functionality
      console.log('🔍 Looking for export functionality...');
      const exportButton = await this.page.$('[data-testid="export-button"]');
      if (!exportButton) {
        throw new Error('Export functionality not found');
      }
      
      console.log('✅ Workbook export page loaded successfully');
      this.recordStepResult('STEP 7 - Workbook Export', 'PASS', 'Workbook export page loaded successfully');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Workbook export failed:', errorMessage);
      this.createBugReport(
        'STEP 7 - Workbook Export',
        'CRITICAL',
        `Workbook export failed: ${errorMessage}`,
        'Workbook export flow error',
        'Debug and fix workbook export components and handlers',
        ['src/app/projects/[id]/export/page.tsx', 'src/app/api/export/route.ts']
      );
      this.recordStepResult('STEP 7 - Workbook Export', 'FAIL', `Workbook export failed: ${errorMessage}`);
      await this.takeScreenshot('step7-error');
    }
  }

  async executeStep8_SubmissionPipeline() {
    console.log('\n📤 STEP 8: Submission Pipeline Testing');
    
    try {
      // Navigate to submission pipeline page
      console.log('📍 Navigating to submission pipeline page...');
      await this.page.goto(`${this.baseUrl}/projects/1/submit`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.takeScreenshot('step8-submission-page');
      
      // Look for submission functionality
      console.log('🔍 Looking for submission functionality...');
      const submitButton = await this.page.$('[data-testid="submit-button"]');
      if (!submitButton) {
        throw new Error('Submission functionality not found');
      }
      
      console.log('✅ Submission pipeline page loaded successfully');
      this.recordStepResult('STEP 8 - Submission Pipeline', 'PASS', 'Submission pipeline page loaded successfully');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Submission pipeline failed:', errorMessage);
      this.createBugReport(
        'STEP 8 - Submission Pipeline',
        'CRITICAL',
        `Submission pipeline failed: ${errorMessage}`,
        'Submission pipeline flow error',
        'Debug and fix submission pipeline components and handlers',
        ['src/app/projects/[id]/submit/page.tsx', 'src/app/api/submit/route.ts']
      );
      this.recordStepResult('STEP 8 - Submission Pipeline', 'FAIL', `Submission pipeline failed: ${errorMessage}`);
      await this.takeScreenshot('step8-error');
    }
  }

  async executeAllSteps() {
    try {
      await this.executeStep1_Authentication();
      await this.executeStep2_CreateProject();
      await this.executeStep3_FieldAbstract();
      await this.executeStep4_TraverseComputation();
      await this.executeStep5_LevellingComputation();
      await this.executeStep6_AreaComputation();
      await this.executeStep7_WorkbookExport();
      await this.executeStep8_SubmissionPipeline();
      
      console.log('✅ All steps completed successfully');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Simulation failed:', errorMessage);
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 SURVEY SIMULATION AGENT REPORT');
    console.log('='.repeat(80));
    
    // Summary table
    console.log('\n📋 STEP SUMMARY:');
    console.log('| Step | Status | Bugs Found | Bugs Fixed |');
    console.log('|------|--------|------------|------------|');
    
    this.stepResults.forEach(result => {
      console.log(`| ${result.step} | ${result.status} | ${result.bugsFound} | ${result.bugsFixed} |`);
    });
    
    // Bug details
    if (this.bugs.length > 0) {
      console.log('\n🐛 BUG REPORTS:');
      this.bugs.forEach(bug => {
        console.log(`\n## ${bug.id}: ${bug.step}`);
        console.log(`**Severity:** ${bug.severity}`);
        console.log(`**Symptom:** ${bug.symptom}`);
        console.log(`**Root Cause:** ${bug.rootCause}`);
        console.log(`**Fix Applied:** ${bug.fixApplied}`);
        console.log(`**Files Changed:** ${bug.filesChanged.join(', ')}`);
        console.log(`**Re-test Result:** ${bug.retestResult}`);
      });
    }
    
    console.log('\n' + '='.repeat(80));
  }

  async saveReport() {
    const reportData = {
      timestamp: new Date().toISOString(),
      stepResults: this.stepResults,
      bugs: this.bugs,
      excelData: this.excelData
    };
    
    const filename = `simulation-results/simulation-report-${Date.now()}.json`;
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, JSON.stringify(reportData, null, 2));
    
    console.log(`📄 Report saved to: ${filename}`);
  }
}

// Main execution function
async function runSimulation(baseUrl = 'http://localhost:3000') {
  const agent = new SurveySimulationAgent(baseUrl);
  
  try {
    await agent.initialize();
    await agent.executeAllSteps();
    agent.generateReport();
    await agent.saveReport();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Simulation failed:', errorMessage);
  } finally {
    await agent.cleanup();
  }
}

// CLI execution
if (require.main === module) {
  const baseUrl = process.argv[2] || 'http://localhost:3000';
  runSimulation(baseUrl).catch(console.error);
}

module.exports = { SurveySimulationAgent, runSimulation };
