'use client';

import { FormEvent, useState } from 'react';

/**
 * Newsletter signup panel
 * Reference: Design.md § "Newsletter Sign-up Panel"
 */
export default function NewsletterPanel() {
  const [status, setStatus] = useState<'idle' | 'success'>('idle');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = formData.get('email');

    if (typeof email === 'string' && email.trim().length > 3) {
      setStatus('success');
      event.currentTarget.reset();
    }
  };

  return (
    <section className="bg-cream py-16">
      <div className="container mx-auto px-4">
        <div className="grid items-center gap-8 md:grid-cols-2">
          {/* Left column */}
          <div>
            <h2 className="text-h2-sm md:text-h2-md mb-4 font-bold uppercase text-primary-blue">
              Stay Updated 📬
            </h2>
            <p className="text-body leading-relaxed text-primary-blue">
              Get weekly insights on ad monetization, new features, and industry trends.
              Join 5,000+ developers in our newsletter.
            </p>
          </div>

          {/* Right column */}
          <div>
            <form
              onSubmit={handleSubmit}
              aria-label="Newsletter subscription form"
              className="rounded-2xl bg-white/80 p-6 shadow-lg ring-1 ring-primary-blue/10 backdrop-blur"
            >
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex-1">
                  <label htmlFor="newsletter-email" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="newsletter-email"
                    name="email"
                    type="email"
                    placeholder="your.email@example.com"
                    className="w-full border-2 border-primary-blue px-4 py-3 transition-all focus:outline-none focus:border-sunshine-yellow focus:ring-4 focus:ring-sunshine-yellow/40"
                    required
                    aria-required="true"
                  />
                </div>
                <button
                  type="submit"
                  className="whitespace-nowrap rounded-full bg-sunshine-yellow px-8 py-3 font-bold uppercase text-primary-blue transition hover:bg-pale-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue"
                >
                  Subscribe
                </button>
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-primary-blue/60">
                No spam. Unsubscribe anytime. We respect your privacy.
              </p>
              {status === 'success' && (
                <p className="mt-3 text-sm font-bold text-success-green" role="status">
                  Thanks for subscribing! Please check your inbox to confirm.
                </p>
              )}
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
