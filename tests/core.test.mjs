import assert from 'node:assert/strict';
import test from 'node:test';
import { createMockFlagsmithServer } from '../docker/mock-flagsmith.mjs';
import { findClosestFlagName, levenshtein, scanTextForFlags } from '../out/flagScanner.js';
import { FlagsmithClient } from '../out/flagsmithClient.js';

test('scanTextForFlags detects JS, React, Python, and Go Flagsmith SDK calls', () => {
  const sample = `
    // flagsmith.hasFeature('ignored_comment_flag')
    const a = flagsmith.hasFeature('new_checkout');
    const b = flagsmith.getValue("pricing_ab_test");
    const flags = useFlags(['dark_mode_neon', 'promo_banner_copy']);
    if flags.is_feature_enabled("py_flag"):
        pass
    if flags.IsFeatureEnabled("go_flag") {
    }
  `;

  const refs = scanTextForFlags(sample, 'sample.ts');
  const names = refs.map((r) => r.flagName);
  assert.deepEqual(names, [
    'new_checkout',
    'pricing_ab_test',
    'dark_mode_neon',
    'promo_banner_copy',
    'py_flag',
    'go_flag',
  ]);
});

test('findClosestFlagName catches typos with Levenshtein distance', () => {
  assert.equal(levenshtein('new_chekout', 'new_checkout'), 1);
  assert.equal(
    findClosestFlagName('new_chekout', ['new_checkout', 'dark_mode_neon', 'pricing_ab_test']),
    'new_checkout'
  );
  assert.equal(
    findClosestFlagName('completely_unrelated_xyz', ['new_checkout', 'dark_mode_neon']),
    undefined
  );
});

test('FlagsmithClient works end-to-end against local Flagsmith-compatible server', async () => {
  const server = createMockFlagsmithServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const client = new FlagsmithClient({
      apiUrl: `http://127.0.0.1:${port}`,
      apiToken: 'ser.test_org_token',
    });

    const projects = await client.getProjects();
    assert.equal(projects.length, 1);
    assert.equal(projects[0].name, 'ToggleShop Demo');

    const envs = await client.getEnvironments(projects[0].id);
    assert.equal(envs.length, 3);
    const devEnv = envs.find((e) => e.name === 'Development');
    assert.ok(devEnv);

    const features = await client.getFeatures(projects[0].id);
    assert.ok(features.some((f) => f.name === 'new_checkout'));

    const states = await client.getFeatureStates(devEnv.api_key);
    const checkoutFeature = features.find((f) => f.name === 'new_checkout');
    const checkoutState = states.find((s) => s.feature === checkoutFeature.id);
    assert.equal(checkoutState.enabled, true);

    // Toggle flag OFF
    const updated = await client.updateFeatureState(devEnv, checkoutFeature.id, checkoutState.id, {
      enabled: false,
      feature_state_value: 'express_v2',
    });
    assert.equal(updated.enabled, false);

    // Create a brand new flag
    const created = await client.createFeature(projects[0].id, {
      name: 'ai_copilot_checkout',
      description: 'Created in integration test',
      default_enabled: true,
    });
    assert.equal(created.name, 'ai_copilot_checkout');

    const featuresAfter = await client.getFeatures(projects[0].id);
    assert.ok(featuresAfter.some((f) => f.name === 'ai_copilot_checkout'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
