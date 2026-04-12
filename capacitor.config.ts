import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.metardu.survey',
  appName: 'METARDU',
  webDir: '.next',
  server: {
    url: process.env.NEXT_PUBLIC_APP_URL || 'https://metardu.duckdns.org',
    allowNavigation: ['metardu.duckdns.org'],
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: '#1e40af',
    },
  },
}

export default config
