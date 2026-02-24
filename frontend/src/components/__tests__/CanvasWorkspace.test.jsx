import { describe, it, expect } from '@jest/globals';
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import CanvasWorkspace from '../CanvasWorkspace';
import '@testing-library/jest-dom';

const mockTemplate = {
  id: 't1',
  regions: [
    { id: 'r1', color: '#fff', glassType: 'Clear' },
    { id: 'r2', color: '#000', glassType: 'Opaque' },
  ],
};

describe('CanvasWorkspace', () => {
  it('renders template regions', () => {
    render(<CanvasWorkspace template={mockTemplate} />);
    expect(screen.getByTestId('region-r1')).toBeInTheDocument();
    expect(screen.getByTestId('region-r2')).toBeInTheDocument();
  });

  it('handles region click', () => {
    render(<CanvasWorkspace template={mockTemplate} />);
    fireEvent.click(screen.getByTestId('region-r1'));
    expect(screen.getByTestId('region-r1')).toHaveClass('selected');
  });

  it('applies color and glass type', () => {
    render(<CanvasWorkspace template={mockTemplate} />);
    fireEvent.click(screen.getByTestId('region-r1'));
    fireEvent.change(screen.getByTestId('color-picker'), { target: { value: '#ff0000' } });
    fireEvent.change(screen.getByTestId('glass-type-selector'), { target: { value: 'Stained' } });
    expect(screen.getByTestId('region-r1')).toHaveStyle('background-color: #ff0000');
    expect(screen.getByTestId('region-r1')).toHaveAttribute('data-glass-type', 'Stained');
  });

  it('undo/redo works', () => {
    render(<CanvasWorkspace template={mockTemplate} />);
    fireEvent.click(screen.getByTestId('region-r1'));
    fireEvent.change(screen.getByTestId('color-picker'), { target: { value: '#ff0000' } });
    fireEvent.click(screen.getByTestId('undo-btn'));
    expect(screen.getByTestId('region-r1')).toHaveStyle('background-color: #fff');
    fireEvent.click(screen.getByTestId('redo-btn'));
    expect(screen.getByTestId('region-r1')).toHaveStyle('background-color: #ff0000');
  });

  it('handles empty template', () => {
    render(<CanvasWorkspace template={{ id: 't2', regions: [] }} />);
    expect(screen.queryByTestId('region-r1')).not.toBeInTheDocument();
  });
});
