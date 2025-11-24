'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import clsx from 'clsx';
import { motion } from 'framer-motion';
import {
  Coins,
  Gauge,
  Globe2,
  Layers,
  LifeBuoy,
  Network,
  PenSquare,
  Radar,
  Scale,
  ServerCog,
  ShieldCheck,
  TimerReset,
  Users2,
  Wallet,
  Workflow,
  Zap,
} from 'lucide-react';

import CookieBanner from '@/components/CookieBanner';
import Footer from '@/components/Footer';
import HomeNav from '@/components/HomeNav';
import NewsletterPanel from '@/components/NewsletterPanel';
import NotificationBar from '@/components/NotificationBar';
import SectionHeading from '@/components/SectionHeading';
import Section from '@/components/ui/Section';
import Container from '@/components/ui/Container';

const heroStats: Array<{ icon: LucideIcon; title: string; description: string }> = [
  {
    icon: TimerReset,
    title: '13-minute go-live',
    description: 'Follow the five-step quickstart to ship Unity, iOS, Android, or Web SDKs without waiting on a platform release cycle.',
  },
  {
    icon: Zap,
    title: '<50ms bidder runtime',
    description: 'Header bidding requests fan out across 11 POPs, keeping waterfalls clear while experiments run in parallel.',
  },
  {
    icon: ShieldCheck,
    title: '99.7% fraud precision',
    description: 'AI models from the Fraud Prevention playbook quarantine IVT before finance ever feels the revenue clawback.',
  },
  {
    icon: Network,
    title: '15 built-in adapters',
    description: 'Android, iOS/tvOS, Unity, Android TV, and Web SDKs all expose the same 15 BYO network connectors documented in the adapter registry.',
  },
];

type FeatureCardConfig = {
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: string;
  span?: 'double';
  accent?: 'brand';
};

const featureCards: FeatureCardConfig[] = [
  {
    icon: Workflow,
    title: 'Experiment autopilot',
    description: 'Launch Bayesian A/B tests, guard traffic with automatic significance checks, and only roll out winners after the documented guardrails clear risk thresholds.',
    badge: 'Docs favorite',
    span: 'double',
    accent: 'brand',
  },
  {
    icon: ShieldCheck,
    title: 'Fraud sentinel',
    description: 'Behavioral, device, and timing models from the Fraud Prevention guide block IVT with 99.7% precision before advertisers claw back spend.',
  },
  {
    icon: Scale,
    title: 'Consent & GDPR automation',
    description: 'Apply DPA-backed processing, IAB TCF strings, and 30-day deletion SLAs straight from the GDPR Compliance playbook.',
  },
  {
    icon: Radar,
    title: 'Telemetry & debugger',
    description: 'Use the Mediation Debugger to replay auction traces, pacing curves, and transparency receipts alongside SDK logs.',
  },
  {
    icon: Wallet,
    title: 'Finance-ready payouts',
    description: 'A simple platform fee (0–2.5%) funds payouts, invoicing, FX, and compliance—publishers keep their demand while we automate NET 30 payments and €100 minimums across SEPA/SWIFT.',
  },
  {
    icon: Users2,
    title: 'Developer quickstart',
    description: 'Unity, iOS, Android, Web, and CTV SDKs ship typed adapters, config-as-code, CI smoke tests, and the shared 15-network registry so you integrate in minutes, not sprints.',
  },
];

type PopularCardConfig = {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  badge?: string;
};

const popularCards: PopularCardConfig[] = [
  {
    icon: TimerReset,
    title: 'Onboarding checklist',
    description: 'Follow the five-step Quick Start to create apps, grab API keys, and ship your first ad in 13 minutes.',
    href: '/documentation#getting-started',
    badge: 'Fastest win',
  },
  {
    icon: ServerCog,
    title: 'Mediation debugger',
    description: 'Replay sanitized auction traces, transparency receipts, and pacing deltas before pushing to production.',
    href: '/documentation#mediation-debugger',
  },
  {
    icon: ShieldCheck,
    title: 'GDPR compliance desk',
    description: 'Download the DPA, SCCs, consent flows, and API endpoints that satisfy access/delete requests inside 30 days.',
    href: '/gdpr',
    badge: 'Legal ready',
  },
];

type LearnCardConfig = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  cta: { label: string; href: string };
  ctaVariant?: 'link' | 'button';
};

const learnCards: LearnCardConfig[] = [
  {
    icon: PenSquare,
    eyebrow: 'Compliance',
    title: 'GDPR toolkit & templates',
    description: 'Download the DPA, SCCs, consent copy, and deletion runbooks straight from the GDPR Compliance guide.',
    cta: { label: 'View GDPR guide', href: '/gdpr' },
    ctaVariant: 'link',
  },
  {
    icon: Gauge,
    eyebrow: 'Playbook',
    title: 'Revenue experiment templates',
    description: 'Use the documented sample sizes, guardrails, and monitoring widgets to keep every test statistically sound.',
    cta: { label: 'Open A/B testing docs', href: '/documentation#ab-testing-platform' },
    ctaVariant: 'button',
  },
];

type PrincipleCardConfig = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const principleCards: PrincipleCardConfig[] = [
  {
    icon: Layers,
    title: 'Auditable auctions',
    description: 'Match every clearing price to transparency receipts and mediation debugger traces when finance needs evidence.',
  },
  {
    icon: Scale,
    title: 'Privacy by design',
    description: 'GDPR, COPPA, and store policy guardrails follow the compliance guide and ship consent APIs by default.',
  },
  {
    icon: LifeBuoy,
    title: 'Human support',
    description: 'Revenue engineers across EMEA + NA pair on launches, fraud reviews, and payment reconciliations.',
  },
  {
    icon: Globe2,
    title: 'Global readiness',
    description: '11 POPs, localized docs, and WCAG AA-compliant surfaces keep consoles calm for every locale.',
  },
];

const supportedNetworks = [
  'AdMob',
  'AppLovin',
  'Unity Ads',
  'ironSource',
  'Meta Audience Network',
  'Vungle',
  'Chartboost',
  'Pangle',
  'Mintegral',
  'AdColony',
  'Tapjoy',
  'Moloco',
  'Fyber',
  'Smaato',
  'Amazon Publisher Services',
] as const;

const supportedNetworksList = supportedNetworks.join(', ');

type PricingTierConfig = {
  icon: LucideIcon;
  name: string;
  price: string;
  description: string;
  highlights: string[];
  badge?: string;
  ctaLabel: string;
  ctaHref: string;
  accent?: 'brand';
};

const pricingTiers: PricingTierConfig[] = [
  {
    icon: Coins,
    name: 'Tier 0 — Starter',
    price: '0% platform fee',
    description: 'Up to $10k mediated revenue per app per month. Ship the SDKs, validate BYO flows, and keep every cent while you ramp.',
    highlights: [
      'Full Android, iOS/tvOS, Unity, Web, and TV SDK access',
      'Covers up to 5 apps per workspace',
      'Core analytics + basic mediation debugger',
    ],
    badge: 'Free tier',
    ctaLabel: 'Launch for free',
    ctaHref: '/signup',
    accent: 'brand',
  },
  {
    icon: Gauge,
    name: 'Tier 1 — Growth',
    price: '2.5% platform fee',
    description: '$10k–$100k mediated revenue per app per month. Ideal for teams running live ops with active experiments.',
    highlights: [
      'Advanced observability (adapter metrics + SLO dashboards)',
      'Migration Studio + audit-ready export bundles',
      'Email/Slack support with documented SLA',
      'Example: $50k/mo → $1,250 platform fee',
    ],
    badge: 'Most popular',
    ctaLabel: 'Review Growth tier',
    ctaHref: '/pricing',
  },
  {
    icon: Layers,
    name: 'Tier 2 — Scale',
    price: '2.0% platform fee',
    description: '$100k–$500k mediated revenue per app per month with deeper data needs and partner workflows.',
    highlights: [
      'Priority support + named revenue engineer',
      'Custom dashboards and exports (BigQuery/S3/native APIs)',
      'Early access to fraud/ML tooling while it runs in shadow mode',
      'Example: $250k/mo → $5,000 platform fee',
    ],
    ctaLabel: 'Talk to revenue engineering',
    ctaHref: '/contact',
  },
  {
    icon: ShieldCheck,
    name: 'Tier 3 — Enterprise',
    price: 'Custom (1.0–1.5%) + minimum',
    description: '$500k+ mediated revenue per app per month with regulated workflows and bespoke compliance reviews.',
    highlights: [
      'All Scale features plus contractual SLAs',
      'Dedicated Slack channel + quarterly reviews',
      'Custom onboarding/migration program',
      'Custom data residency reviews with external audit support',
    ],
    ctaLabel: 'Design your enterprise plan',
    ctaHref: '/contact',
  },
];

type PlatformValuePoint = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const platformValuePoints: PlatformValuePoint[] = [
  {
    icon: Workflow,
    title: 'Mediation & auction brain',
    description: 'Waterfall, header bidding, pacing, and floor automation across every BYO adapter—no need to juggle 10 SDK control panels.',
  },
  {
    icon: Radar,
    title: 'Observability & debugging',
    description: 'Unified metrics, SLO dashboards, and the mediation debugger so ops teams can prove delivery and spot issues before revenue dips.',
  },
  {
    icon: ShieldCheck,
    title: 'Fraud & quality tooling',
    description: 'Shadow ML models, anomaly alerts, and evidence packs that keep clawbacks low even while demand partners stay under your accounts.',
  },
  {
    icon: PenSquare,
    title: 'Migration & transparency',
    description: 'Migration Studio, signed transparency logs, and reproducible auctions for every compliance or finance review.',
  },
  {
    icon: Users2,
    title: 'One SDK, one console',
    description: 'Five platform SDKs, one integration path, and one UI instead of maintaining 10+ vendor SDKs and analytics portals.',
  },
];

type AddOnConfig = {
  title: string;
  price: string;
  description: string;
};

const addOns: AddOnConfig[] = [
  {
    title: 'White-label console',
    price: '+0.25% platform fee or $1,500/mo',
    description: 'Rebrand the console and share log-ins with enterprise customers without exposing the ApexMediation identity.',
  },
  {
    title: 'Extended retention & premium analytics',
    price: '+$500/mo per 12-month retention pack',
    description: 'Keep raw auction, payout, and fraud data for longer windows or stream curated dashboards into your BI stack.',
  },
  {
    title: 'Hands-on migration service',
    price: 'One-time consulting fee (quote per studio)',
    description: 'Revenue engineers import historical placements, recreate waterfalls, and pair on the go-live checklist end to end.',
  },
];

const getRevealProps = (delay = 0) => ({
  initial: 'hidden',
  whileInView: 'visible',
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.45, ease: 'easeOut', delay },
  variants: {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0 },
  },
});

export default function HomePage() {
  return (
    <>
      <NotificationBar />

      <main
        className="relative isolate overflow-hidden bg-white text-gray-900"
        role="main"
        aria-labelledby="hero-heading"
      >
        <div
          className="pointer-events-none absolute -left-40 top-24 hidden h-[520px] w-[520px] rounded-full bg-brand-50 blur-3xl md:block"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute right-[-140px] top-[-160px] hidden h-[500px] w-[500px] rounded-full bg-brand-100 blur-3xl lg:block"
          aria-hidden="true"
        />

        <div className="container relative z-10 py-6 md:py-10">
          <HomeNav />
        </div>

        <HeroSection />
      </main>

      {/* Decorative divider removed per new visual spec */}

      <Section>
        <Container className="space-y-6">
          <PopularSection />
        </Container>
      </Section>

      <Section>
        <Container className="space-y-6">
          <FeaturesSection />
        </Container>
      </Section>

      {/* Decorative divider removed per new visual spec */}

      <Section>
        <Container className="space-y-6">
          <AdaptersSection />
        </Container>
      </Section>

      {/* Decorative divider removed per new visual spec */}

      <Section>
        <Container className="space-y-6">
          <LearnSection />
        </Container>
      </Section>

      {/* Decorative divider removed per new visual spec */}

      <Section>
        <Container className="space-y-6">
          <PrinciplesSection />
        </Container>
      </Section>

      <Section inset>
        <Container>
          <NewsletterPanel />
        </Container>
      </Section>

      <Section>
        <Container className="space-y-6">
          <PricingSection />
        </Container>
      </Section>

      <Section>
        <Container className="space-y-6">
          <PlatformValueSection />
        </Container>
      </Section>

      <Section>
        <Container className="space-y-6">
          <AddOnsSection />
        </Container>
      </Section>
      <Footer />
      <CookieBanner />
    </>
  );
}

function HeroSection() {
  return (
    <section
      id="hero"
      className="hero relative z-10"
      aria-labelledby="hero-heading"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 px-4 text-center">
        <div className="flex flex-col items-center gap-4">
          <span className="eyebrow">Bring-your-own mediation SDKs</span>
          <h1 id="hero-heading">
            Launch one control plane, keep your demand, and tap every adapter we ship
          </h1>
          <p>
            The Android, iOS/tvOS, Unity, Android TV, and Web SDKs all share the same 15 documented adapters—{supportedNetworksList}—so your engineers can bring their own credentials without rewriting code per platform.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a href="/contact" className="btn-primary px-6">
            Book a revenue audit →
          </a>
          <a href="/documentation" className="btn-secondary px-6">
            Browse the docs
          </a>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <HeroPill>BYO-first deployment</HeroPill>
          <HeroPill>13-minute SDK quickstart</HeroPill>
          <HeroPill>15 built-in adapters</HeroPill>
          <HeroPill>NET 30 payouts • €100 min</HeroPill>
        </div>

        <div className="mt-10 grid w-full gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {heroStats.map((stat, index) => (
            <HeroStat key={stat.title} delay={index * 0.05} {...stat} />
          ))}
        </div>

        <p className="text-xs uppercase tracking-[0.32em] text-ink/60 underline">
          <a
            href="#animation-preferences"
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            Pause animation
          </a>
        </p>
      </div>

      <div id="animation-preferences" className="sr-only" aria-hidden="true">
        Animations are currently static on this page.
      </div>
    </section>
  );
}

function HeroPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-4 py-2 text-[0.75rem] font-semibold tracking-[0.18em] text-ink">
      {children}
    </span>
  );
}

function HeroStat({ icon: Icon, title, description, delay = 0 }: { icon: LucideIcon; title: string; description: string; delay?: number }) {
  return (
    <motion.article {...getRevealProps(delay)} className="card flex h-full flex-col gap-4 text-left">
      <span className="icon-pill" aria-hidden="true">
        <Icon />
      </span>
      <p className="font-display text-[1.375rem] font-semibold leading-[1.3] tracking-[-0.01em] text-ink">
        {title}
      </p>
      <p className="text-base text-inkMuted leading-relaxed">{description}</p>
    </motion.article>
  );
}

function PopularSection() {
  return (
    <section
      id="popular"
      className="bg-white py-16 md:py-20"
      aria-labelledby="popular-heading"
    >
      <div className="section-container">
        <SectionHeading
          eyebrow="Popular right now"
          title="Quick wins backed by the docs"
          description="Start with the published quickstart, debugger, and compliance kits so product, legal, and finance stay in lockstep."
          headingId="popular-heading"
        />

        <div className="grid gap-6 md:grid-cols-3">
          {popularCards.map((card, index) => (
            <PopularCard key={card.title} delay={index * 0.05} {...card} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PopularCard({ icon: Icon, title, description, href, badge, delay = 0 }: PopularCardConfig & { delay?: number }) {
  return (
    <motion.a
      {...getRevealProps(delay)}
      href={href}
      className="card group flex h-full flex-col gap-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="icon-pill" aria-hidden="true">
          <Icon />
        </span>
        {badge ? <span className="pill">{badge}</span> : null}
      </div>
      <span className="eyebrow">Playbook</span>
      <h3 className="font-display text-[1.35rem] font-semibold leading-[1.3] tracking-[-0.01em] text-ink">
        {title}
      </h3>
      <p className="text-base text-inkMuted leading-[1.6]">
        {description}
      </p>
      <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-brand">
        Learn more
        <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
          →
        </span>
      </span>
    </motion.a>
  );
}

function FeaturesSection() {
  return (
    <section
      id="features"
      className="bg-gray-50 py-20 md:py-24"
      aria-labelledby="features-heading"
    >
      <div className="section-container">
        <SectionHeading
          eyebrow="Platform pillars"
          title="Why developers choose ApexMediation"
          description="Each pillar maps directly to a customer-facing guide—experiments, fraud, consent, telemetry, finance, and SDK ergonomics."
          align="center"
          headingId="features-heading"
        />

        <div className="grid gap-6 md:grid-cols-3">
          {featureCards.map((card, index) => (
            <FeatureCard key={card.title} delay={index * 0.05} {...card} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ icon: Icon, title, description, badge, span, accent, delay = 0 }: FeatureCardConfig & { delay?: number }) {
  return (
    <motion.article
      {...getRevealProps(delay)}
      className={clsx(
        'feature-card flex h-full flex-col gap-4',
        span === 'double' && 'md:col-span-2',
        accent === 'brand' && 'bg-gradient-to-br from-brand-50/70 via-white to-white border-brand-100'
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="icon-pill" aria-hidden="true">
          <Icon />
        </span>
        {badge ? <span className="pill">{badge}</span> : null}
      </div>
      <h3 className="font-display text-[1.35rem] font-semibold leading-[1.3] tracking-[-0.01em] text-ink">
        {title}
      </h3>
      <p className="text-base leading-[1.6] text-inkMuted">{description}</p>
    </motion.article>
  );
}

function AdaptersSection() {
  return (
    <section
      id="adapters"
      className="bg-white py-16 md:py-20"
      aria-labelledby="adapters-heading"
    >
      <div className="section-container space-y-8">
        <SectionHeading
          eyebrow="Adapter coverage"
          title="15 network connectors across every SDK"
          description="Each BYO SDK (Android, iOS/tvOS, Unity, Android TV, and Web) reads from the same adapter registry, so you configure credentials once and reuse them everywhere."
          headingId="adapters-heading"
        />
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {supportedNetworks.map((network) => (
            <div
              key={network}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm font-semibold text-ink"
            >
              {network}
            </div>
          ))}
        </div>
        <p className="text-sm text-inkMuted">
          Source: Adapter registries in the Android (`AdapterRegistry.kt`), iOS/tvOS (`AdapterRegistry.swift`), Unity (`AdapterCatalog.cs`), Android TV (`CtvAdapterRegistry`), and Web (`SUPPORTED_NETWORKS`) SDKs.
        </p>
      </div>
    </section>
  );
}

function LearnSection() {
  return (
    <section
      id="learn"
      className="bg-white py-16 md:py-20"
      aria-labelledby="learn-heading"
    >
      <div className="section-container">
        <SectionHeading
          eyebrow="Learn & engage"
          title="Keep your monetization muscle sharp"
          description="Compliance kits and experimentation templates come straight from the customer-facing documentation team."
          headingId="learn-heading"
        />

        <div className="grid gap-6 md:grid-cols-2">
          {learnCards.map(({ icon: Icon, ...card }, index) => (
            <motion.article
              key={card.title}
              {...getRevealProps(index * 0.05)}
              className="card group flex h-full flex-col gap-4"
            >
              <div className="flex items-center gap-3">
                <span className="icon-pill" aria-hidden="true">
                  <Icon />
                </span>
                <span className="eyebrow">{card.eyebrow}</span>
              </div>
              <h3 className="font-display text-[1.35rem] font-semibold leading-[1.3] tracking-[-0.01em] text-ink">
                {card.title}
              </h3>
              <p className="text-base text-inkMuted leading-[1.6]">
                {card.description}
              </p>
              {card.ctaVariant === 'button' ? (
                <a href={card.cta.href} className="mt-auto inline-flex w-fit items-center justify-center btn-primary px-6">
                  {card.cta.label}
                </a>
              ) : (
                <a
                  href={card.cta.href}
                  className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-brand hover:text-brand-600"
                >
                  {card.cta.label}
                  <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
                    →
                  </span>
                </a>
              )}
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PrincipleCard({ icon: Icon, title, description, delay = 0 }: PrincipleCardConfig & { delay?: number }) {
  return (
    <motion.article {...getRevealProps(delay)} className="card flex h-full flex-col gap-3">
      <span className="icon-pill" aria-hidden="true">
        <Icon />
      </span>
      <h3 className="font-display text-[1.2rem] font-semibold leading-[1.3] tracking-[-0.01em] text-ink">
        {title}
      </h3>
      <p className="text-base leading-[1.6] text-inkMuted">{description}</p>
    </motion.article>
  );
}

function PrinciplesSection() {
  return (
    <section
      id="principles"
      className="bg-gray-50 py-20 md:py-24"
      aria-labelledby="principles-heading"
    >
      <div className="section-container">
        <div className="grid gap-12 lg:grid-cols-2">
          <div className="space-y-5">
            <SectionHeading
              eyebrow="Product principles"
              title="Every promise traces back to the docs"
              description="Pricing tables, GDPR guardrails, and support SLAs live in the same documentation we link throughout the site so your team can verify every claim."
              headingId="principles-heading"
            />
            <ul className="space-y-3 text-base text-inkMuted">
              <li className="flex items-start gap-3">
                <span className="icon-pill" aria-hidden="true">
                  <Coins />
                </span>
                <span>Platform fees stay transparent—0% Starter, 2.5% Growth, 2.0% Scale, and custom 1.0–1.5% Enterprise—backed by the same NET 30 payout schedule published in billing docs.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="icon-pill" aria-hidden="true">
                  <Scale />
                </span>
                <span>GDPR, COPPA, and consent workflows mirror the compliance guide—complete with DPA, SCCs, and 30-day deletion SLAs.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="icon-pill" aria-hidden="true">
                  <LifeBuoy />
                </span>
                <span>Support targets sub-4-hour responses during business hours, as promised in the Quick Start and Troubleshooting docs.</span>
              </li>
            </ul>
            <a
              href="/about"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand underline decoration-2 underline-offset-4 hover:text-brand-600"
            >
              Learn about our mission
              <span aria-hidden="true">→</span>
            </a>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {principleCards.map((card, index) => (
              <PrincipleCard key={card.title} delay={index * 0.05} {...card} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section
      id="pricing"
      className="bg-white py-20 md:py-24"
      aria-labelledby="pricing-heading"
    >
      <div className="section-container">
        <SectionHeading
          eyebrow="Get started"
          title="BYO control plane pricing"
          description="Starter (0%), Growth (2.5%), Scale (2.0%), and Enterprise (custom 1.0–1.5% + minimum) platform fees fund the SDKs, consent tooling, telemetry, and payouts while you keep ownership of demand."
          align="center"
          headingId="pricing-heading"
        />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {pricingTiers.map((tier, index) => (
            <PricingCard key={tier.name} delay={index * 0.05} {...tier} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PlatformValueSection() {
  return (
    <section
      id="platform-value"
      className="bg-gray-50 py-20 md:py-24"
      aria-labelledby="platform-value-heading"
    >
      <div className="section-container">
        <SectionHeading
          eyebrow="Platform value"
          title="What every platform fee includes"
          description="Five SDKs, adapter management, observability, fraud tooling, and migration support are part of the base platform—not add-ons or hidden upsells."
          align="center"
          headingId="platform-value-heading"
        />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {platformValuePoints.map((point, index) => (
            <PlatformValueCard key={point.title} delay={index * 0.05} {...point} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PlatformValueCard({ icon: Icon, title, description, delay = 0 }: PlatformValuePoint & { delay?: number }) {
  return (
    <motion.article
      {...getRevealProps(delay)}
      className="card flex h-full flex-col gap-4"
    >
      <span className="icon-pill" aria-hidden="true">
        <Icon />
      </span>
      <h3 className="font-display text-[1.3rem] font-semibold leading-[1.3] tracking-[-0.01em] text-ink">
        {title}
      </h3>
      <p className="text-base text-inkMuted leading-[1.6]">{description}</p>
    </motion.article>
  );
}

function PricingCard({ icon: Icon, name, price, description, highlights, badge, ctaHref, ctaLabel, accent, delay = 0 }: PricingTierConfig & { delay?: number }) {
  const isBrand = accent === 'brand';
  return (
    <motion.article
      {...getRevealProps(delay)}
      className={clsx(
        'card flex h-full flex-col gap-4',
        isBrand && 'bg-gradient-to-br from-brand-50 via-white to-white border-brand-100'
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="icon-pill" aria-hidden="true">
          <Icon />
        </span>
        {badge ? <span className="pill">{badge}</span> : null}
      </div>
      <div>
        <span className="eyebrow">{name}</span>
        <p className="font-display text-[2rem] font-semibold leading-tight text-ink">
          {price}
        </p>
      </div>
      <p className="text-base text-inkMuted leading-[1.6]">{description}</p>
      <ul className="space-y-2 text-sm text-ink">
        {highlights.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        <a
          href={ctaHref}
          className={clsx('w-full', isBrand ? 'btn-primary' : 'btn-secondary')}
        >
          {ctaLabel}
        </a>
      </div>
    </motion.article>
  );
}

function AddOnsSection() {
  return (
    <section
      id="add-ons"
      className="bg-white py-20 md:py-24"
      aria-labelledby="add-ons-heading"
    >
      <div className="section-container">
        <SectionHeading
          eyebrow="Optional add-ons"
          title="Layer extras onto any platform tier"
          description="Keep the base platform fees predictable and opt into white-labeling, longer retention, or hands-on migration support only when required."
          align="center"
          headingId="add-ons-heading"
        />
        <div className="grid gap-6 md:grid-cols-3">
          {addOns.map((addOn, index) => (
            <AddOnCard key={addOn.title} delay={index * 0.05} {...addOn} />
          ))}
        </div>
      </div>
    </section>
  );
}

function AddOnCard({ title, price, description, delay = 0 }: AddOnConfig & { delay?: number }) {
  return (
    <motion.article
      {...getRevealProps(delay)}
      className="card flex h-full flex-col gap-4"
    >
      <div>
        <span className="eyebrow">{price}</span>
        <h3 className="font-display text-[1.25rem] font-semibold leading-[1.3] tracking-[-0.01em] text-ink">
          {title}
        </h3>
      </div>
      <p className="text-base text-inkMuted leading-[1.6]">{description}</p>
    </motion.article>
  );
}
