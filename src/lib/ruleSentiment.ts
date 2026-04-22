export type RuleSentiment = 'success' | 'warning' | 'failure' | 'idle';

const FAILURE_PATTERNS = [
  'did not pass',
  'didnt pass',
  "didn't pass",
  'not ok',
  'not okay',
  'no pass',
  'failed',
  'failure',
  'fail',
  'error',
  'invalid',
  'mismatch',
];

const WARNING_PATTERNS = [
  'unknown',
  'missing target',
  'missing targets',
  'missing property',
  'missing properties',
  'missing',
  'unclear',
  'unresolved',
  'not found',
  'no value',
];

const SUCCESS_PATTERNS = ['passed', 'pass', 'ok', 'okay', 'good', 'success', 'valid', 'conforms'];

export function classifyTerminalSentiment(
  text: string | null | undefined,
): Exclude<RuleSentiment, 'idle'> | null {
  if (!text) {
    return null;
  }

  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (FAILURE_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return 'failure';
  }
  if (WARNING_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return 'warning';
  }
  if (SUCCESS_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return 'success';
  }
  return null;
}

export function classifyTerminalSentimentFromMany(
  texts: Array<string | null | undefined>,
): Exclude<RuleSentiment, 'idle'> | null {
  let hasWarning = false;
  let hasSuccess = false;

  for (const text of texts) {
    const sentiment = classifyTerminalSentiment(text);
    if (sentiment === 'failure') {
      return 'failure';
    }
    if (sentiment === 'warning') {
      hasWarning = true;
    }
    if (sentiment === 'success') {
      hasSuccess = true;
    }
  }

  if (hasWarning) {
    return 'warning';
  }
  if (hasSuccess) {
    return 'success';
  }
  return null;
}
