import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReportDialog, useReport } from './ReportDialog';
import { stubFetch } from '@/test/helpers';

beforeEach(() => useReport.setState({ open: false, draft: '' }));

const openForm = async (draft?: string) => {
  render(<ReportDialog />);
  act(() => useReport.getState().openReport(draft));
  await screen.findByRole('button', { name: 'Wyślij zgłoszenie' });
};

describe('ReportDialog', () => {
  it('sends the report with the map view and thanks the user', async () => {
    const { fetchMock } = stubFetch([['/api/report', { enabled: true }]]);
    await openForm('Miejsce: PL-1992 X 1, Y 2\n\n');
    const text = screen.getByLabelText('Opis problemu') as HTMLTextAreaElement;
    expect(text.value).toBe('Miejsce: PL-1992 X 1, Y 2\n\n');
    fireEvent.change(text, { target: { value: 'Mapa nie wczytuje się po przybliżeniu.' } });
    fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: 'jan@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Wyślij zgłoszenie' }));
    await screen.findByText(/Dziękujemy/);
    const [, init] = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      category: 'mapa',
      message: 'Mapa nie wczytuje się po przybliżeniu.',
      email: 'jan@example.com',
      view: location.href,
      website: '',
    });
  });

  it('keeps the button off until the description is long enough and shows server errors', async () => {
    stubFetch([['/api/report', { enabled: true }]]);
    await openForm();
    const send = screen.getByRole('button', { name: 'Wyślij zgłoszenie' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Opis problemu'), { target: { value: 'Coś nie działa dobrze.' } });
    expect(send.disabled).toBe(false);
    stubFetch([[/\/api\/report$/, { error: 'email', message: 'Invalid e-mail address' }, { status: 400 }]]);
    fireEvent.click(send);
    expect(await screen.findByText('Nieprawidłowy adres e-mail.')).toBeTruthy();
  });

  it('says when the form is off on the server', async () => {
    stubFetch([['/api/report', { enabled: false }]]);
    render(<ReportDialog />);
    act(() => useReport.getState().openReport());
    await waitFor(() => expect(screen.getByText(/chwilowo niedostępny/)).toBeTruthy());
  });
});
