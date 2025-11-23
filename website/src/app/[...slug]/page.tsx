import Link from 'next/link';
import { notFound } from 'next/navigation';

const RESERVED_SEGMENTS = new Set(['api']);

type PageProps = {
  params: {
    slug: string[];
  };
};

type Breadcrumb = {
  href: string;
  label: string;
};

export default function InformationalPage({ params }: PageProps) {
  if (!params.slug || params.slug.length === 0) {
    notFound();
  }

  const firstSegment = params.slug[0];
  if (RESERVED_SEGMENTS.has(firstSegment)) {
    notFound();
  }

  const slugSegments = params.slug.map((segment) => segment.toLowerCase());
  const slugKey = slugSegments.join('/');

  const breadcrumbs: Breadcrumb[] = params.slug.map((segment, index) => ({
    href: `/${params.slug.slice(0, index + 1).join('/')}`,
    label: segment.replace(/[-_]/g, ' '),
  }));

  const page = renderContent(slugKey, breadcrumbs);

  if (!page) {
    // For unknown slugs, return a 404 to avoid generic placeholder pages surfacing in prod
    notFound();
  }

  return page;
}

function PageLayout({
  title,
  intro,
  breadcrumbs,
  children,
  heroTag,
}: {
  title: string;
  intro: string;
  breadcrumbs: Breadcrumb[];
  children: React.ReactNode;
  heroTag?: string;
}) {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="container mx-auto max-w-6xl px-4 py-16 space-y-10">
        <nav className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">
          <Link
            href="/"
            className="hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500"
          >
            Home
          </Link>
          {breadcrumbs.map((crumb) => (
            <span key={crumb.href} className="ml-2">
              /{' '}
              <Link
                href={crumb.href}
                className="hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500"
              >
                {crumb.label}
              </Link>
            </span>
          ))}
        </nav>

        <header className="space-y-4">
          {heroTag && (
            <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold tracking-[0.1em] text-brand-700">
              {heroTag}
            </span>
          )}
          <h1 className="text-h2-sm md:text-h2-md lg:text-h2 font-semibold text-gray-900">
            {title}
          </h1>
          <p className="max-w-3xl text-body text-gray-600 leading-relaxed">
            {intro}
          </p>
        </header>

        {children}
      </div>
    </main>
  );
}

function renderContent(slugKey: string, breadcrumbs: Breadcrumb[]): React.ReactNode {
  switch (slugKey) {
    case 'documentation':
      return (
        <PageLayout
          title="Developer Documentation"
          intro="Integrate ApexMediation in record time, optimise your monetisation stack, and ship with confidence. Every guide below is production-ready and aligned to the design system you see throughout the product."
          heroTag="Docs"
          breadcrumbs={breadcrumbs}
        >
          <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
            <aside>
              <nav className="sticky top-24 space-y-3 rounded-3xl bg-gray-50 p-6 text-sm font-semibold tracking-wide text-gray-700">
                <span className="block text-gray-500">Contents</span>
                <a href="#getting-started" className="block hover:text-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">Getting started</a>
                <a href="#real-time-bidding" className="block hover:text-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">Real-time bidding</a>
                <a href="#ml-fraud-detection" className="block hover:text-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">ML fraud detection</a>
                <a href="#ab-testing-platform" className="block hover:text-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">A/B testing</a>
                <a href="#integration-checklist" className="block hover:text-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">Integration checklist</a>
                <a href="#sdk-reference" className="block hover:text-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]">SDK reference</a>
              </nav>
            </aside>
            <div className="space-y-8">
              <section id="getting-started" className="rounded-3xl bg-white p-8 shadow-xl ring-1 ring-gray-200">
                <h2 className="text-h3 font-semibold text-gray-900">1. Getting Started</h2>
                <p className="mt-4 text-body text-gray-700 leading-relaxed">
                  Create an account, add your first app, and invite collaborators. Once your app is connected you can enable premium demand with a single toggle.
                </p>
                <ol className="mt-6 space-y-3 text-body text-gray-700">
                  <li className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <span className="font-semibold text-gray-900">Step 1:</span> Go to <Link href="/signup" className="font-semibold underline">Sign Up</Link> and provision your workspace.
                  </li>
                  <li className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <span className="font-semibold text-gray-900">Step 2:</span> In the dashboard, open <Link href="/dashboard/apps" className="font-semibold underline">Apps</Link> and add each platform build (iOS, Android, Unity, Web).
                  </li>
                  <li className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <span className="font-semibold text-gray-900">Step 3:</span> Download the SDK bundle that matches your engine and integrate with the code sample below.
                  </li>
                </ol>
                <pre className="mt-6 overflow-x-auto rounded-2xl bg-gray-900 p-6 text-sm text-white">
{`import { ApexMediation } from '@apexmediation/sdk';

ApexMediation.configure({
  appId: 'YOUR_APP_ID',
  apiKey: 'YOUR_API_KEY',
  testMode: false,
});

ApexMediation.loadInterstitial({ placementId: 'level_complete' });`}
                </pre>
              </section>

              <section id="real-time-bidding" className="rounded-3xl bg-white p-8 shadow-xl ring-1 ring-gray-200">
                <h2 className="text-h3 font-semibold text-gray-900">2. Real-Time Bidding</h2>
                <p className="mt-4 text-body text-gray-700 leading-relaxed">
                  Every impression is auctioned across premium demand partners with transparent clearing pricing. Enable header bidding, waterfall mediation, or a hybrid approach from the control center.
                </p>
                <ul className="mt-4 space-y-3 text-body text-gray-700">
                  <li className="flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 rounded-full bg-brand-500" aria-hidden="true" />
                    Real-time logs show bidder response time, CPM, and win rate.
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 rounded-full bg-brand-500" aria-hidden="true" />
                    Configure floors per country, device, or user cohort.
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 rounded-full bg-brand-500" aria-hidden="true" />
                    Export raw auction trails to BigQuery or S3 on an hourly cadence.
                  </li>
                </ul>
                <div className="mt-6 rounded-2xl bg-gray-50 p-6 text-sm text-gray-900">
                  <p className="font-semibold">API Endpoint</p>
                  <pre className="mt-2 overflow-x-auto text-xs text-gray-800">
{`POST https://api.apexmediation.com/v1/auctions
Body: {
  "placement_id": "level_complete",
  "bid_floor": 1.75,
  "user_id": "abc123",
  "geo": "SE"
}`}
                  </pre>
                </div>
              </section>

              <section id="ml-fraud-detection" className="rounded-3xl bg-white p-8 shadow-xl ring-1 ring-gray-200">
                <h2 className="text-h3 font-semibold text-gray-900">3. ML Fraud Detection</h2>
                <p className="mt-4 text-body text-gray-700 leading-relaxed">
                  Our anomaly detection models are trained on 500k+ installs and refreshed nightly. Suspicious signals trigger automated quarantines and optional manual review flows.
                </p>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <h3 className="text-sm font-semibold text-gray-900">Signals</h3>
                    <ul className="mt-3 space-y-2 text-sm text-gray-700">
                      <li>Device fingerprint velocity</li>
                      <li>Bid shading anomalies</li>
                      <li>Geo spoofing heuristics</li>
                      <li>Click-to-install delta</li>
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <h3 className="text-sm font-semibold text-gray-900">Actions</h3>
                    <ul className="mt-3 space-y-2 text-sm text-gray-700">
                      <li>Auto-reject suspicious bids</li>
                      <li>Throttle inventory per network</li>
                      <li>Notify assigned analyst via Slack</li>
                      <li>Send evidence packet to partner</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section id="ab-testing-platform" className="rounded-3xl bg-white p-8 shadow-xl ring-1 ring-gray-200">
                <h2 className="text-h3 font-semibold text-gray-900">4. A/B Testing Platform</h2>
                <p className="mt-4 text-body text-gray-700 leading-relaxed">
                  Launch Bayesian experiments with Thompson Sampling and get directional insights within hours. Experiments can target creative, placement layout, or mediation partner mix.
                </p>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl bg-brand-600 p-6 text-white">
                    <h3 className="text-sm font-bold uppercase">Primary metrics</h3>
                    <ul className="mt-3 space-y-2 text-sm">
                      <li>Revenue per daily active user</li>
                      <li>Ad impressions per user session</li>
                      <li>Interstitial opt-out rate</li>
                      <li>Average session length</li>
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-6">
                    <h3 className="text-sm font-semibold text-gray-900">Rollout guardrails</h3>
                    <p className="mt-3 text-sm text-gray-700">
                      Set minimum win probability thresholds, cap daily risk at the inventory level, and auto-promote winners when results clear 95% significance.
                    </p>
                  </div>
                </div>
              </section>

              <section id="integration-checklist" className="rounded-3xl bg-white p-8 shadow-xl ring-1 ring-gray-200">
                <h2 className="text-h3 font-semibold text-gray-900">5. Integration Checklist</h2>
                <ul className="mt-4 space-y-3 text-body text-gray-700">
                  <li>✅ Add the SDK to your project and confirm no build errors.</li>
                  <li>✅ Verify GDPR/CCPA consent flow for European and Californian users.</li>
                  <li>✅ Test rewarded and interstitial placements using device test mode.</li>
                  <li>✅ Enable analytics streaming to your data warehouse of choice.</li>
                  <li>✅ View payout schedule and invoices (NET 30 payment terms) in <Link href="/dashboard/settings?tab=payment" className="font-bold underline">Settings → Payment Methods</Link>.</li>
                </ul>
              </section>

              <section id="sdk-reference" className="rounded-3xl bg-white p-8 shadow-xl ring-1 ring-gray-200">
                <h2 className="text-h3 font-semibold text-gray-900">6. SDK Reference</h2>
                <table className="mt-4 w-full table-auto text-left text-sm text-gray-700">
                  <thead>
                    <tr className="text-gray-900">
                      <th className="border-b-2 border-gray-200 py-3">Method</th>
                      <th className="border-b-2 border-gray-200 py-3">Description</th>
                      <th className="border-b-2 border-gray-200 py-3">Usage</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="odd:bg-gray-50">
                      <td className="py-3 font-bold">configure()</td>
                      <td>Bootstraps the SDK with your credentials.</td>
                      <td><code className="text-xs">ApexMediation.configure({`{ appId, apiKey }`})</code></td>
                    </tr>
                    <tr className="odd:bg-gray-50">
                      <td className="py-3 font-bold">loadInterstitial()</td>
                      <td>Preloads an interstitial ad for a placement.</td>
                      <td><code className="text-xs">ApexMediation.loadInterstitial({`{ placementId }`})</code></td>
                    </tr>
                    <tr className="odd:bg-cream/40">
                      <td className="py-3 font-bold">showRewarded()</td>
                      <td>Displays a rewarded video and resolves with reward payload.</td>
                      <td><code className="text-xs">await ApexMediation.showRewarded({`{ placementId }`})</code></td>
                    </tr>
                  </tbody>
                </table>
              </section>
            </div>
          </div>
        </PageLayout>
      );

    case 'pricing':
      return (
        <PageLayout
          title="Pricing"
          intro="Straightforward plans that scale with you. Start for free, unlock premium demand when you are ready, and never worry about hidden fees or surprise overages."
          heroTag="Pricing"
          breadcrumbs={breadcrumbs}
        >
          <div className="grid gap-6 lg:grid-cols-3">
            {[
              {
                name: 'Foundation',
                price: 'Free',
                description: 'Perfect for indie developers and MVPs launching their first ad stack.',
                bullets: ['Up to 50k monthly active users', 'Email support within 1 business day', 'Unlimited placements & networks', 'Real-time analytics dashboards'],
              },
              {
                name: 'Growth',
                price: '$499/mo + 5% revenue share',
                description: 'Upgrade to premium demand partners, automation, and hands-on consulting.',
                highlight: 'Most Popular',
                bullets: ['Dedicated success manager', 'Bid landscape exports & API access', 'ML fraud detection with automation', 'Weekly strategy reviews'],
              },
              {
                name: 'Enterprise',
                price: 'Custom',
                description: 'Designed for studios with millions of DAU, regulated workflows, and advanced requirements.',
                bullets: ['Custom rev share', 'On-site enablement', 'Private bidder marketplace', '99.99% uptime SLA & 24/7 support'],
              },
            ].map((plan) => (
              <section
                key={plan.name}
                className={`rounded-3xl border bg-white p-8 text-gray-900 shadow-xl ring-1 ring-gray-200 transition hover:-translate-y-1 hover:shadow-2xl ${
                  plan.highlight ? 'ring-2 ring-brand-200' : ''
                }`}
              >
                {plan.highlight && (
                  <span className="mb-4 inline-flex items-center rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold tracking-wide text-brand-700">
                    {plan.highlight}
                  </span>
                )}
                <h2 className="text-h3 font-bold uppercase">{plan.name}</h2>
                <p className="mt-3 text-3xl font-extrabold">{plan.price}</p>
                <p className="mt-4 text-sm text-gray-600 leading-relaxed">{plan.description}</p>
                <ul className="mt-6 space-y-3 text-sm text-gray-700">
                  {plan.bullets.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="mt-1 h-2 w-2 rounded-full bg-brand-500" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
                <a
                  href="/signup"
                  className="mt-8 inline-flex w-full justify-center btn-primary"
                >
                  Choose Plan →
                </a>
              </section>
            ))}
          </div>
          <section className="mt-12 rounded-3xl bg-white/10 p-8 text-sm leading-relaxed text-white/80">
            <h2 className="text-sm font-bold uppercase text-brand-100">Billing Basics</h2>
            <p className="mt-3">
              Revenue share is collected monthly from payouts. Premium plan fees are invoiced at the start of each billing cycle. We support wire transfer, card, and invoice financing.
            </p>
            <p className="mt-3">
              Need procurement paperwork? Email <a href="mailto:billing@apexmediation.com" className="underline">billing@apexmediation.com</a> for vendor forms, SOC 2 Type II reports, and security questionnaires.
            </p>
          </section>
        </PageLayout>
      );

    case 'support':
      return (
        <PageLayout
          title="Support Center"
          intro="We are here around the clock. Explore quick answers below or open a ticket and we will respond within the published SLA."
          heroTag="Support"
          breadcrumbs={breadcrumbs}
        >
          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-3xl bg-white p-8 text-gray-900 shadow-xl ring-1 ring-gray-200" id="account-access">
              <h2 className="text-h3 font-bold uppercase">Account & Access</h2>
              <ul className="mt-4 space-y-3 text-sm text-gray-700">
                <li>Reset your password via <Link href="/signin?redirect=%2Fdashboard" className="font-bold underline">Sign In</Link> → “Forgot password”.</li>
                <li>Invite teammates from <Link href="/dashboard/settings?tab=security" className="font-bold underline">Settings → Security</Link>.</li>
                <li>Contact us at <a href="mailto:support@apexmediation.com" className="underline">support@apexmediation.com</a> for account merges.</li>
              </ul>
            </section>
            <section className="rounded-3xl bg-white p-8 text-gray-900 shadow-xl ring-1 ring-gray-200">
              <h2 className="text-h3 font-bold uppercase">Monetisation Help</h2>
              <p className="mt-4 text-sm text-gray-700">
                Troubleshoot low fill, enable new demand sources, or schedule a mediation audit. Include app ID, platform, and SDK version for the fastest response.
              </p>
              <a
                href="mailto:support@apexmediation.com?subject=Monetisation%20support"
                className="mt-6 inline-flex items-center gap-2 btn-primary text-sm"
              >
                Email Monetisation Team →
              </a>
            </section>
            <section className="rounded-3xl bg-white p-8 text-gray-900 shadow-xl ring-1 ring-gray-200">
              <h2 className="text-h3 font-bold uppercase">Billing & Payouts</h2>
              <p className="mt-4 text-sm text-gray-700">
                Monthly payouts with NET 30 terms - invoiced on the 1st of each month, payment processed 30 days later. Bank transfers can take 2-5 business days. View invoices and remittance files in <Link href="/dashboard/settings?tab=payment" className="font-bold underline">Settings → Payment Methods</Link>.
              </p>
              <p className="mt-4 text-sm text-gray-700">To update banking info, submit a signed W-9/W-8BEN to <a href="mailto:billing@apexmediation.com" className="underline">billing@apexmediation.com</a>.</p>
            </section>
            <section className="rounded-3xl bg-white p-8 text-gray-900 shadow-xl ring-1 ring-gray-200">
              <h2 className="text-h3 font-bold uppercase">Live chat & SLA</h2>
              <p className="mt-4 text-sm text-gray-700">
                Chat is available 09:00–23:00 CET, Monday to Saturday. Enterprise customers receive a dedicated Slack channel with 15-minute first-response guarantees.
              </p>
              <p className="mt-4 text-sm text-gray-700">
                Incident hotline (24/7): <a href="tel:+46101234567" className="underline">+46 10 123 45 67</a>
              </p>
            </section>
          </div>
          <section className="mt-10 rounded-3xl bg-white/10 p-8 text-sm text-white/80">
            <h2 className="text-sm font-bold uppercase text-brand-100">Status Dashboard</h2>
            <p className="mt-3">
              Subscribe to incident updates at <a href="https://status.apexmediation.com" className="underline">status.apexmediation.com</a>. We publish RCA documents within 48 hours of every incident.
            </p>
          </section>
        </PageLayout>
      );

    case 'about':
      return (
        <PageLayout
          title="About ApexMediation"
          intro="ApexMediation is built by a distributed team obsessed with transparency, fairness, and delightful developer experiences."
          heroTag="Company"
          breadcrumbs={breadcrumbs}
        >
          <section className="space-y-8">
            <div className="rounded-3xl bg-white p-8 text-gray-900 shadow-xl ring-1 ring-gray-200">
              <h2 className="text-h3 font-bold uppercase">Our Mission</h2>
              <p className="mt-4 text-body text-gray-700 leading-relaxed">
                We help game studios and app developers regain control over their monetisation stack. No black boxes, no slow payouts, no invasive SDKs—just clean APIs, clear reporting, and a partner you can trust.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {[
                { label: 'Founded', value: '2021, Tallinn' },
                { label: 'Team', value: '38 people across EU & US' },
                { label: 'Payouts processed', value: '$48M in 2024' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-3xl bg-white p-6 text-gray-900 shadow ring-1 ring-gray-200">
                  <p className="text-xs font-bold uppercase text-brand-700">{stat.label}</p>
                  <p className="mt-2 text-2xl font-extrabold">{stat.value}</p>
                </div>
              ))}
            </div>
          </section>
        </PageLayout>
      );

    case 'team':
      return (
        <PageLayout
          title="Meet the Team"
          intro="A cross-functional crew of ad tech veterans, ML engineers, designers, and former studio operators."
          heroTag="Team"
          breadcrumbs={breadcrumbs}
        >
          <section className="grid gap-6 md:grid-cols-2">
            {[
              { name: 'Sara Blom', role: 'CEO & Co-founder', bio: 'Previously led monetisation strategy at King. Advocates for fair revenue share models.' },
              { name: 'Jonas Lind', role: 'CTO & Co-founder', bio: 'Built programmatic infrastructure at Spotify. Loves Typescript, Go, and fika.' },
              { name: 'Amelia Ortiz', role: 'VP of Product', bio: 'Former Unity Product Manager. Champion of developer-first tooling.' },
              { name: 'Priya Nair', role: 'Head of Machine Learning', bio: 'Scaled fraud detection at Adyen. Focused on explainable AI.' },
            ].map((person) => (
              <article key={person.name} className="rounded-3xl bg-white p-6 text-gray-900 shadow-xl ring-1 ring-gray-200">
                <h2 className="text-h3 font-bold uppercase">{person.name}</h2>
                <p className="mt-2 text-sm font-semibold text-gray-700">{person.role}</p>
                <p className="mt-4 text-sm text-gray-700 leading-relaxed">{person.bio}</p>
              </article>
            ))}
          </section>
        </PageLayout>
      );

    case 'careers':
      return (
        <PageLayout
          title="Careers"
          intro="Join a remote-friendly team that ships fast, cares deeply about craft, and keeps work-life balance healthy."
          heroTag="Hiring"
          breadcrumbs={breadcrumbs}
        >
          <section className="space-y-6">
            {[
              {
                title: 'Senior Frontend Engineer',
                location: 'Tallinn or Remote (EU)',
                description: 'Build delightful dashboards and workflows in Next.js, Tailwind, and TypeScript.',
              },
              {
                title: 'Data Scientist, Monetisation',
                location: 'Remote (EU)',
                description: 'Model auction behaviour, design experiments, and ship production models.',
              },
              {
                title: 'Customer Success Manager',
                location: 'New York City, Hybrid',
                description: 'Partner with top-grossing studios to improve retention and ongoing insights.',
              },
            ].map((role) => (
              <article key={role.title} className="rounded-3xl border border-gray-200 bg-white p-6 text-gray-900 shadow">
                <h2 className="text-h3 font-bold uppercase">{role.title}</h2>
                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-brand-700">{role.location}</p>
                <p className="mt-4 text-sm text-gray-700">{role.description}</p>
                <a
                  href="mailto:careers@apexmediation.com"
                  className="mt-6 inline-flex items-center gap-2 btn-primary text-sm"
                >
                  Apply via Email →
                </a>
              </article>
            ))}
          </section>
        </PageLayout>
      );

    case 'press':
      return (
        <PageLayout
          title="Press"
          intro="Download media assets, read recent headlines, and contact our communications team."
          heroTag="Media"
          breadcrumbs={breadcrumbs}
        >
          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-3xl bg-white p-6 text-gray-900 shadow-xl ring-1 ring-gray-200">
              <h2 className="text-h3 font-bold uppercase">Media Resources</h2>
              <ul className="mt-4 space-y-3 text-sm text-gray-700">
                <li><a href="/press/apexmediation-media-kit.zip" className="underline">Media kit (logos, product shots)</a></li>
                <li><a href="/press/fact-sheet.pdf" className="underline">Fact sheet</a></li>
                <li><a href="mailto:press@apexmediation.com" className="underline">press@apexmediation.com</a></li>
              </ul>
            </section>
            <section className="rounded-3xl bg-white p-6 text-gray-900 shadow-xl ring-1 ring-gray-200">
              <h2 className="text-h3 font-bold uppercase">Latest Headlines</h2>
              <ul className="mt-4 space-y-3 text-sm text-gray-700">
                <li>ApexMediation launches ML-driven fraud firewall across 5M daily impressions.</li>
                <li>Studios adopt ApexMediation Growth plan for unified forecasting.</li>
                <li>ApexMediation secures SOC 2 Type II attestation for enterprise customers.</li>
              </ul>
            </section>
          </div>
        </PageLayout>
      );

    case 'guides':
      return (
        <PageLayout
          title="Guides"
          intro="Deep dives on monetisation strategy, creative optimisation, and analytics best practices."
          heroTag="Guides"
          breadcrumbs={breadcrumbs}
        >
          <div className="space-y-6">
            {[
              {
                title: 'Launch Checklist for New Studios',
                summary: 'Everything you need to configure mediation, verify payouts, and test placements before launch day.',
                href: '/documentation#integration-checklist',
              },
              {
                title: 'How to Read Bid Landscape Reports',
                summary: 'Interpret auction diagnostics, identify underperforming partners, and tune floors by cohort.',
                href: '/dashboard/analytics',
              },
              {
                title: 'Designing Rewarded Video that Users Love',
                summary: 'Use behavioural cues and optionality to keep opt-in rates above 85% without sacrificing retention.',
                href: '/blog/monetization-trends-2025',
              },
            ].map((guide) => (
              <article key={guide.title} className="rounded-3xl bg-white p-6 text-gray-900 shadow-xl ring-1 ring-gray-200">
                <h2 className="text-h3 font-bold uppercase">{guide.title}</h2>
                <p className="mt-3 text-sm text-gray-700">{guide.summary}</p>
                <a href={guide.href} className="mt-4 inline-flex items-center gap-2 text-sm font-bold uppercase text-brand-700 underline">
                  Continue reading →
                </a>
              </article>
            ))}
          </div>
        </PageLayout>
      );

    case 'case-studies':
      return (
        <PageLayout
          title="Case Studies"
          intro="Studios across genres rely on ApexMediation for stable revenue growth and delightful player experiences."
          heroTag="Success Stories"
          breadcrumbs={breadcrumbs}
        >
          <div className="grid gap-6 md:grid-cols-2">
            {[
              {
                title: 'Northvolt Games',
                stat: 'Full rollout in 60 days',
                summary: 'Swapped legacy waterfall mediation for ApexMediation Growth. Weekly lab sessions reduced setup friction and surfaced creative fatigue sooner.',
              },
              {
                title: 'Aurora Interactive',
                stat: 'Reduced fraud by 96%',
                summary: 'Implemented automated quarantines and network-level throttling. Saved $120k per month in invalid spend.',
              },
            ].map((study) => (
              <article key={study.title} className="rounded-3xl bg-white p-6 text-gray-900 shadow-xl ring-1 ring-gray-200">
                <p className="text-xs font-bold uppercase text-brand-700">{study.stat}</p>
                <h2 className="mt-2 text-h3 font-bold uppercase">{study.title}</h2>
                <p className="mt-4 text-sm text-gray-700">{study.summary}</p>
              </article>
            ))}
          </div>
        </PageLayout>
      );

    case 'changelog':
      return (
        <PageLayout
          title="Changelog"
          intro="We deploy improvements weekly. Track every feature, fix, and maintenance update here."
          heroTag="Product Updates"
          breadcrumbs={breadcrumbs}
        >
          <ul className="space-y-6">
            {[
              {
                date: '2025-10-24',
                title: 'Dashboard refresh + palette update',
                items: ['Updated navigation focus states', 'Mobile sidebar with animated overlay', 'Revamped Settings page with URL-synced tabs'],
              },
              {
                date: '2025-09-30',
                title: 'Fraud firewall GA',
                items: ['Auto-quarantine for click flooding', 'New anomaly alerts via Slack', 'CSV export for appeals'],
              },
              {
                date: '2025-09-05',
                title: 'NET 30 payment terms + in-app billing view',
                items: ['Upload tax forms directly in Settings', 'Real-time payout timeline widget', 'Webhook for payout status changes'],
              },
            ].map((entry) => (
              <li key={entry.date} className="rounded-3xl bg-white p-6 text-gray-900 shadow-xl ring-1 ring-gray-200">
                <p className="text-xs font-bold uppercase text-brand-700">{entry.date}</p>
                <h2 className="mt-2 text-h3 font-bold uppercase">{entry.title}</h2>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700">
                  {entry.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </PageLayout>
      );

    case 'blog':
      return (
        <PageLayout
          title="Blog"
          intro="Insights for monetisation leads, product managers, and growth teams."
          heroTag="Stories"
          breadcrumbs={breadcrumbs}
        >
          <div className="space-y-6">
            {[
              {
                title: 'Monetisation Trends 2025',
                excerpt: 'What we are seeing across 120+ studios—privacy-first measurement, new pricing models, and creative best practices.',
                href: '/blog/monetization-trends-2025',
              },
              {
                title: 'Designing Ethical Rewarded Video',
                excerpt: 'Reward structure experiments that preserve retention while boosting opt-in 14%.',
                href: '/guides',
              },
            ].map((post) => (
              <article key={post.title} className="rounded-3xl bg-white p-6 text-gray-900 shadow-xl ring-1 ring-gray-200">
                <h2 className="text-h3 font-bold uppercase">{post.title}</h2>
                <p className="mt-3 text-sm text-gray-700">{post.excerpt}</p>
                <a href={post.href} className="mt-4 inline-flex items-center gap-2 text-sm font-bold uppercase text-brand-700 underline">
                  Continue reading →
                </a>
              </article>
            ))}
          </div>
        </PageLayout>
      );

    case 'blog/monetization-trends-2025':
      return (
        <PageLayout
          title="Monetisation Trends 2025"
          intro="Privacy-first measurement, dynamic pricing, and rewarded design tactics we are tracking this year."
          heroTag="Blog"
          breadcrumbs={breadcrumbs}
        >
          <article className="prose prose-lg max-w-none rounded-3xl bg-white p-10 text-gray-900 shadow-xl ring-1 ring-gray-200">
            <h2>Key themes</h2>
            <ul>
              <li>Hybrid monetisation models pair IAP bundles with rewarded funnels.</li>
              <li>Studios allocate 20% more time to creative iteration each sprint.</li>
              <li>First-party data clean rooms unlock precise attribution without privacy debt.</li>
            </ul>
            <h2>What to do now</h2>
            <p>
              Audit the balance between compulsory ads and opt-in experiences. Rewarded video remains the most loved format when you respect session cadence and offer meaningful rewards.
            </p>
            <p>
              Need a partner?{' '}
              <Link href="/support" className="font-bold underline">
                Talk to our monetisation strategists
              </Link>
              .
            </p>
          </article>
        </PageLayout>
      );

    case 'privacy':
      return (
        <PageLayout
          title="Privacy Policy"
          intro="We comply with GDPR, CCPA, and COPPA requirements. Transparency is non-negotiable."
          heroTag="Legal"
          breadcrumbs={breadcrumbs}
        >
          <section className="rounded-3xl bg-white p-8 text-gray-900 shadow-xl ring-1 ring-gray-200">
            <h2 className="text-h3 font-bold uppercase">Highlights</h2>
            <ul className="mt-4 list-disc space-y-3 pl-6 text-sm text-gray-700">
              <li>We only collect data necessary to fulfil ad requests and process payouts.</li>
              <li>Publishers can request deletion of user data within 30 days via <a href="mailto:privacy@apexmediation.com" className="underline">privacy@apexmediation.com</a>.</li>
              <li>Data is stored in EU-West (Frankfurt) and backed up in Dublin.</li>
            </ul>
          </section>
        </PageLayout>
      );

    case 'terms':
      return (
        <PageLayout
          title="Terms of Service"
          intro="These terms govern your access to ApexMediation. By creating an account you agree to the obligations below."
          heroTag="Legal"
          breadcrumbs={breadcrumbs}
        >
          <section className="rounded-3xl bg-white p-8 text-gray-900 shadow-xl ring-1 ring-gray-200">
            <ol className="space-y-4 text-sm text-gray-700">
              <li><span className="font-bold text-gray-900">1. Accounts.</span> You are responsible for credential security and ensuring authorised access only.</li>
              <li><span className="font-bold text-gray-900">2. Payments.</span> Revenue share fees are deducted from payouts; invoices due within 30 days.</li>
              <li><span className="font-bold text-gray-900">3. Acceptable Use.</span> No prohibited content, bot traffic, or tampering with auctions.</li>
              <li><span className="font-bold text-gray-900">4. Liability.</span> Platform provided “as is”; liability capped at fees paid in the last 12 months.</li>
            </ol>
          </section>
        </PageLayout>
      );

    case 'gdpr':
      return (
        <PageLayout
          title="GDPR"
          intro="ApexMediation acts as a processor for publisher data. We offer DPAs, SCCs, and fully auditable consent tools."
          heroTag="Compliance"
          breadcrumbs={breadcrumbs}
        >
          <section className="rounded-3xl bg-white p-8 text-gray-900 shadow-xl ring-1 ring-gray-200">
            <p className="text-sm text-gray-700">
              Sign a Data Processing Agreement inside <Link href="/dashboard/settings?tab=security" className="font-bold underline">Settings → Security</Link>. Consent strings follow the IAB TCF framework and are stored for 13 months.
            </p>
          </section>
        </PageLayout>
      );

    case 'security':
      return (
        <PageLayout
          title="Security"
          intro="SOC 2 Type II, ISO 27001-aligned controls, and a security team that responds within hours."
          heroTag="Trust"
          breadcrumbs={breadcrumbs}
        >
          <div className="space-y-6">
            <section className="rounded-3xl bg-white p-6 text-gray-900 shadow-xl ring-1 ring-gray-200">
              <h2 className="text-h3 font-bold uppercase">Controls</h2>
              <ul className="mt-4 list-disc space-y-2 pl-6 text-sm text-gray-700">
                <li>Encryption at rest (AES-256) and in transit (TLS 1.3).</li>
                <li>Quarterly penetration tests by Cure53.</li>
                <li>Background checks for production-access staff.</li>
              </ul>
            </section>
            <section className="rounded-3xl bg-white p-6 text-gray-900 shadow-xl ring-1 ring-gray-200">
              <h2 className="text-h3 font-bold uppercase">Report an Issue</h2>
              <p className="mt-3 text-sm text-gray-700">
                Email <a href="mailto:security@apexmediation.com" className="underline">security@apexmediation.com</a> for vulnerabilities. We operate a responsible disclosure program with cash rewards.
              </p>
            </section>
          </div>
        </PageLayout>
      );

    case 'cookies':
      return (
        <PageLayout
          title="Cookie Policy"
          intro="We use cookies solely to remember your consent choices and keep you signed in."
          heroTag="Legal"
          breadcrumbs={breadcrumbs}
        >
          <section className="rounded-3xl bg-white p-8 text-gray-900 shadow-xl ring-1 ring-gray-200">
            <h2 className="text-h3 font-bold uppercase">Operational cookies</h2>
            <p className="mt-3 text-sm text-gray-700">
              Essential cookies store authentication tokens and localisation preferences. Analytics cookies are opt-in and anonymised. Update settings anytime via the cookie banner.
            </p>
          </section>
        </PageLayout>
      );

    default:
      return null;
  }
}

function renderFallback(breadcrumbs: Breadcrumb[]) {
  const title = breadcrumbs[breadcrumbs.length - 1]?.label ?? 'Information';
  return (
    <PageLayout
      title={title}
      intro="We are continuously expanding our knowledge base. Let us know what you would like to see here."
      heroTag="Coming Soon"
      breadcrumbs={breadcrumbs}
    >
      <section className="rounded-3xl bg-white p-8 text-gray-900 shadow-xl ring-1 ring-gray-200">
        <p className="text-body text-gray-700 leading-relaxed">
          In the meantime you can browse our <Link href="/documentation" className="font-bold underline">documentation</Link>, read the latest <Link href="/blog" className="font-bold underline">blog posts</Link>, or reach out via <Link href="/support" className="font-bold underline">support</Link>.
        </p>
      </section>
    </PageLayout>
  );
}
