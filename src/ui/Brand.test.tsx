import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Wordmark } from './Brand';

describe('Wordmark', () => {
  it('writes the last capitalised part of a one-word name in the accent colour', () => {
    const { container } = render(<Wordmark />);
    expect([...container.querySelectorAll('span span')].map((s) => s.textContent)).toEqual(['Mini', 'Geoportal']);
  });
});
