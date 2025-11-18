import type { ReactNode } from 'react';

import CookieBanner from '@/components/CookieBanner';
import Footer from '@/components/Footer';
import HomeNav from '@/components/HomeNav';
import NewsletterPanel from '@/components/NewsletterPanel';
import NotificationBar from '@/components/NotificationBar';
import ScallopedDivider from '@/components/ScallopedDivider';
import SectionHeading from '@/components/SectionHeading';

export default function HomePage() {
  return (
    <>
      <NotificationBar />

      <main
        className="relative isolate overflow-hidden bg-primary-blue text-white"
        role="main"
        aria-labelledby="hero-heading"
      >
        <div
          className="pointer-events-none absolute -left-40 top-24 hidden h-[520px] w-[520px] rounded-full bg-sunshine-yellow/25 blur-3xl md:block"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute right-[-140px] top-[-160px] hidden h-[500px] w-[500px] rounded-full bg-sunshine-yellow/15 blur-3xl lg:block"
          aria-hidden="true"
        />

        <div className="container relative z-10 py-6 md:py-10">
          <HomeNav />
        </div>

        <HeroSection />
      </main>

      <ScallopedDivider color="white" position="top" />
      <PopularSection />
      <FeaturesSection />
      <ScallopedDivider color="white" position="bottom" />
      <LearnSection />
      <ScallopedDivider color="cream" position="top" />
      <PrinciplesSection />
      <NewsletterPanel />
      <PricingSection />
      <Footer />
      <CookieBanner />
    </>
  );
}

function HeroSection() {
  return (
    <section
      id="hero"
      className="relative z-10 pb-16 pt-12 md:pb-24 md:pt-16 lg:pb-28 lg:pt-20"
      aria-labelledby="hero-heading"
    >
      <div className="container flex flex-col items-center gap-12 text-center">
        <div className="flex flex-col items-center gap-4">
          <span className="section-eyebrow text-white/80">Calm systems for monetization teams</span>
          <h1
            id="hero-heading"
            className="text-hero-sm text-sunshine-yellow drop-shadow-lg md:text-hero-md lg:text-hero"
          >
            ApexMediation is your control center for ad revenue
          </h1>
          <p className="max-w-3xl text-body-large text-white/90">
            Transparent mediation, ML-powered fraud detection, and delightful dashboards—crafted with editorial-grade clarity for modern ad ops teams.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <a href="/signup" className="btn-primary-yellow text-base sm:text-lg">
            Launch your console →
          </a>
          <a
            href="/documentation"
            className="inline-flex items-center justify-center rounded-full border border-white/60 bg-white/5 px-8 py-3 text-xs font-bold uppercase tracking-[0.28em] text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:text-sm"
          >
            Explore documentation
          </a>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <HeroPill>Unity • ironSource • AppLovin</HeroPill>
          <HeroPill>NET 30 payment terms</HeroPill>
          <HeroPill>Fraud detection insights</HeroPill>
          <HeroPill>SDKs for iOS, Android, Unity</HeroPill>
        </div>

        <div className="grid w-full gap-4 md:grid-cols-3">
          <HeroStat
            icon="📈"
            title="Unified performance view"
            description="Correlate pacing, payouts, QA, and fraud signals from a single console."
          />
          <HeroStat
            icon="⚡"
            title="&lt;50ms latency"
            description="Lightning-fast auctions across premium demand sources worldwide."
          />
          <HeroStat
            icon="🛡️"
            title="Adaptive fraud defense"
            description="ML models trained on 500k+ bad actors keep your monetization pristine."
          />
        </div>

        <p className="text-xs uppercase tracking-[0.32em] text-white/70 underline">
          <a
            href="#animation-preferences"
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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
    <span className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-[0.7rem] font-semibold tracking-[0.22em] text-white/80 backdrop-blur-sm">
      {children}
    </span>
  );
}

function HeroStat({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="flex h-full flex-col gap-3 rounded-3xl border border-white/15 bg-white/10 p-6 text-left text-white shadow-lg shadow-primary-blue/10 backdrop-blur-md transition-transform duration-300 hover:-translate-y-1 hover:shadow-hero">
      <span className="icon-badge bg-white/90 text-primary-blue">{icon}</span>
      <p className="text-xl font-semibold text-white">{title}</p>
      <p className="text-sm text-white/80 leading-relaxed">{description}</p>
    </div>
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
          title="Quick wins growth teams ship first"
          description="Roll out these high-impact experiences before the weekend and keep every stakeholder confident."
          headingId="popular-heading"
        />

        <div className="grid gap-6 md:grid-cols-3">
          <PopularCard
            title="Real-time bidding orchestration"
            description="Expose every network to a transparent, unified auction with real-time accountability."
            href="/documentation#real-time-bidding"
          />
          <PopularCard
            title="ML-powered fraud firewall"
            description="Stop bots and click farms before they touch your reports with continuous verification."
            href="/dashboard/fraud"
          />
          <PopularCard
            title="Creative A/B and holdout labs"
            description="Ship statistically sound experiments with automated significance and guardrails."
            href="/dashboard/ab-tests"
          />
        </div>
      </div>
    </section>
  );
}

function PopularCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <a
      href={href}
      className="group flex h-full flex-col justify-between rounded-3xl border border-primary-blue/15 bg-white p-6 text-primary-blue shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue"
    >
      <div className="flex flex-col gap-4">
        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-primary-blue/60">Playbook</span>
        <h3 className="text-lg font-semibold">
          {title}
        </h3>
        <p className="text-sm text-primary-blue/80 leading-relaxed">
          {description}
        </p>
      </div>
      <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary-blue">
        Learn more
        <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">
          →
        </span>
      </span>
    </a>
  );
}

function FeaturesSection() {
  return (
    <section
      id="features"
      className="bg-cream py-20 md:py-24"
      aria-labelledby="features-heading"
    >
      <div className="section-container">
        <SectionHeading
          eyebrow="Platform pillars"
          title="Why developers choose ApexMediation"
          description="We rebuilt mediation for 2025—open, transparent, and fast. Every surface pairs calm typography with controls built for collaboration."
          align="center"
          headingId="features-heading"
        />

        <div className="grid gap-6 md:grid-cols-3">
          <FeatureCard
            emoji="💰"
            title="Revenue clarity"
            description="Expose real clearing prices and steer sustainable monetization without guesswork."
          />
          <FeatureCard
            emoji="⚙️"
            title="Workflow automation"
            description="Automate bid floors, pacing and partner rotations with policy rules—not spreadsheets."
          />
          <FeatureCard
            emoji="🛡️"
            title="Fraud intelligence"
            description="Computer vision + behavioural models flag suspicious devices without hurting legit users."
            tone="blue"
          />
          <FeatureCard
            emoji="�"
            title="Live telemetry"
            description="Real-time dashboards with export-ready slices for finance, product and UA teams."
          />
          <FeatureCard
            emoji="💸"
            title="NET 30 payment terms"
            description="Wire, SEPA, PayPal or Stripe—no minimums, no waiting, just predictable cash flow."
          />
          <FeatureCard
            emoji="🧑‍�"
            title="Developer-first SDKs"
            description="Unity, iOS, Android and Web SDKs install in minutes with type-safe APIs and sample scenes."
          />
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ emoji, title, description, tone = 'light' }: { emoji: string; title: string; description: string; tone?: 'light' | 'blue' }) {
  const containerClass = tone === 'blue' ? 'card-blue' : 'card';
  const titleClass = tone === 'blue' ? 'text-white' : 'text-primary-blue';
  const descriptionClass = tone === 'blue' ? 'text-white/80' : 'text-primary-blue/80';

  return (
    <div className={`${containerClass} flex h-full flex-col gap-4 p-6`}>
      <span className="text-3xl">{emoji}</span>
      <h3 className={`text-base font-bold uppercase tracking-[0.18em] ${titleClass}`}>{title}</h3>
      <p className={`text-sm leading-relaxed ${descriptionClass}`}>{description}</p>
    </div>
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
          description="Weekly editorial, actionable templates, and interactive checkups inspired by the best product playbooks."
          headingId="learn-heading"
        />

        <div className="grid gap-6 md:grid-cols-2">
          <article className="group flex h-full flex-col gap-4 rounded-3xl border-2 border-primary-blue bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-hero">
            <span className="text-xs font-bold uppercase tracking-[0.28em] text-primary-blue/70">Editorial</span>
            <h3 className="text-lg font-bold uppercase tracking-[0.18em] text-primary-blue">
              10 revenue experiments to run this quarter
            </h3>
            <p className="text-sm text-primary-blue/80">
              Copy our highest performing monetization playbook complete with KPI targets and rollout timelines.
            </p>
            <a
              href="/blog"
              className="mt-auto inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.28em] text-primary-blue/80 group-hover:text-primary-blue"
            >
              Read article
              <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">→</span>
            </a>
          </article>

          <article className="group flex h-full flex-col gap-4 rounded-3xl border-2 border-sunshine-yellow bg-cream p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-hero">
            <span className="text-xs font-bold uppercase tracking-[0.28em] text-primary-blue/70">Interactive Quiz</span>
            <h3 className="text-lg font-bold uppercase tracking-[0.18em] text-primary-blue">
              What’s your ad monetization IQ?
            </h3>
            <p className="text-sm text-primary-blue/80">
              A five-minute diagnostic that surfaces integration gaps, pacing snags and optimization opportunities.
            </p>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex-1 overflow-hidden rounded-full bg-white/60">
                <div className="h-2 w-2/5 bg-primary-blue" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-primary-blue/70">4/10</span>
            </div>
            <a
              href="/quiz"
              className="mt-auto inline-flex items-center justify-center rounded-full bg-sunshine-yellow px-6 py-2 text-xs font-bold uppercase tracking-[0.28em] text-primary-blue transition-transform duration-200 hover:-translate-y-0.5 hover:bg-pale-yellow"
            >
              Start quiz
            </a>
          </article>
        </div>
      </div>
    </section>
  );
}

function PrinciplesSection() {
  return (
    <section
      id="principles"
      className="bg-cream py-20 md:py-24"
      aria-labelledby="principles-heading"
    >
      <div className="section-container">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div className="order-2 space-y-5 md:order-1">
            <SectionHeading
              eyebrow="Product principles"
              title="Transparency. Fairness. Innovation."
              description="ApexMediation is built on calm, transparent systems thinking. Every bidder, payout, and anomaly is surfaced in plain language so you stay confidently in control."
              headingId="principles-heading"
            />
            <ul className="space-y-3 text-sm text-primary-blue/80">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary-blue" aria-hidden="true" />
                No black-box pricing—inspect every clearing price and partner decision.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary-blue" aria-hidden="true" />
                Built-in compliance for GDPR, COPPA and platform policies from day one.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary-blue" aria-hidden="true" />
                Human support across EMEA and North America when you want strategic help.
              </li>
            </ul>
            <a
              href="/about"
              className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.28em] text-primary-blue underline decoration-2 underline-offset-4"
            >
              Learn about our mission
              <span aria-hidden="true">→</span>
            </a>
          </div>
          <div className="order-1 md:order-2">
            <div className="relative mx-auto max-w-sm">
              <div className="absolute -inset-4 rounded-[36px] border-4 border-sunshine-yellow" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-[32px] bg-primary-blue p-10 text-center shadow-hero">
                <div className="mx-auto flex h-full flex-col items-center justify-center gap-4">
                  <span className="text-6xl">◇</span>
                  <p className="text-lg font-semibold text-sunshine-yellow">
                    Built for clarity
                  </p>
                  <p className="text-sm text-white/80">
                    Crisp typography, generous spacing, and radical honesty to keep teams aligned.
                  </p>
                </div>
              </div>
            </div>
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
      className="bg-primary-blue py-20 text-white md:py-24"
      aria-labelledby="pricing-heading"
    >
      <div className="section-container">
        <SectionHeading
          eyebrow="Get started"
          title="Ready to streamline monetization?"
          description="Choose a plan with predictable billing, collaborative tooling, and automation baked in from day one."
          align="center"
          headingId="pricing-heading"
          tone="light"
        />
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center sm:flex-row sm:justify-center">
          <a href="/signup" className="btn-primary-yellow text-base sm:text-lg">
            Start free trial →
          </a>
          <a
            href="/contact"
            className="btn-outline border-white bg-transparent text-white hover:bg-white/10"
          >
            Talk to revenue engineering
          </a>
        </div>
      </div>
    </section>
  );
}
