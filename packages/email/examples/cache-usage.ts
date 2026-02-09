/**
 * Global Cache Usage Examples
 *
 * Demonstrates how to use the global cache system for email adapters
 *
 * Note: Cache management functions are only available in development
 * and should not be used in production code.
 */

import { sendEmail } from "@raypx/email";

// Cache management is only available in development
// Usage: import { cacheLog } from "@raypx/email/dev";
import { cacheClear, cacheDelete, cacheLog, cachePreload, cacheStats } from "@raypx/email/dev";

// ============================================
// Example 1: Automatic Caching
// ============================================

async function demonstrateAutomaticCaching() {
  console.log("=== Automatic Caching Demo ===\n");

  // First email send - loads and caches the module
  console.log("Sending first email...");
  await sendEmail({
    to: "user1@example.com",
    from: "noreply@example.com",
    subject: "First Email",
    template: "<div>This will trigger module loading</div>",
    provider: "resend",
  });

  // Second email send - uses cached module (much faster!)
  console.log("\nSending second email...");
  await sendEmail({
    to: "user2@example.com",
    from: "noreply@example.com",
    subject: "Second Email",
    template: "<div>This uses cached module</div>",
    provider: "resend",
  });

  // Check cache statistics
  const stats = cacheStats();
  console.log("\nCache Statistics:", {
    size: stats.size,
    keys: stats.keys,
    hits: stats.hits,
    misses: stats.misses,
  });
}

// ============================================
// Example 2: Preloading for Production
// ============================================

async function preloadAdapters() {
  console.log("=== Preloading Adapters ===\n");

  // Preload commonly used adapters during application startup
  // This improves first email send performance
  await cachePreload(["resend", "nodemailer", "sendgrid", "aws-ses"]);

  console.log("\nAfter preloading:");
  cacheLog();
}

// ============================================
// Example 3: Cache Management
// ============================================

async function cacheManagement() {
  console.log("=== Cache Management Demo ===\n");

  // Send some emails to populate cache
  await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Test",
    template: "<div>Test email</div>",
    provider: "resend",
  });

  console.log("\nCurrent cache state:");
  cacheLog();

  // Clear specific cache entry
  console.log("\nClearing Resend module cache...");
  cacheDelete("module:resend");

  console.log("\nAfter deletion:");
  cacheLog();

  // Clear all cache
  console.log("\nClearing all cache...");
  cacheClear();
  cacheLog();
}

// ============================================
// Example 4: Development vs Production
// ============================================

async function devVsProduction() {
  console.log("=== Development vs Production ===\n");

  // In development (NODE_ENV != 'production')
  // Cache logs are verbose for debugging
  console.log("Development mode - verbose logging:");
  await sendEmail({
    to: "dev@example.com",
    from: "noreply@example.com",
    subject: "Dev Email",
    template: "<div>Dev mode email</div>",
    provider: "resend",
  });

  // In production (NODE_ENV == 'production')
  // Cache is silent, better performance
  process.env.NODE_ENV = "production";
  console.log("\nProduction mode - silent caching:");
  await sendEmail({
    to: "prod@example.com",
    from: "noreply@example.com",
    subject: "Prod Email",
    template: "<div>Prod mode email</div>",
    provider: "resend",
  });

  // Reset
  delete process.env.NODE_ENV;
}

// ============================================
// Example 5: Performance Comparison
// ============================================

async function performanceComparison() {
  console.log("=== Performance Comparison ===\n");

  // Clear cache for fair comparison
  cacheClear();

  // First run (cache miss) - slower
  console.time("First email (cache miss)");
  await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "First",
    template: "<div>First email</div>",
    provider: "resend",
  });
  console.timeEnd("First email (cache miss)");

  // Second run (cache hit) - faster
  console.time("\nSecond email (cache hit)");
  await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Second",
    template: "<div>Second email</div>",
    provider: "resend",
  });
  console.timeEnd("Second email (cache hit)");

  console.log("\nCache statistics:");
  cacheLog();
}

// ============================================
// Example 6: Application Startup
// ============================================

async function applicationStartup() {
  console.log("=== Application Startup ===\n");

  // Preload adapters during application initialization
  console.log("Preloading email adapters...");
  await cachePreload(["resend", "nodemailer"]);

  console.log("\nApplication ready! Adapters are cached and ready to use.");

  // Now when requests come in, emails are sent instantly
  // because modules are already loaded
  await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Welcome",
    template: "<div>Welcome!</div>",
    provider: "resend",
  });

  console.log("\nFinal cache state:");
  cacheLog();
}

// ============================================
// Example 7: Cache Warmup Strategy
// ============================================

async function cacheWarmupStrategy() {
  console.log("=== Cache Warmup Strategy ===\n");

  // Strategy 1: Preload all adapters
  console.log("Strategy 1: Preload all adapters");
  await cachePreload(["resend", "nodemailer", "sendgrid", "aws-ses"]);

  // Strategy 2: Lazy load on first use (default)
  console.log("\nStrategy 2: Lazy load (default behavior)");
  // Cache will be populated when first email is sent

  // Strategy 3: Hybrid - preload critical, lazy load others
  console.log("\nStrategy 3: Hybrid approach");
  await cachePreload(["resend"]); // Preload most used
  // Others will be loaded on demand

  console.log("\nFinal cache state:");
  cacheLog();
}

// ============================================
// Example 8: Serverless Optimization
// ============================================

async function serverlessOptimization() {
  console.log("=== Serverless Optimization ===\n");

  // In serverless environments (Lambda, Vercel, etc.)
  // Global cache survives warm starts but not cold starts

  // Preload during function initialization
  console.log("Initializing serverless function...");
  await cachePreload(["resend"]);

  // Now handle multiple invocations efficiently
  for (let i = 1; i <= 3; i++) {
    console.log(`\nHandling invocation ${i}...`);
    await sendEmail({
      to: `user${i}@example.com`,
      from: "noreply@example.com",
      subject: `Email ${i}`,
      template: `<div>Invocation ${i}</div>`,
      provider: "resend",
    });
  }

  console.log("\nServerless function statistics:");
  cacheLog();
}

// ============================================
// Example 9: Cache Invalidation
// ============================================

async function cacheInvalidation() {
  console.log("=== Cache Invalidation ===\n");

  // Populate cache
  await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Initial",
    template: "<div>Initial email</div>",
    provider: "resend",
  });

  console.log("Initial cache:");
  cacheLog();

  // Scenario 1: Module updated during development
  console.log("\nScenario 1: Module updated - clearing cache");
  cacheDelete("module:resend");

  // Scenario 2: Complete cache reset
  console.log("\nScenario 2: Complete cache reset");
  cacheClear();

  console.log("\nAfter invalidation:");
  cacheLog();
}

// ============================================
// Example 10: Monitoring Cache Health
// ============================================

async function monitorCacheHealth() {
  console.log("=== Cache Health Monitoring ===\n");

  // Send some emails
  for (let i = 0; i < 5; i++) {
    await sendEmail({
      to: `user${i}@example.com`,
      from: "noreply@example.com",
      subject: `Email ${i}`,
      template: `<div>Email ${i}</div>`,
      provider: i % 2 === 0 ? "resend" : "nodemailer",
    });
  }

  // Analyze cache health
  const stats = cacheStats();
  const hitRate =
    stats.hits + stats.misses > 0 ? (stats.hits / (stats.hits + stats.misses)) * 100 : 0;

  console.log("\nCache Health Report:");
  console.log(`Total cached items: ${stats.size}`);
  console.log(`Cached modules: ${stats.keys.join(", ")}`);
  console.log(`Cache hits: ${stats.hits}`);
  console.log(`Cache misses: ${stats.misses}`);
  console.log(`Hit rate: ${hitRate.toFixed(1)}%`);

  // Recommendations
  if (hitRate < 50) {
    console.log("\n⚠️  Low hit rate detected!");
    console.log("Consider preloading adapters for better performance.");
  } else {
    console.log("\n✅ Cache is performing well!");
  }
}

// ============================================
// Example 11: Memory Management
// ============================================

async function memoryManagement() {
  console.log("=== Memory Management ===\n");

  // Load multiple adapters
  await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Test 1",
    template: "<div>Test 1</div>",
    provider: "resend",
  });

  await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Test 2",
    template: "<div>Test 2</div>",
    provider: "nodemailer",
  });

  await sendEmail({
    to: "user@example.com",
    from: "noreply@example.com",
    subject: "Test 3",
    template: "<div>Test 3</div>",
    provider: "sendgrid",
  });

  console.log("Memory usage (all adapters loaded):");
  cacheLog();

  // If memory is a concern, clear unused adapters
  console.log("\nClearing unused adapters (keeping only resend)...");
  cacheDelete("module:nodemailer");
  cacheDelete("module:@sendgrid/mail");

  console.log("\nAfter cleanup:");
  cacheLog();
}

// ============================================
// Run All Examples
// ============================================

async function runAllExamples() {
  await demonstrateAutomaticCaching();
  await preloadAdapters();
  await cacheManagement();
  await devVsProduction();
  await performanceComparison();
  await applicationStartup();
  await cacheWarmupStrategy();
  await serverlessOptimization();
  await cacheInvalidation();
  await monitorCacheHealth();
  await memoryManagement();
}

// Export examples
export {
  demonstrateAutomaticCaching,
  preloadAdapters,
  cacheManagement,
  devVsProduction,
  performanceComparison,
  applicationStartup,
  cacheWarmupStrategy,
  serverlessOptimization,
  cacheInvalidation,
  monitorCacheHealth,
  memoryManagement,
  runAllExamples,
};

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples()
    .then(() => console.log("\n✅ All examples completed!"))
    .catch((error) => console.error("\n❌ Error:", error));
}
