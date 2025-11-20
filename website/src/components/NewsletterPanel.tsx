'use client';

import { FormEvent, useEffect, useState } from 'react';

/**
 * Newsletter signup panel
 * Reference: Design.md § "Newsletter Sign-up Panel"
 */
export default function NewsletterPanel() {
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'submitting'>('idle');

  useEffect(() => {
    // Persist success until dismissed (simple heuristic)
    if (typeof window === 'undefined') return;
    const done = window.localStorage.getItem('newsletter.subscribed')
    if (done === 'true') setStatus('success')
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = formData.get('email');
    const hp = formData.get('hp'); // honeypot

    if (typeof hp === 'string' && hp.trim().length > 0) {
      // Bot: pretend success
      setStatus('success');
      try { localStorage.setItem('newsletter.subscribed', 'true'); } catch {}
      event.currentTarget.reset();
      return;
    }

    if (typeof email !== 'string' || email.trim().length < 5) return;

    try {
      setStatus('submitting');
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        setStatus('success');
        try { localStorage.setItem('newsletter.subscribed', 'true'); } catch {}
        event.currentTarget.reset();
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <section className="bg-gray-50 py-16">
      <div className="container">
        <div className="grid items-center gap-8 md:grid-cols-2">
          {/* Left column */}
          <div>
            <h2 className="text-h2-sm md:text-h2-md mb-4 font-semibold text-gray-900">
              Stay Updated 📬
            </h2>
            <p className="text-body leading-relaxed text-gray-700">
              Get monthly insights on ad monetization, new features, and industry trends.
              Join 5,000+ developers in our newsletter.
            </p>
          </div>

          {/* Right column */}
          <div>
            <div className="card-v2">
              <form
                onSubmit={handleSubmit}
                aria-label="Newsletter subscription form"
                className="card-v2-body"
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
                      className="input-v2 w-full"
                      required
                      aria-required="true"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={status === 'submitting'}
                    className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {status === 'submitting' ? 'Subscribing…' : 'Subscribe'}
                  </button>
                </div>
                {/* Honeypot */}
                <input type="text" name="hp" aria-hidden="true" tabIndex={-1} className="hidden" />
                <p id="newsletter-help" className="mt-3 text-xs text-gray-600">
                  No spam. Unsubscribe anytime. We respect your privacy.
                </p>
                {status === 'success' && (
                  <p className="mt-3 text-sm font-semibold text-success" role="status">
                    Thanks for subscribing! Please check your inbox to confirm.
                  </p>
                )}
                {status === 'error' && (
                  <p className="mt-3 text-sm font-semibold text-danger" role="status">
                    Sorry, something went wrong. Please try again later.
                  </p>
                )}
              </form>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
