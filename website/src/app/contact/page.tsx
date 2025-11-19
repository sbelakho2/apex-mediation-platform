import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import React from 'react';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import Section from '@/components/ui/Section';
import Container from '@/components/ui/Container';

export const metadata: Metadata = {
  title: 'Contact — ApexMediation',
  description: 'Get in touch with ApexMediation. We are here to help with integration, transparency, and growth.',
  openGraph: {
    title: 'Contact — ApexMediation',
    description:
      'Questions about integration, transparency, or performance? Contact the ApexMediation team by email.',
  },
};

// Prefer server-only env if present; fall back to a public contact alias.
const EMAIL = process.env.SUPPORT_EMAIL
  || process.env.CONTACT_EMAIL
  || process.env.NEXT_PUBLIC_CONTACT_EMAIL
  || 'contact@apexmediation.ee';

export default function ContactPage() {
  return (
    <Section as="main">
      <Container className="max-w-3xl">
        <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Contact' }]} />
        <header className="mb-8 flex items-center gap-3">
          {/* Note: place a copy of the logo at website/public/Logo.jpg for best performance */}
          <div className="relative h-10 w-10">
            <Image
              src="/Logo.jpg"
              alt="ApexMediation logo"
              fill
              sizes="40px"
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Contact ApexMediation</h1>
        </header>

        <section aria-labelledby="contact-email" className="prose dark:prose-invert">
          <h2 id="contact-email">Email</h2>
          <p>
            The fastest way to reach us is by email. We typically respond within one business day.
          </p>
          <p>
            <Link
              href={`mailto:${EMAIL}`}
              aria-label={`Email ApexMediation at ${EMAIL}`}
              className="inline-flex items-center gap-2 no-underline font-medium text-primary-600 hover:underline focus:outline-none focus-visible:ring focus-visible:ring-primary-500/50"
            >
              {EMAIL}
            </Link>
          </p>
        </section>

        <section aria-labelledby="support" className="prose mt-8 dark:prose-invert">
          <h2 id="support">How we can help</h2>
          <ul>
            <li>SDK integration and migration from incumbent mediation</li>
            <li>Transparency verification and audit support</li>
            <li>Performance tuning and SLO guidance</li>
          </ul>
        </section>

        <section aria-labelledby="accessibility" className="prose mt-8 dark:prose-invert">
          <h2 id="accessibility">Accessibility</h2>
          <p>
            If you need assistance using our site or documentation, please let us know. We strive to meet WCAG 2.2 AA standards and will
            accommodate reasonable requests.
          </p>
        </section>
      </Container>
    </Section>
  );
}
