import { afterEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { config } from '@/config/runtime';
import { AuthorLogo, BrandMark, Wordmark } from './Brand';

describe('Wordmark', () => {
  it('writes the last capitalised part of a one-word name in the accent colour', () => {
    const { container } = render(<Wordmark />);
    expect([...container.querySelectorAll('span span')].map((s) => s.textContent)).toEqual(['Mini', 'Geoportal']);
  });
});

describe('brand of the configuration', () => {
  const app = config.app;
  afterEach(() => {
    config.app = app;
  });

  it('shows the logo of the author, or the name when there is none', () => {
    const { container, rerender } = render(<AuthorLogo />);
    expect(container.querySelector('img')).toMatchObject({ alt: app.author.name });
    expect(container.querySelector('img')?.getAttribute('src')).toBe(app.author.logo);
    config.app = { ...app, author: { name: 'Gmina Przykładowa', url: app.author.url } };
    rerender(<AuthorLogo />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('Gmina Przykładowa');
  });

  it('draws the built-in sign in the colours of the skin, or shows the configured icon', () => {
    const { container, rerender } = render(<BrandMark />);
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('var(--mark, var(--accent))');
    config.app = { ...app, icon: '/brand/icon.svg?v=1' };
    rerender(<BrandMark />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/brand/icon.svg?v=1');
  });
});
