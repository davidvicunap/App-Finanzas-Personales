/**
 * Prueba de la interfaz completa (en un navegador simulado):
 * registrar un gasto y un ingreso y ver el resumen actualizado.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import App from './App';
import { db } from './data/db';

describe('App', () => {
  it('registra un gasto con coma decimal y un ingreso, y el resumen cuadra', async () => {
    render(<App />);
    // Navegador de jsdom en inglés → la app arranca en inglés.
    await screen.findByText('Balance this month');

    // Gasto: "12,50" en Groceries
    fireEvent.click(screen.getAllByRole('button', { name: 'Add transaction' })[0]!);
    fireEvent.change(await screen.findByLabelText(/Amount/), { target: { value: '12,50' } });
    expect(screen.getByText('$12.50')).toBeTruthy(); // vista previa del monto
    fireEvent.click(screen.getByRole('radio', { name: /Groceries/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Ingreso: 3000
    fireEvent.click(screen.getAllByRole('button', { name: 'Add transaction' })[0]!);
    fireEvent.click(await screen.findByRole('radio', { name: /Income/ }));
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '3000' } });
    fireEvent.keyDown(screen.getByLabelText(/Amount/), { key: 'Enter' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // En la base de datos: enteros de centavos.
    const txs = await db.transactions.toArray();
    expect(txs.map((t) => t.amountCents).sort((a, b) => a - b)).toEqual([1250, 300000]);

    // En pantalla: 3000 − 12.50 = 2987.50; tasa de ahorro 99 % (truncada, no 100 %).
    await waitFor(() => expect(document.querySelector('.hero .balance')?.textContent).toBe('$2,987.50'));
    expect(screen.getByText('Savings rate 99%')).toBeTruthy();
    const breakdown = document.querySelector('.cat-list') as HTMLElement;
    expect(within(breakdown).getByText('Groceries')).toBeTruthy();
  });

  it('Enter con un monto inválido no guarda', async () => {
    render(<App />);
    await screen.findByText('Balance this month');
    const before = await db.transactions.count();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add transaction' })[0]!);
    const amount = await screen.findByLabelText(/Amount/);
    fireEvent.change(amount, { target: { value: '1.234' } }); // ambiguo → rechazado
    fireEvent.keyDown(amount, { key: 'Enter' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(await db.transactions.count()).toBe(before);
  });
});
