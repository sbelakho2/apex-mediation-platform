import type { Preview } from '@storybook/react'
import type { ReactElement } from 'react'
import '../src/app/globals.css'

const withAppShell = (Story: () => ReactElement) => (
  <div className="min-h-screen bg-gray-50 text-gray-900">
    <div className="max-w-4xl mx-auto py-10 px-6">
      <Story />
    </div>
  </div>
)

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    actions: { argTypesRegex: '^on[A-Z].*' },
    backgrounds: {
      default: 'console-gray',
      values: [
        { name: 'console-gray', value: '#f8fafc' },
        { name: 'surface', value: '#ffffff' },
        { name: 'slate', value: '#0f172a' },
      ],
    },
    layout: 'fullscreen',
  },
  decorators: [withAppShell],
}

export default preview
