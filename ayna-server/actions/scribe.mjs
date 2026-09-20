import { fail } from '../http.mjs';

export default async function scribe({ res }) {
  return fail(res, 400, 'bad_request');
}

export async function runScribe() {
  throw new Error('not_implemented');
}
