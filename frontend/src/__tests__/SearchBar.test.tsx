/**
 * Unit tests for SearchBar component
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBar } from '../components/SearchBar';
import type { SearchFilters } from '../components/SearchBar';

const defaultFilters: SearchFilters = { keyword: '', location: '', category: '' };
const categories = ['Plumbing', 'Electrician', 'Cleaning'];

describe('SearchBar', () => {
  it('renders keyword, location, and category inputs', () => {
    render(
      <SearchBar
        filters={defaultFilters}
        categories={categories}
        onChange={() => {}}
      />
    );

    expect(screen.getByPlaceholderText(/search providers/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/location/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders category options from props', () => {
    render(
      <SearchBar
        filters={defaultFilters}
        categories={categories}
        onChange={() => {}}
      />
    );

    expect(screen.getByText('Plumbing')).toBeInTheDocument();
    expect(screen.getByText('Electrician')).toBeInTheDocument();
    expect(screen.getByText('Cleaning')).toBeInTheDocument();
    expect(screen.getByText('All categories')).toBeInTheDocument();
  });

  it('calls onChange when keyword input changes', () => {
    const onChange = vi.fn();
    render(
      <SearchBar
        filters={defaultFilters}
        categories={categories}
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/search providers/i), {
      target: { value: 'plumber' },
    });

    expect(onChange).toHaveBeenCalledWith({
      keyword: 'plumber',
      location: '',
      category: '',
    });
  });

  it('calls onChange when location input changes', () => {
    const onChange = vi.fn();
    render(
      <SearchBar
        filters={defaultFilters}
        categories={categories}
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/location/i), {
      target: { value: 'New York' },
    });

    expect(onChange).toHaveBeenCalledWith({
      keyword: '',
      location: 'New York',
      category: '',
    });
  });

  it('calls onChange when category is selected', () => {
    const onChange = vi.fn();
    render(
      <SearchBar
        filters={defaultFilters}
        categories={categories}
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Plumbing' },
    });

    expect(onChange).toHaveBeenCalledWith({
      keyword: '',
      location: '',
      category: 'Plumbing',
    });
  });

  it('shows "Clear filters" button when any filter is active', () => {
    render(
      <SearchBar
        filters={{ keyword: 'plumber', location: '', category: '' }}
        categories={categories}
        onChange={() => {}}
      />
    );

    expect(screen.getByText(/clear filters/i)).toBeInTheDocument();
  });

  it('does not show "Clear filters" when all filters are empty', () => {
    render(
      <SearchBar
        filters={defaultFilters}
        categories={categories}
        onChange={() => {}}
      />
    );

    expect(screen.queryByText(/clear filters/i)).not.toBeInTheDocument();
  });

  it('clears all filters when "Clear filters" is clicked', () => {
    const onChange = vi.fn();
    render(
      <SearchBar
        filters={{ keyword: 'plumber', location: 'NY', category: 'Plumbing' }}
        categories={categories}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByText(/clear filters/i));

    expect(onChange).toHaveBeenCalledWith({
      keyword: '',
      location: '',
      category: '',
    });
  });

  it('displays result count when provided', () => {
    render(
      <SearchBar
        filters={defaultFilters}
        categories={categories}
        onChange={() => {}}
        resultCount={5}
      />
    );

    expect(screen.getByText(/5/)).toBeInTheDocument();
    expect(screen.getByText(/providers found/i)).toBeInTheDocument();
  });

  it('shows singular "provider found" for count of 1', () => {
    render(
      <SearchBar
        filters={defaultFilters}
        categories={categories}
        onChange={() => {}}
        resultCount={1}
      />
    );

    expect(screen.getByText(/1/)).toBeInTheDocument();
    expect(screen.getByText(/provider found/i)).toBeInTheDocument();
  });

  it('shows "Searching…" when loading', () => {
    render(
      <SearchBar
        filters={defaultFilters}
        categories={categories}
        onChange={() => {}}
        loading={true}
      />
    );

    expect(screen.getByText(/searching/i)).toBeInTheDocument();
  });

  it('reflects controlled input values', () => {
    render(
      <SearchBar
        filters={{ keyword: 'electrician', location: 'LA', category: 'Electrician' }}
        categories={categories}
        onChange={() => {}}
      />
    );

    expect(screen.getByPlaceholderText(/search providers/i)).toHaveValue('electrician');
    expect(screen.getByPlaceholderText(/location/i)).toHaveValue('LA');
    expect(screen.getByRole('combobox')).toHaveValue('Electrician');
  });
});
