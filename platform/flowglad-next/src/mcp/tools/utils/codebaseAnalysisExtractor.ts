/**
 * Utilities for extracting information from codebase analysis markdown
 */

export interface ExtractedCodebaseInfo {
  framework: string
  language: string
  authLibrary: string
  customerModel: 'B2C' | 'B2B'
  customerIdSource: string
  projectStructure: 'nextjs' | 'react' | undefined
  stackDetails: string | undefined
  additionalDetails: string | undefined
  filePaths: {
    apiRoutePath: string
    libPath: string
    componentsPath: string
    serverFile: string
    routeHandler: string
    layoutFile: string
    billingPage: string
    packageFile: string
    envFile: string
    envVarAccess: string
    mockBillingPath: string
    pricingComponentPath: string
    navbarComponentPath: string
    dashboardComponentPath: string
  }
}

/**
 * Extracts information from codebase analysis markdown
 */
export function extractCodebaseInfo(
  codebaseAnalysis: string | undefined,
  defaultPaths: Partial<ExtractedCodebaseInfo['filePaths']> = {}
): ExtractedCodebaseInfo {
  const defaults: ExtractedCodebaseInfo = {
    framework: 'Next.js',
    language: 'TypeScript',
    authLibrary: 'unknown',
    customerModel: 'B2C',
    customerIdSource: 'user.id',
    projectStructure: undefined,
    stackDetails: undefined,
    additionalDetails: undefined,
    filePaths: {
      apiRoutePath: 'src/app/api',
      libPath: 'src/lib',
      componentsPath: 'src/components',
      serverFile: 'src/lib/flowglad.ts',
      routeHandler: 'src/app/api/flowglad/[...path]/route.ts',
      layoutFile: 'src/app/layout.tsx',
      billingPage: 'src/app/billing/page.tsx',
      packageFile: 'package.json',
      envFile: '.env.local',
      envVarAccess: 'process.env.VAR_NAME',
      mockBillingPath: 'src/lib/billing.ts',
      pricingComponentPath: 'src/components/pricing.tsx',
      navbarComponentPath: 'src/components/navbar.tsx',
      dashboardComponentPath: 'src/app/dashboard/page.tsx',
      ...defaultPaths,
    },
  }

  if (!codebaseAnalysis) {
    return defaults
  }

  const info = { ...defaults }

  // Extract framework
  const frameworkMatch = codebaseAnalysis.match(
    /## 1\. Framework & Language Detection[\s\S]*?What framework does the application use\?[^\n]*\n- ([^\n]+)/i
  )
  if (frameworkMatch) {
    const frameworkText = frameworkMatch[1].toLowerCase()
    if (
      frameworkText.includes('next.js') ||
      frameworkText.includes('nextjs')
    ) {
      info.projectStructure = 'nextjs'
      info.framework = 'Next.js'
    } else if (frameworkText.includes('react')) {
      info.projectStructure = 'react'
      info.framework = 'React'
    }
  }

  // Extract language
  const languageMatch = codebaseAnalysis.match(
    /What language is the server written in\?[^\n]*\n- ([^\n]+)/i
  )
  if (languageMatch) {
    info.language = languageMatch[1].trim()
  }

  // Extract auth library
  const authMatch = codebaseAnalysis.match(
    /## 3\. Authentication System[\s\S]*?What authentication library\/system is used\?[^\n]*\n- ([^\n]+)/i
  )
  if (authMatch) {
    const authText = authMatch[1].toLowerCase()
    if (authText.includes('clerk')) info.authLibrary = 'Clerk'
    else if (authText.includes('supabase'))
      info.authLibrary = 'Supabase'
    else if (
      authText.includes('nextauth') ||
      authText.includes('next-auth')
    )
      info.authLibrary = 'NextAuth'
    else info.authLibrary = authMatch[1].trim()
  }

  // Extract customer model
  const b2bIndex = codebaseAnalysis.indexOf('**B2B**: Businesses')
  const b2cIndex = codebaseAnalysis.indexOf(
    '**B2C**: Individual users'
  )
  if (b2bIndex !== -1 && (b2cIndex === -1 || b2bIndex < b2cIndex)) {
    info.customerModel = 'B2B'
  }

  // Extract customer ID source
  const customerIdMatch = codebaseAnalysis.match(
    /Customer ID Source[\s\S]*?For B2C: What field identifies a user\?[^\n]*\n- ([^\n]+)/i
  )
  if (customerIdMatch) {
    info.customerIdSource = customerIdMatch[1].trim()
  }

  // Extract stack details from section 2
  const stackMatch = codebaseAnalysis.match(
    /## 2\. File Structure & Paths[\s\S]*?## 3\./i
  )
  if (stackMatch) {
    info.stackDetails = stackMatch[0]
      .replace(/## 2\. File Structure & Paths/i, '')
      .replace(/## 3\./i, '')
      .trim()
  }

  // Extract additional details from section 4
  const additionalMatch = codebaseAnalysis.match(
    /## 4\. Customer Model[\s\S]*?## 5\./i
  )
  if (additionalMatch) {
    info.additionalDetails = additionalMatch[0]
      .replace(/## 4\. Customer Model[\s\S]*?## 5\./i, '')
      .trim()
  }

  // Extract file paths from section 2
  const apiRouteMatch = codebaseAnalysis.match(
    /Where should API routes be mounted\?[^\n]*\n- ([^\n]+)/i
  )
  if (apiRouteMatch)
    info.filePaths.apiRoutePath = apiRouteMatch[1].trim()

  const libMatch = codebaseAnalysis.match(
    /Where are utility functions and shared code located\?[^\n]*\n- ([^\n]+)/i
  )
  if (libMatch) {
    info.filePaths.libPath = libMatch[1].trim()
    info.filePaths.serverFile = `${info.filePaths.libPath}/flowglad.${info.language.includes('TypeScript') ? 'ts' : 'js'}`
  }

  const componentsMatch = codebaseAnalysis.match(
    /Where are UI components located\?[^\n]*\n- ([^\n]+)/i
  )
  if (componentsMatch)
    info.filePaths.componentsPath = componentsMatch[1].trim()

  // Extract component paths from section 13
  const pricingMatch = codebaseAnalysis.match(
    /Where is the pricing page\/component\?[^\n]*\n- ([^\n]+)/i
  )
  if (pricingMatch)
    info.filePaths.pricingComponentPath = pricingMatch[1].trim()

  const navbarMatch = codebaseAnalysis.match(
    /Where is the navbar\/account menu component\?[^\n]*\n- ([^\n]+)/i
  )
  if (navbarMatch)
    info.filePaths.navbarComponentPath = navbarMatch[1].trim()

  const dashboardMatch = codebaseAnalysis.match(
    /Where is the main dashboard\/home page component\?[^\n]*\n- ([^\n]+)/i
  )
  if (dashboardMatch)
    info.filePaths.dashboardComponentPath = dashboardMatch[1].trim()

  // Extract env file from section 11
  const envFileMatch = codebaseAnalysis.match(
    /What is the name of the environment file\?[^\n]*\n- ([^\n]+)/i
  )
  if (envFileMatch) info.filePaths.envFile = envFileMatch[1].trim()

  const envVarMatch = codebaseAnalysis.match(
    /How are environment variables accessed\?[^\n]*\n- ([^\n]+)/i
  )
  if (envVarMatch) info.filePaths.envVarAccess = envVarMatch[1].trim()

  // Extract package file from section 1
  const packageMatch = codebaseAnalysis.match(
    /What is the name and location of the dependency file\?[^\n]*\n- ([^\n]+)/i
  )
  if (packageMatch)
    info.filePaths.packageFile = packageMatch[1].trim()

  return info
}
