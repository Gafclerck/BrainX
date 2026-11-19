// @vitest-environment node
import { describe, it, expect } from 'vitest';
import viteConfig from '../vite.config';

describe('Vite Configuration Proxy (Matrix Row 4)', () => {
  it('defines development server proxy to Django backend http://127.0.0.1:8000', async () => {
    const config = typeof viteConfig === 'function'
      ? await viteConfig({ command: 'serve', mode: 'development' })
      : await viteConfig;

    expect(config.server?.proxy?.['/api']).toEqual({
      target: 'http://127.0.0.1:8000',
      changeOrigin: true,
    });
  });
});
