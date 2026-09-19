const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

// Run against a local dev server. All backend traffic is mocked; no account is used.
async function main() {
  const env = fs.readFileSync('.env.local', 'utf8');
  const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=["']?([^\s"']+)/m)?.[1];
  assert.ok(url, 'Local public backend URL is required');
  const host = new URL(url).hostname;
  const paper = require('../src/data/items.generated.json').papers[0];
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && m.text().includes('Maximum update depth')) errors.push(m.text()); });
    let requests = 0;
    await page.route(`https://${host}/**`, async route => {
      if (route.request().url().includes('/storage/v1/object/sign/exam')) {
        requests++;
        const { paths } = route.request().postDataJSON();
        await route.fulfill({ json: paths.map(path => ({ path, signedURL: '/mock-question.svg', error: null })) });
      } else if (route.request().url().includes('mock-question.svg')) {
        await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><text x="20" y="40">Test question</text></svg>' });
      } else {
        await route.fulfill({ json: {} });
      }
    });
    await page.addInitScript(({ host }) => {
      localStorage.setItem(`sb-${host.split('.')[0]}-auth-token`, JSON.stringify({
        access_token: 'test-token', refresh_token: 'test-refresh', token_type: 'bearer',
        expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600,
        user: { id: 'test-student', aud: 'authenticated', role: 'authenticated' },
      }));
    }, { host });
    const base = process.env.TEST_BASE_URL || 'http://localhost:3100';
    await page.goto(`${base}/items`);
    await page.getByRole('heading', { name: '문제', exact: true }).waitFor();
    assert.ok(await page.locator('a[href^="/items/"]').count());
    await page.goto(`${base}/items/${paper.subjectCode}/${paper.unitId}`);
    const img = page.getByRole('img', { name: /번 문항/ });
    await img.waitFor();
    await page.waitForFunction(() => { const img = document.querySelector('img[alt$="번 문항"]'); return img?.complete && img.naturalWidth > 0; });
    const initialRequests = requests;
    const firstSrc = await img.getAttribute('src');
    const choice = page.getByRole('button', { name: '①', exact: true });
    if (await choice.count()) await choice.click();
    else await page.getByRole('button', { name: '서술형이에요 · 스스로 확인하고 넘어가기', exact: true }).click();
    await page.getByRole('button', { name: '다음 문항', exact: true }).click();
    await page.waitForTimeout(1000);
    assert.ok(await page.getByText(/^2\/\d+$/).count(), 'Next question must remain selected');
    assert.equal(requests, initialRequests, 'Answering must not reload signed URLs');
    assert.ok(firstSrc);
    assert.deepEqual(errors, []);
    console.log('PASS: subject list, image loading, next question, stable URL requests, no render loop');
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
