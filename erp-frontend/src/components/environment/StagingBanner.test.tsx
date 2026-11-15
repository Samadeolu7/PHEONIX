import * as React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StagingBanner } from './StagingBanner';
import { bannerText, isNonProductionBuild } from './envLabel';

describe('StagingBanner', () => {
  it('renders nothing for a production build (label unset)', () => {
    const { container } = render(<StagingBanner label="" />);
    expect(container).toBeEmptyDOMElement();
    expect(isNonProductionBuild('')).toBe(false);
    expect(isNonProductionBuild('production')).toBe(false);
  });

  it('shows the STAGING bar and prefixes the title on staging', () => {
    document.title = 'Phoenix';
    render(<StagingBanner label="staging" />);
    expect(screen.getByTestId('staging-banner')).toHaveTextContent('STAGING — test data only');
    expect(document.title).toBe('[STAGING] Phoenix');
    expect(bannerText('staging')).toMatch(/^STAGING/);
  });
});
