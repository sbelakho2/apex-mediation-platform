'use client'

import type { Meta, StoryObj } from '@storybook/react'
import { CopyButton } from './CopyButton'

const meta: Meta<typeof CopyButton> = {
  title: 'UI/Copy Button',
  component: CopyButton,
  args: {
    text: 'pub_demo_1234',
    label: 'Copy Publisher ID',
  },
  argTypes: {
    variant: {
      control: { type: 'inline-radio' },
      options: ['default', 'inline', 'icon'],
    },
    size: {
      control: { type: 'inline-radio' },
      options: ['sm', 'md'],
    },
  },
  parameters: {
    docs: {
      description: {
        component: 'Accessible copy affordance with tooltips, timers, and insecure-context fallbacks.',
      },
    },
  },
}

export default meta

type Story = StoryObj<typeof CopyButton>

export const Default: Story = {}

export const Inline: Story = {
  args: {
    variant: 'inline',
    label: 'Copy Signature',
  },
}

export const IconOnly: Story = {
  args: {
    variant: 'icon',
    size: 'sm',
    label: 'Copy Auction ID',
  },
}
