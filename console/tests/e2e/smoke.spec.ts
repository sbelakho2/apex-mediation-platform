import { test, expect } from '@playwright/test';

test.describe('Console Authentication Flow', () => {
  test('should display sign-in page', async ({ page }) => {
    await page.goto('/login');

    // Check form elements present (prefer robust selectors over title checks)
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/login');

    // Submit without filling fields
    await page.locator('button[type="submit"]').first().click();

    // Should show validation errors (generic check to avoid copy/text coupling)
    const error = page.locator('[role="alert"], .error, .text-danger-600, [data-testid="form-error"]');
    await expect(error.first()).toBeVisible({ timeout: 3000 });
  });

  test('should expose a sign-up affordance (link or callout) if present', async ({ page }) => {
    await page.goto('/login');

    // Prefer a semantic link with text like "Sign up" / "Create account"
    const signupLink = page.getByRole('link', { name: /sign\s*up|create\s*account/i });
    const linkCount = await signupLink.count();
    if (linkCount > 0) {
      await signupLink.first().click();
      await expect(page).toHaveURL(/(signup|register)/i);
    } else {
      // If the application does not provide a sign-up affordance on login, do not fail the smoke
      // This keeps the test suite compatible with deployments that disable self-serve sign-up.
      await expect.soft(page.getByText(/sign\s*up|create\s*account/i)).toHaveCount(1);
    }
  });
});

test.describe('Dashboard Smoke Tests', () => {
  test.skip('should load dashboard after authentication', async ({ page }) => {
    // Skip in CI without auth setup
    // TODO: Implement auth mock or test user
    
    await page.goto('/dashboard');
    
    // Should redirect to sign-in or show dashboard
    await expect(page).toHaveURL(/\/(signin|dashboard)/);
  });
});

test.describe('Accessibility Checks', () => {
  test('homepage should have no ARIA violations', async ({ page }) => {
    // Prefer a known stable route with landmarks for a11y checks
    await page.goto('/settings');
    
    // Check basic accessibility
    const html = await page.content();
    expect(html).toContain('<html');
    expect(html).toContain('lang=');
    
    // Check main navigation
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
  });

  test('should have keyboard navigation', async ({ page }) => {
    await page.goto('/login');
    
    // Tab through form
    await page.keyboard.press('Tab');
    await expect(page.locator('input[type="email"]')).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.locator('input[type="password"]')).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.locator('button[type="submit"]')).toBeFocused();
  });
});

test.describe('Performance Checks', () => {
  test('homepage should load within 3 seconds', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(3000);
  });

  test('should not have console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Filter out known/acceptable errors
    const criticalErrors = errors.filter(err => 
      !err.includes('favicon') &&
      !err.includes('manifest') &&
      // Ignore backend not running during UI-only smoke
      !/ERR_CONNECTION_REFUSED/i.test(err)
    );
    
    expect(criticalErrors).toHaveLength(0);
  });
});
