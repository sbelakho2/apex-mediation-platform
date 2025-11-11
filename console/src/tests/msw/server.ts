import { setupServer } from 'msw/node'
import { billingHandlers } from '../msw/handlers'

export const server = setupServer(...billingHandlers)
