import puppeteer, { Browser, Page } from 'puppeteer';
import { parseSurveyExcel, validateParsedData, ParsedExcelData } from './excelParser';
import * as fs from 'fs';
import * as path from 'path';

export interface BugReport {
  id: string;
  step: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  symptom: string;
  rootCause: string;
  fixApplied: string;
  filesChanged: string[];
  retestResult: 'PASS' | 'FAIL' | 'PENDING';
}

export interface StepResult {
  step: string;
  status: 'PASS' | 'FAIL' | 'PENDING';
  bugsFound: number;
  bugsFixed: number;
  notes: string;
}

export class SurveySimulationAgent {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private baseUrl: string;
  private excelData: ParsedExcelData | null = null;
  private bugs: BugReport[] = [];
  private stepResults: StepResult[] = [];
  private bugCounter = 1;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async initialize(excelFilePath: string): Promise<void> {
    console.log('🚀 Initializing Survey Simulation Agent...');
    
    // Parse Excel data
    console.log('📊 Parsing Excel data...');
    this.excelData = parseSurveyExcel(excelFilePath);
    
    const validation = validateParsedData(this.excelData);
    if (!validation.isValid) {
      console.error('❌ Excel data validation failed:');
      validation.errors.forEach(error => console.error(`  - ${error}`));
      throw new Error('Excel data validation failed');
    }
    
    console.log('✅ Excel data validated successfully');

    // Initialize browser
    console.log('🌐 Launching browser...');
    this.browser = await puppeteer.launch({
      headless: false, // Set to true for headless mode
      defaultViewport: { width: 1920, height: 1080 },
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.page = await this.browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    console.log('✅ Browser initialized');
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  private async takeScreenshot(stepName: string): Promise<void> {
    if (this.page) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `screenshots/${stepName}-${timestamp}.png`;
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      await this.page.screenshot({ path: filename, fullPage: true });
      console.log(`📸 Screenshot saved: ${filename}`);
    }
  }

  private async logConsoleErrors(): Promise<void> {
    if (this.page) {
      this.page.on('console', (msg) => {
        if (msg.type() === 'error') {
          console.log(`🔴 Console Error: ${msg.text()}`);
        }
      });
      
      this.page.on('pageerror', (error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`🔴 Page Error: ${errorMessage}`);
      });
    }
  }

  private createBugReport(
    step: string,
    severity: BugReport['severity'],
    symptom: string,
    rootCause: string,
    fixApplied: string,
    filesChanged: string[] = []
  ): BugReport {
    const bug: BugReport = {
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

  private async recordStepResult(
    step: string,
    status: 'PASS' | 'FAIL' | 'PENDING',
    notes: string = ''
  ): Promise<void> {
    const stepBugs = this.bugs.filter(bug => bug.step === step);
    const result: StepResult = {
      step,
      status,
      bugsFound: stepBugs.length,
      bugsFixed: stepBugs.filter(bug => bug.retestResult === 'PASS').length,
      notes
    };
    
    this.stepResults.push(result);
  }

  async executeStep1_Authentication(): Promise<void> {
    console.log('\n🔐 STEP 1: Authentication Workflow Testing');
    await this.logConsoleErrors();
    
    try {
      // Navigate to login page
      console.log('📍 Navigating to login page...');
      await this.page!.goto(`${this.baseUrl}/login`, { waitUntil: 'networkidle2' });
      await this.takeScreenshot('step1-login-page');
      
      // Check if login page loaded
      const loginForm = await this.page!.$('form');
      if (!loginForm) {
        throw new Error('Login form not found on page');
      }
      
      // Fill in test surveyor credentials
      console.log('📝 Entering test credentials...');
      await this.page!.type('input[type="email"]', 'test.surveyor@metardu.com');
      await this.page!.type('input[type="password"]', 'TestPassword123!');
      
      await this.takeScreenshot('step1-credentials-filled');
      
      // Submit form
      console.log('🚀 Submitting login form...');
      await Promise.all([
        this.page!.waitForNavigation({ waitUntil: 'networkidle2' }),
        this.page!.click('button[type="submit"]')
      ]);
      
      await this.takeScreenshot('step1-after-login');
      
      // Check for successful redirect to dashboard
      const currentUrl = this.page!.url();
      if (!currentUrl.includes('/dashboard')) {
        throw new Error(`Expected redirect to dashboard, but ended up at: ${currentUrl}`);
      }
      
      // Verify dashboard content
      console.log('✅ Verifying dashboard content...');
      const dashboardContent = await this.page!.$('main');
      if (!dashboardContent) {
        throw new Error('Dashboard main content not found');
      }
      
      // Check for surveyor name and ISK number
      const pageText = await this.page!.$eval('body', el => el.textContent || '');
      if (!pageText.includes('ISK')) {
        this.createBugReport(
          'STEP 1 - Authentication',
          'HIGH',
          'ISK number not visible on dashboard after login',
          'Dashboard template missing ISK number display',
          'Add ISK number display to dashboard component',
          ['src/app/dashboard/page.tsx']
        );
      }
      
      console.log('✅ Authentication workflow completed successfully');
      await this.recordStepResult('STEP 1 - Authentication', 'PASS', 'Successfully logged in and redirected to dashboard');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Authentication failed:', error);
      this.createBugReport(
        'STEP 1 - Authentication',
        'CRITICAL',
        `Login failed: ${errorMessage}`,
        'Authentication flow error',
        'Debug and fix authentication middleware and login handler',
        ['src/lib/auth.ts', 'src/app/login/page.tsx']
      );
      await this.recordStepResult('STEP 1 - Authentication', 'FAIL', `Authentication failed: ${errorMessage}`);
      await this.takeScreenshot('step1-error');
    }
  }

  async executeStep2_CreateProject(): Promise<void> {
    console.log('\n📋 STEP 2: Create New Project Testing');
    
    try {
      // Navigate to projects page
      console.log('📍 Navigating to projects page...');
      await this.page!.goto(`${this.baseUrl}/projects`, { waitUntil: 'networkidle2' });
      await this.takeScreenshot('step2-projects-page');
      
      // Look for "New Project" button or navigate to /projects/new
      let newProjectButton = await this.page!.$('a[href*="new"], button:contains("New")');
      if (!newProjectButton) {
        console.log('🔄 Trying direct navigation to /projects/new...');
        await this.page!.goto(`${this.baseUrl}/projects/new`, { waitUntil: 'networkidle2' });
      } else {
        await newProjectButton.click();
        await this.page!.waitForNavigation({ waitUntil: 'networkidle2' });
      }
      
      await this.takeScreenshot('step2-new-project-form');
      
      // Fill in project details from Excel data
      if (!this.excelData) {
        throw new Error('Excel data not loaded');
      }
      
      const { projectMetadata } = this.excelData;
      
      console.log('📝 Filling project details...');
      
      // Fill form fields
      const fieldMappings = [
        { selector: 'input[name*="parcel"], input[placeholder*="parcel"]', value: projectMetadata.parcelNumber },
        { selector: 'select[name*="county"], input[name*="county"]', value: projectMetadata.county },
        { selector: 'input[name*="isk"], input[placeholder*="isk"]', value: projectMetadata.iskNumber },
        { selector: 'input[name*="client"], input[placeholder*="client"]', value: projectMetadata.clientName },
        { selector: 'select[name*="area"], input[name*="area"]', value: projectMetadata.areaType }
      ];
      
      for (const field of fieldMappings) {
        try {
          const element = await this.page!.$(field.selector);
          if (element) {
            if (field.selector.includes('select')) {
              await this.page!.select(field.selector, field.value);
            } else {
              await this.page!.type(field.selector, field.value);
            }
            console.log(`✅ Filled ${field.selector} with: ${field.value}`);
          } else {
            console.log(`⚠️ Field not found: ${field.selector}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.log(`⚠️ Error filling field ${field.selector}:`, errorMessage);
        }
      }
      
      await this.takeScreenshot('step2-form-filled');
      
      // Submit form
      console.log('🚀 Submitting project form...');
      await Promise.all([
        this.page!.waitForNavigation({ waitUntil: 'networkidle2' }),
        this.page!.click('button[type="submit"], button:contains("Create"), button:contains("Save")')
      ]);
      
      await this.takeScreenshot('step2-project-created');
      
      // Verify project was created
      const currentUrl = this.page!.url();
      if (currentUrl.includes('/projects/') && !currentUrl.includes('/new')) {
        console.log('✅ Project created successfully');
        
        // Extract project UUID from URL
        const projectId = currentUrl.split('/projects/')[1]?.split('/')[0];
        if (projectId) {
          console.log(`📋 Project ID: ${projectId}`);
        }
        
        await this.recordStepResult('STEP 2 - Create Project', 'PASS', `Project created successfully with ID: ${projectId}`);
      } else {
        throw new Error('Project creation failed - not redirected to project detail page');
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Project creation failed:', errorMessage);
      this.createBugReport(
        'STEP 2 - Create Project',
        'CRITICAL',
        `Project creation failed: ${errorMessage}`,
        'Project form submission or database insertion error',
        'Fix project creation API and form handling',
        ['src/app/projects/new/page.tsx', 'src/lib/api-client/']
      );
      await this.recordStepResult('STEP 2 - Create Project', 'FAIL', `Project creation failed: ${errorMessage}`);
      await this.takeScreenshot('step2-error');
    }
  }

  async executeAllSteps(): Promise<void> {
    if (!this.excelData) {
      throw new Error('Excel data not loaded. Call initialize() first.');
    }

    try {
      await this.executeStep1_Authentication();
      await this.executeStep2_CreateProject();
      
      // TODO: Implement remaining steps
      console.log('\n⚠️ Steps 3-8 implementation pending...');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Simulation failed:', errorMessage);
    }
  }

  generateReport(): void {
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

  async saveReport(): Promise<void> {
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
export async function runSimulation(excelFilePath: string, baseUrl: string = 'http://localhost:3000'): Promise<void> {
  const agent = new SurveySimulationAgent(baseUrl);
  
  try {
    await agent.initialize(excelFilePath);
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
  const excelFilePath = process.argv[2] || 'C:\\Users\\ADMIN\\Downloads\\FINAL THEORETICAL COMPUTATIONS FOR 4 ACRES.xlsx';
  const baseUrl = process.argv[3] || 'http://localhost:3000';
  
  runSimulation(excelFilePath, baseUrl).catch(console.error);
}
