type Server = {
	listen: (options?: { onUnhandledRequest?: 'warn' | 'error' | 'bypass' }) => void
	resetHandlers: (...handlers: any[]) => void
	close: () => void
	use: (...handlers: any[]) => void
}

let server: Server

try {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { setupServer } = require('msw/node')
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const { billingHandlers } = require('../msw/handlers')
		server = setupServer(...billingHandlers) as Server
} catch (_error) {
	server = {
		listen: () => undefined,
		resetHandlers: () => undefined,
		close: () => undefined,
		use: () => undefined,
	}
}

export { server }
