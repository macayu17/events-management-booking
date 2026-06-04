const asStringArray = (value) => {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
};

const uniqueNonEmptyStrings = (values) => {
  const seen = new Set();
  const result = [];

  asStringArray(values).forEach((value) => {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });

  return result;
};

export function normalizePollVoteSelection({ optionId, optionIds } = {}, allowMultiple = false) {
  const selectedOptionIds = uniqueNonEmptyStrings(
    Array.isArray(optionIds) ? optionIds : optionId
  );

  if (selectedOptionIds.length === 0) {
    const error = new Error('Select at least one option');
    error.statusCode = 400;
    throw error;
  }

  if (!allowMultiple && selectedOptionIds.length > 1) {
    const error = new Error('This poll allows only one answer');
    error.statusCode = 400;
    throw error;
  }

  return selectedOptionIds;
}

export function findInvalidPollOptionIds(pollOptions = [], selectedOptionIds = []) {
  const validOptionIds = new Set(pollOptions.map((option) => option.id));
  return selectedOptionIds.filter((optionId) => !validOptionIds.has(optionId));
}
