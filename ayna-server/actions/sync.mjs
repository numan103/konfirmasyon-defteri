import { fail } from '../http.mjs';

export default async function sync({ res }) {
  return fail(res, 400, 'bad_request');
}

export async function runSync() {
  return { trades: { skipped: true }, expenses: { skipped: true } };
}
