import { fail } from '../http.mjs';

export default async function reflect({ res }) {
  return fail(res, 400, 'bad_request');
}
