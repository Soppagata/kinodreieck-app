import config from '/private/tmp/kd-review49-benefit-audit-20260917/playwright.private-v1.config.mjs';
export default {
  ...config,
  testDir: '/private/tmp/kd-review49-benefit-audit-20260917/tests/private-v1',
  outputDir: '/private/tmp/kd-review49-benefit-audit-evidence-20260917/private-v1-results',
  reporter: [['list']],
  webServer: { ...config.webServer, cwd: '/private/tmp/kd-review49-benefit-audit-20260917' },
};
