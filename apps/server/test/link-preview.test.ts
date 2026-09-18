import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHtml, assertSafeUrl } from "../src/services/link-preview-service";

test("parses Open Graph tags", () => {
  const html = `
    <html><head>
      <title>Fallback Title</title>
      <meta property="og:title" content="Real &amp; Title" />
      <meta property="og:description" content="A nice description" />
      <meta property="og:image" content="/img/cover.png" />
      <meta property="og:site_name" content="Example" />
    </head></html>`;
  const p = parseHtml(html, new URL("https://example.com/page"));
  assert.equal(p.title, "Real & Title");
  assert.equal(p.description, "A nice description");
  assert.equal(p.image, "https://example.com/img/cover.png"); // relative → absolute
  assert.equal(p.siteName, "Example");
});

test("falls back to <title> and twitter tags", () => {
  const html = `<head><title>Just A Title</title>
    <meta name="twitter:image" content="https://cdn.example.com/x.jpg"></head>`;
  const p = parseHtml(html, new URL("https://example.com/"));
  assert.equal(p.title, "Just A Title");
  assert.equal(p.image, "https://cdn.example.com/x.jpg");
});

test("blocks non-http protocols", async () => {
  await assert.rejects(() => assertSafeUrl("file:///etc/passwd"));
  await assert.rejects(() => assertSafeUrl("ftp://example.com"));
});

test("blocks localhost and private IPs (SSRF guard)", async () => {
  await assert.rejects(() => assertSafeUrl("http://localhost/admin"));
  await assert.rejects(() => assertSafeUrl("http://127.0.0.1/"));
  await assert.rejects(() => assertSafeUrl("http://10.0.0.5/"));
  await assert.rejects(() => assertSafeUrl("http://192.168.1.1/"));
  await assert.rejects(() => assertSafeUrl("http://169.254.169.254/latest/meta-data"));
});

test("accepts a public IP literal", async () => {
  const url = await assertSafeUrl("https://8.8.8.8/");
  assert.equal(url.hostname, "8.8.8.8");
});
