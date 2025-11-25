import { z } from 'zod'
import { ToolConstructor } from '../toolWrap'
import core from '@/utils/core'
import { promises as fs } from 'fs'
import path from 'path'

const analyzeCodebaseSchema = {
  fileContents: z
    .array(
      z.object({
        path: z
          .string()
          .describe('File path relative to project root'),
        content: z.string().describe('File contents'),
      })
    )
    .min(1, 'At least one file is required for analysis')
    .describe(
      'Array of file contents to analyze. Include key files like package.json, auth config files, route files, middleware, API routes, etc.'
    ),
  projectRoot: z
    .string()
    .optional()
    .describe('Project root path (optional, for context)'),
}

const loadAnalysisPrompt = async (): Promise<string> => {
  return await fs.readFile(
    path.join(process.cwd(), 'src/mcp/tools/analyze-codebase.md'),
    'utf8'
  )
}

export const analyzeCodebase: ToolConstructor<
  typeof analyzeCodebaseSchema
> = {
  name: 'analyzeCodebase',
  description:
    'Analyzes codebase files and returns a comprehensive markdown document describing the application structure, authentication, and patterns. Uses a prompt-based approach to generate detailed analysis. The AI assistant (Cursor) should use the provided prompt to analyze the files and create a complete markdown document.',
  schema: analyzeCodebaseSchema,
  callbackConstructor:
    (apiKey: string) =>
    async (
      args: {
        fileContents?: Array<{ path: string; content: string }>
        projectRoot?: string
      },
      extra?: { authInfo?: { token?: string } }
    ) => {
      try {
        // The token should be available in extra.authInfo.token (from withMcpAuth)
        // If not available there, fall back to the apiKey parameter or MCP_API_KEY env var
        let bearerToken = extra?.authInfo?.token || apiKey || ''

        // If still no token, try to get from environment variable (for local dev)
        if (!bearerToken || bearerToken.trim() === '') {
          bearerToken = core.envVariable('MCP_API_KEY') || ''
        }

        // Log token extraction (similar to route.ts logging)
        if (!bearerToken || bearerToken.trim() === '') {
          console.warn(
            '[analyzeCodebase] No bearer token found in extra.authInfo.token, apiKey param, or MCP_API_KEY env var'
          )
        }

        // According to mcp-handler documentation, the callback receives validated parameters
        // directly as the first argument. The MCP handler should have already validated
        // them against the schema before calling this callback.
        const { fileContents, projectRoot } = args || {}

        // Validate that fileContents is provided
        if (!fileContents || !Array.isArray(fileContents)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error:
                      'fileContents is required and must be an array',
                    message:
                      'The tool requires fileContents parameter to be provided as an array.',
                    received: {
                      fileContents:
                        fileContents === undefined
                          ? 'undefined'
                          : typeof fileContents,
                      argsType: typeof args,
                      argsKeys: args ? Object.keys(args) : 'null',
                      hasFileContents: !!fileContents,
                      isArray: Array.isArray(fileContents),
                    },
                    expected: {
                      fileContents: [
                        { path: 'package.json', content: '...' },
                        {
                          path: 'src/app/layout.tsx',
                          content: '...',
                        },
                      ],
                      projectRoot: 'optional string',
                    },
                    note: 'The MCP handler should extract params.arguments from the JSON-RPC request, validate against the schema, and pass them to this callback. If fileContents is undefined, the handler may not be extracting/validating parameters correctly. The toolWrap function attempts to extract arguments from params.arguments or args.arguments if request context is passed instead.',
                  },
                  null,
                  2
                ),
              },
            ],
          }
        }

        // Filter out invalid file entries
        const validFiles = fileContents.filter(
          (f) =>
            f &&
            typeof f === 'object' &&
            f.path &&
            f.content !== undefined
        )

        if (validFiles.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: 'No valid files provided for analysis',
                    message:
                      'Please provide files with both path and content properties.',
                    received:
                      fileContents.length === 0
                        ? 'Empty array'
                        : `${fileContents.length} file(s) provided, but none had valid path and content`,
                  },
                  null,
                  2
                ),
              },
            ],
          }
        }

        // Load the analysis prompt from the markdown file
        const analysisPrompt = await loadAnalysisPrompt()

        // Format files for inclusion in the prompt
        const filesContext = validFiles
          .map(
            (f) =>
              `## File: ${f.path}\n\n\`\`\`\n${f.content}\n\`\`\``
          )
          .join('\n\n---\n\n')

        // Combine the prompt with the file contents
        const fullAnalysisRequest = `${analysisPrompt}

---

# Codebase Files to Analyze

${projectRoot ? `**Project Root:** ${projectRoot}\n\n` : ''}**Files Analyzed:** ${validFiles.length}

---

${filesContext}

---

# Your Task

Please analyze the above codebase files according to the prompt above and create a comprehensive markdown document that covers all sections. The document should be complete and ready to be used as context for generating a Flowglad integration guide.`

        // Return the prompt with files for Cursor to analyze
        return {
          content: [
            {
              type: 'text',
              text: fullAnalysisRequest,
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error analyzing codebase: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    },
}
