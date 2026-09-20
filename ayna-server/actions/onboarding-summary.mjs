import { fail } from '../http.mjs';

export default async function onboardingSummary({ res }) {
  return fail(res, 400, 'bad_request');
}
