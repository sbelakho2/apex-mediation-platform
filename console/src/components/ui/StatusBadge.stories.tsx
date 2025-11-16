import type { Meta, StoryObj } from '@storybook/react'
import { Archive } from 'lucide-react'
import { StatusBadge } from './StatusBadge'

const meta: Meta<typeof StatusBadge> = {
  title: 'UI/Status Badge',
  component: StatusBadge,
  args: {
    status: 'paid',
    size: 'sm',
  },
  argTypes: {
    status: {
      control: 'text',
      description: 'Billing status string (paid, open, draft, void, uncollectible, etc.)',
    },
    size: {
      control: { type: 'inline-radio' },
      options: ['sm', 'md'],
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Visualizes billing + workflow states using Tailwind tokens defined in DESIGN_STANDARDS.md. Extend `variantMap` for custom labels/colors.',
      },
    },
  },
}

export default meta

type Story = StoryObj<typeof StatusBadge>

export const Paid: Story = {
  args: {
    status: 'paid',
  },
}

export const Open: Story = {
  args: {
    status: 'open',
    size: 'md',
  },
}

export const Draft: Story = {
  args: {
    status: 'draft',
  },
}

export const CustomVariant: Story = {
  args: {
    status: 'archived',
    variantMap: {
      archived: {
        classes: 'bg-slate-900 text-white border-slate-800',
        fallbackLabel: 'Archived',
        icon: Archive,
      },
    },
    formatLabel: (value: string) => value.toUpperCase(),
  },
  parameters: {
    docs: {
      description: {
        story: 'Demonstrates overriding colors + labels via `variantMap` and `formatLabel`. Replace the icon with lucide-react glyphs as needed.',
      },
    },
  },
}
