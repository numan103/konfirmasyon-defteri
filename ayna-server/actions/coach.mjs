import { fail } from '../http.mjs';

export default async function coach({ res }) {
  return fail(res, 400, 'bad_request');
}
