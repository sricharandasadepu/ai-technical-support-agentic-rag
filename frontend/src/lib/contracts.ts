import { z } from 'zod'

// Mirrors backend/app/schemas/user.py and rag.py. UUIDs remain backend-owned.
export const userSchema = z.object({ name: z.string(), email: z.email() })
export const tokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal('bearer'),
})
export const statusSchema = z.enum([
  'answered',
  'clarification',
  'greeting',
  'out_of_scope',
  'escalated',
])
export const sourceSchema = z.object({
  citation: z.string(),
  source: z.string(),
  chunk_id: z.string().nullable().optional(),
  ticket_id: z.string().nullable().optional(),
})
export const chatResponseSchema = z.object({
  answer: z.string(),
  sources: z.array(sourceSchema),
  conversation_id: z.uuid(),
  status: statusSchema,
  escalation_recommended: z.boolean(),
  escalation_reason: z.string().nullable().optional(),
})
export const summarySchema = z.object({
  conversation_id: z.uuid(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  turn_count: z.number().int(),
})
export const conversationListSchema = z.object({
  conversations: z.array(summarySchema),
  limit: z.number().int(),
  offset: z.number().int(),
})
export const historyMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  created_at: z.string(),
  sources: z.array(sourceSchema).default([]),
  status: statusSchema.nullable().optional(),
  escalation_recommended: z.boolean().default(false),
  escalation_reason: z.string().nullable().optional(),
})
export const historySchema = z.object({
  conversation_id: z.uuid(),
  messages: z.array(historyMessageSchema),
  total_turns: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})
export const loginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})
export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Use at least 2 characters.').max(100),
  email: z.email('Enter a valid email address.'),
  password: z
    .string()
    .min(8, 'Use at least 8 characters.')
    .max(128, 'Use no more than 128 characters.'),
})
export type User = z.infer<typeof userSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type SourceReference = z.infer<typeof sourceSchema>
export type WorkflowStatus = z.infer<typeof statusSchema>
export type ChatResponse = z.infer<typeof chatResponseSchema>
export type ConversationSummary = z.infer<typeof summarySchema>
export type ConversationHistory = z.infer<typeof historySchema>
export type HistoryMessage = z.infer<typeof historyMessageSchema>
export type ChatRequest = { message: string; conversation_id?: string }
