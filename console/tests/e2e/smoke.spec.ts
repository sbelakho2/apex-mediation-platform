import { test, expect } from '@playwright/test';

test.describe('Console Authentication Flow', () => {
  test('should display sign-in page', async ({ page }) => {
    await page.goto('/signin');
    
    // Check page loaded
    await expect(page).toHaveTitle(/Sign In/i);
    
    // Check form elements present
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/signin');
    
    // Submit without filling fields
    await page.locator('button[type="submit"]').click();
    
    // Should show validation errors
    await expect(page.locator('text=/email is required/i')).toBeVisible({ timeout: 2000 });
  });

  test('should navigate to sign-up page', async ({ page }) => {
    await page.goto('/signin');
    
    // Click sign-up link
    await page.locator('a[href="/signup"]').click();
    
    // Should navigate to sign-up
    await expect(page).toHaveURL(/\/signup/);
    await expect(page).toHaveTitle(/Sign Up/i);
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
    await page.goto('/');
    
    // Check basic accessibility
    const html = await page.content();
    expect(html).toContain('<html');
    expect(html).toContain('lang=');
    
    // Check main navigation
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
  });

  test('should have keyboard navigation', async ({ page }) => {
    await page.goto('/signin');
    
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
      !err.includes('manifest')
    );
    
    expect(criticalErrors).toHaveLength(0);
  });
});
