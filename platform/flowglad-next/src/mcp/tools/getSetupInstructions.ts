import { z } from 'zod'
import { ToolConstructor } from '../toolWrap'
import { promises as fs } from 'fs'
import path from 'path'
import { analyzeCodebase } from './analyzeCodebase'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectDefaultPricingModel } from '@/db/tableMethods/pricingModelMethods'
import { getPricingModelSetupData } from '@/utils/pricingModels/setupHelpers'
import yaml from 'json-to-pretty-yaml'
import type { SetupPricingModelInput } from '@/utils/pricingModels/setupSchemas'
import core from '@/utils/core'
import { extractCodebaseInfo } from './utils/codebaseAnalysisExtractor'
import {
  buildTemplateReplacements,
  applyTemplateReplacements,
} from './utils/templateReplacer'
import {
  analyzePricingModel,
  constructPricingModelInstructions,
} from './utils/pricingModelUtils'

enum PricingComponent {
  FeatureAccess = 'feature_access',
  UsageBased = 'usage_based',
  Subscription = 'subscription',
  OneTime = 'one_time',
  FreeTrial = 'free_trial_by_time',
  FreeTrialByCredit = 'free_trial_by_credit',
  Discount = 'discount',
}

const getSetupInstructionsSchema = {
  // Auto-detection mode: provide file contents
  fileContents: z
    .array(
      z.object({
        path: z
          .string()
          .describe('File path relative to project root'),
        content: z.string().describe('File contents'),
      })
    )
    .optional()
    .describe(
      'Optional: Array of file contents to auto-detect project structure. If provided, analyzeCodebase will be called first to analyze the codebase.'
    ),
  // Codebase analysis result (from analyzeCodebase tool)
  codebaseAnalysis: z
    .string()
    .optional()
    .describe(
      'Optional: The markdown document result from analyzeCodebase. If provided, this will be used to generate tailored integration instructions. If fileContents are provided but codebaseAnalysis is not, the tool will return instructions to call analyzeCodebase first.'
    ),
  // Manual mode: provide structure directly
  projectStructure: z
    .enum(['nextjs', 'react'])
    .optional()
    .describe(
      'Optional: The structure of the project (nextjs or react). Defaults to nextjs if not provided. Will be extracted from codebaseAnalysis if available.'
    ),
  pricingComponents: z
    .array(z.nativeEnum(PricingComponent))
    .describe(
      'Aspects of the pricing model that need to be considered to properly set up billing and payments.'
    ),
  stackDetails: z
    .string()
    .optional()
    .describe(
      'Optional: The stack details for the project. Will be extracted from codebaseAnalysis if available.'
    ),
  additionalDetails: z
    .string()
    .optional()
    .describe(
      'Additional details for the project. Include things like the tenant / customer model if there is one. Are customers organizations like groups of users, or is every user a customer? Will be extracted from codebaseAnalysis if available.'
    ),
}

const loadCodeSnippets = async (): Promise<any> => {
  const snippetsPath = path.join(
    process.cwd(),
    'src/mcp/tools/codeSnippets.json'
  )
  const content = await fs.readFile(snippetsPath, 'utf8')
  return JSON.parse(content)
}

const loadGenerationTemplate = async (): Promise<string> => {
  return await fs.readFile(
    path.join(
      process.cwd(),
      'src/mcp/tools/generation-based-subscription-flowglad-integration.md'
    ),
    'utf8'
  )
}

export const getSetupInstructions: ToolConstructor<
  typeof getSetupInstructionsSchema
> = {
  name: 'getSetupInstructions',
  description:
    'Get instructions for a project to integrate billing and payments. Can auto-detect project structure from file contents, or use manual projectStructure parameter.',
  schema: getSetupInstructionsSchema,
  callbackConstructor:
    (apiKey: string) =>
    async ({
      fileContents,
      codebaseAnalysis,
      projectStructure: manualProjectStructure,
      pricingComponents,
      stackDetails: manualStackDetails,
      additionalDetails: manualAdditionalDetails,
    }) => {
      // Extract API key from parameter, authInfo, or environment variable
      // Similar to analyzeCodebase, check multiple sources
      let bearerToken = apiKey || ''

      // If still no token, try to get from environment variable (for local dev)
      if (!bearerToken || bearerToken.trim() === '') {
        bearerToken = core.envVariable('MCP_API_KEY') || ''
        // Strip "Bearer " prefix if present (common in env files)
        if (bearerToken.startsWith('Bearer ')) {
          bearerToken = bearerToken.substring(7).trim()
        }
      }

      // Verify API key is provided
      if (!bearerToken || bearerToken.trim() === '') {
        throw new Error(
          'No API key provided. The tool requires authentication via API key in the Authorization header or MCP_API_KEY environment variable.'
        )
      }

      // Use the resolved token for all operations
      const resolvedApiKey = bearerToken

      // If fileContents are provided but no codebaseAnalysis, return instructions to analyze first
      if (
        fileContents &&
        fileContents.length > 0 &&
        !codebaseAnalysis
      ) {
        // console.log(
        //   '[getSetupInstructions] fileContents provided but no codebaseAnalysis - calling analyzeCodebase first'
        // )
        const analyzeResult =
          await analyzeCodebase.callbackConstructor(resolvedApiKey)({
            fileContents,
            projectRoot: undefined,
          })

        // Return the analysis request to Cursor
        return {
          content: [
            {
              type: 'text',
              text: `# Codebase Analysis Required

Before generating setup instructions, please analyze the codebase first using the analyzeCodebase tool.

## Step 1: Analyze the Codebase

The analyzeCodebase tool has been called with your file contents. Please analyze the codebase according to the prompt and create a comprehensive markdown document.

## Step 2: Generate Setup Instructions

Once you have completed the codebase analysis and created the markdown document, call getSetupInstructions again with:
- \`codebaseAnalysis\`: The complete markdown document from your analysis
- \`fileContents\`: (same as before, optional)
- \`pricingComponents\`: ${JSON.stringify(pricingComponents)}

---

## Analysis Request from analyzeCodebase:

${analyzeResult.content.map((c: any) => c.text).join('\n\n')}`,
            },
          ],
        }
      }

      // Extract information from codebaseAnalysis using utility function
      const codebaseInfo = extractCodebaseInfo(codebaseAnalysis)

      // Use manual values as fallback or override
      const finalProjectStructure: 'nextjs' | 'react' =
        (manualProjectStructure ||
          codebaseInfo.projectStructure ||
          'nextjs') as 'nextjs' | 'react'
      const finalStackDetails: string = (manualStackDetails ||
        codebaseInfo.stackDetails ||
        'No stack details provided.') as string
      const finalAdditionalDetails: string =
        (manualAdditionalDetails ||
          codebaseInfo.additionalDetails ||
          '') as string

      // Fetch default pricing model for the organization
      let pricingModelData: SetupPricingModelInput | null = null
      let pricingModelYAML: string | null = null
      let pricingModelAnalysis: ReturnType<
        typeof analyzePricingModel
      > | null = null

      try {
        // Pass the API key to authenticatedTransaction - it will use it for database authentication
        pricingModelData =
          await authenticatedTransaction<SetupPricingModelInput | null>(
            async ({ transaction, organizationId, livemode }) => {
              const defaultPricingModel =
                await selectDefaultPricingModel(
                  { organizationId, livemode },
                  transaction
                )

              if (!defaultPricingModel) {
                return null
              }

              return await getPricingModelSetupData(
                defaultPricingModel.id,
                transaction
              )
            },
            { apiKey: resolvedApiKey }
          )

        if (pricingModelData) {
          try {
            pricingModelYAML = yaml.stringify(pricingModelData)
            pricingModelAnalysis =
              analyzePricingModel(pricingModelData)
            // console.log(
            //   `[getSetupInstructions] Successfully generated YAML for pricing model (${pricingModelData.products.length} products, ${pricingModelData.features.length} features, ${pricingModelData.usageMeters.length} usage meters)`
            // )
          } catch (yamlError) {
            console.error(
              '[getSetupInstructions] Failed to stringify pricing model to YAML:',
              yamlError
            )
            // pricingModelYAML will remain null, but pricingModelData is still available
          }
        } else {
          // console.log(
          //   '[getSetupInstructions] No default pricing model found for organization'
          // )
        }
      } catch (error) {
        // If we can't fetch the pricing model, continue without it
        // This allows the tool to still work for projects that haven't set up pricing models yet
        console.warn(
          '[getSetupInstructions] Failed to fetch pricing model:',
          error
        )
      }

      // Load generation template and code snippets
      const generationTemplate = await loadGenerationTemplate()
      const snippets = await loadCodeSnippets()

      // Build template replacements using utility function
      // returns map of placeholder to replacement value
      const templateReplacements = buildTemplateReplacements({
        codebaseInfo,
        codebaseAnalysis,
        pricingModelData,
        snippets,
        finalProjectStructure,
        finalStackDetails,
      })

      // Apply template replacements
      let customizedInstructions = applyTemplateReplacements(
        generationTemplate,
        templateReplacements
      )

      // Prepend codebase analysis if available
      if (codebaseAnalysis) {
        customizedInstructions = `# Codebase Analysis

${codebaseAnalysis}

---

# Flowglad Integration Instructions

${customizedInstructions}`
      }

      // Add pricing model information and conditional instructions
      let finalInstructions = customizedInstructions

      if (
        pricingModelYAML &&
        pricingModelData &&
        pricingModelAnalysis
      ) {
        const pricingModelInstructions =
          constructPricingModelInstructions(
            pricingModelData,
            pricingModelAnalysis
          )

        finalInstructions = `${customizedInstructions}

# Pricing Model Configuration

Your organization's default pricing model has been detected. Use the following configuration when setting up products and features:

\`\`\`yaml
${pricingModelYAML}
\`\`\`

${pricingModelInstructions ? `\n${pricingModelInstructions}` : ''}
`
      } else {
        // Add feedback about pricing model status
        const pricingModelStatus =
          pricingModelData === null
            ? 'No default pricing model found for your organization. You can set up your pricing model in the Flowglad dashboard.'
            : pricingModelYAML === null
              ? 'Failed to generate YAML from pricing model data. Please check the console for errors.'
              : 'Pricing model data was found but analysis failed. The YAML may be incomplete.'

        finalInstructions = `${customizedInstructions}

---

## Pricing Model Status

${pricingModelStatus}

To use pricing model-specific instructions, ensure you have:
1. Created a default pricing model in your Flowglad organization
2. Configured products, prices, features, and usage meters (if applicable)
`
      }

      return {
        content: [
          {
            type: 'text',
            text: finalInstructions,
          },
        ],
      }
    },
}
